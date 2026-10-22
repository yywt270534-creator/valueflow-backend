const pool = require('../config/db');
const generateDealId = require('../utils/generateDealId');
const { supabase, BUCKET } = require('../supabase');

/**
 * Validate: ใครสามารถ cancel ได้
 * STEP_1: seller เท่านั้น | STEP_2: seller หรือ buyer
 */
function canCancelDeal(deal, userId) {
  const isSeller = deal.seller_id === userId;
  const isBuyer  = deal.buyer_id  === userId;
  if (deal.status === 'STEP_1_NEGOTIATION') return isSeller;
  if (deal.status === 'STEP_2_PAYMENT')     return isSeller || isBuyer;
  return false;
}

function canHideDeal(deal) {
  if (deal.status === 'STEP_5_COMPLETED') return true;
  if (deal.status === 'CANCELLED') return true;
  if (deal.status === 'STEP_1_NEGOTIATION') {
    const created = new Date(deal.created_at).getTime();
    return (Date.now() - created) > 7 * 24 * 60 * 60 * 1000;
  }
  return false;
}

/**
 * Validate: ใครสามารถ dispute ได้
 * STEP_3 ถึง RELEASE_PENDING: seller หรือ buyer
 */
function canDisputeDeal(deal, userId) {
  const isParty = deal.seller_id === userId || deal.buyer_id === userId;
  if (!isParty) return false;
  return ['STEP_3_SHIPPING', 'STEP_4_INSPECTION', 'RELEASE_PENDING'].includes(deal.status);
}/**
 * คำนวณยอดที่ seller ควรได้รับหลังหัก fee split
 */
function calcSellerReceivable(deal) {
  const price = parseFloat(deal.price) || 0;
  const fee = parseFloat(deal.escrow_fee_amount) || 0;
  const split = deal.escrow_fee_split;

  if (split === 'half')   return price - fee / 2;
  if (split === 'seller') return price - fee;
  if (split === 'buyer')  return price;
  return price - fee; // default: seller ออกทั้งหมด
}

/**
 * POST /api/deals
 * Seller สร้างดีลใหม่
 * Body: { productName, price, description?, shippingMethod? }
 */
exports.createDeal = async (req, res) => {
  const {
  productName, price, description, shippingMethod,
  category, duration, escrowFeeSplit, senderAddress, escrowFeeAmount
} = req.body;
  const sellerId = req.user.id;

  // 1. Validate input
  if (!productName || !price) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อสินค้าและราคา' });
  }
  const priceNum = Number(price);
const feeAmount = Number(escrowFeeAmount) || 0;
  if (isNaN(priceNum) || priceNum <= 0) {
    return res.status(400).json({ error: 'ราคาต้องเป็นตัวเลขมากกว่า 0' });
  }

  try {
    // 2. Generate unique deal_id (retry ถ้าชน)
    let dealId;
    let attempts = 0;
    while (attempts < 5) {
      dealId = generateDealId();
      const exists = await pool.query(
        'SELECT 1 FROM deals WHERE deal_id = $1',
        [dealId]
      );
      if (exists.rows.length === 0) break;
      attempts++;
    }
    if (attempts >= 5) {
      return res.status(500).json({ error: 'ไม่สามารถสร้างรหัสดีลได้ กรุณาลองใหม่' });
    }

    // 3. Insert ลง Database
    const shipping = shippingMethod 
      ? { method: shippingMethod, provider: null, trackingNumber: null }
      : {};

const result = await pool.query(
  `INSERT INTO deals 
    (deal_id, seller_id, product_name, price, fee, status, 
     shipping, escrow_status, description, category, duration, 
     escrow_fee_split, sender_address, escrow_fee_amount)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
   RETURNING *`,
  [
    dealId,
    sellerId,
    productName,
    priceNum,
    feeAmount,
    'STEP_1_NEGOTIATION',
    JSON.stringify(shipping),
    'PENDING',
    description || null,
    category || null,
    duration || null,
    escrowFeeSplit || 'half',
    senderAddress || null,
    feeAmount
  ]
);

    res.status(201).json({
      success: true,
      message: 'สร้างดีลสำเร็จ',
      deal: result.rows[0],
    });
  } catch (err) {
    console.error('Create Deal Error:', err);
    res.status(500).json({
      error: 'เกิดข้อผิดพลาดในการสร้างดีล',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

/**
 * GET /api/deals?role=seller|buyer|all
 * ดึงรายการดีลทั้งหมดของผู้ใช้ปัจจุบัน
 */
exports.getMyDeals = async (req, res) => {
  const userId = req.user.id;
  const role = req.query.role || 'all';

  try {
    let whereClause;
    let params;

    if (role === 'seller') {
      whereClause = 'd.seller_id = $1 AND d.hidden_by_seller = false';
      params = [userId];
    } else if (role === 'buyer') {
      whereClause = 'd.buyer_id = $1 AND d.hidden_by_buyer = false';
      params = [userId];
    } else {
      whereClause = '(d.seller_id = $1 AND d.hidden_by_seller = false) OR (d.buyer_id = $1 AND d.hidden_by_buyer = false)';
      params = [userId];
    }

    const result = await pool.query(
      `SELECT d.*,
              s.name AS seller_name,
              s.email AS seller_email,
              b.name AS buyer_name,
              b.email AS buyer_email
       FROM deals d
       LEFT JOIN users s ON s.id = d.seller_id
       LEFT JOIN users b ON b.id = d.buyer_id
       WHERE ${whereClause}
       ORDER BY d.updated_at DESC`,
      params
    );

    res.json({
      success: true,
      count: result.rows.length,
      deals: result.rows,
    });
  } catch (err) {
    console.error('Get My Deals Error:', err);
    res.status(500).json({
      error: 'เกิดข้อผิดพลาดในการดึงรายการดีล',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};


/**
 * GET /api/deals/:dealId
 * ดึงข้อมูลดีลตามรหัส (Buyer ใช้ตอน Join, Seller ใช้ตอนเปิดดู)
 */
exports.getDealById = async (req, res) => {
  const { dealId } = req.params;
  try {
    const result = await pool.query(
  `SELECT d.*, 
          s.name AS seller_name,
          s.email AS seller_email,
          b.name AS buyer_name,
          b.email AS buyer_email
   FROM deals d
   LEFT JOIN users s ON s.id = d.seller_id
   LEFT JOIN users b ON b.id = d.buyer_id
   WHERE d.deal_id = $1`,
  [dealId]
);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบดีลนี้' });
    }
    res.json({ success: true, deal: result.rows[0] });
  } catch (err) {
    console.error('Get Deal Error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลดีล' });
  }
};

/**
 * POST /api/deals/:dealId/join
 * Buyer เข้าร่วมดีลด้วยรหัส
 * Body: ไม่ต้องใช้ (dealId มาจาก URL)
 */
exports.joinDeal = async (req, res) => {
  const { dealId } = req.params;
  const buyerId = req.user.id;

  try {
    // 1. ดึงดีลตามรหัส
    const dealResult = await pool.query(
      'SELECT * FROM deals WHERE deal_id = $1',
      [dealId]
    );
    if (dealResult.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบดีลนี้ หรือรหัสไม่ถูกต้อง' });
    }
    const deal = dealResult.rows[0];

    // 2. ห้าม Seller เข้าร่วมดีลของตัวเอง
    if (deal.seller_id === buyerId) {
      return res.status(400).json({
        error: 'คุณเป็นผู้ขายของดีลนี้ ไม่สามารถเข้าร่วมเป็นผู้ซื้อได้'
      });
    }

    // 3. ถ้ามี Buyer แล้ว
    if (deal.buyer_id) {
      if (deal.buyer_id === buyerId) {
        return res.status(200).json({
          success: true,
          message: 'คุณเป็นผู้ซื้อของดีลนี้อยู่แล้ว',
          deal,
        });
      }
      return res.status(409).json({ error: 'ดีลนี้มีผู้ซื้อแล้ว' });
    }

    // 4. ตรวจ Status — เข้าร่วมได้เฉพาะ STEP_1_NEGOTIATION
    if (deal.status !== 'STEP_1_NEGOTIATION') {
      return res.status(400).json({
        error: `ดีลนี้ไม่อยู่ในสถานะที่เข้าร่วมได้ (สถานะปัจจุบัน: ${deal.status})`
      });
    }

    // 5. Atomic Update: WHERE buyer_id IS NULL กัน Race Condition
    const updated = await pool.query(
      `UPDATE deals
       SET buyer_id = $1,
           status = 'STEP_2_PAYMENT',
           updated_at = NOW()
       WHERE deal_id = $2 AND buyer_id IS NULL
       RETURNING *`,
      [buyerId, dealId]
    );

    // ถ้า rows.length = 0 แสดงว่ามีคนอื่น update ไปก่อนเสี้ยววินาที
    if (updated.rows.length === 0) {
      return res.status(409).json({
        error: 'มีผู้ซื้อรายอื่นเข้าร่วมดีลนี้ก่อนแล้ว กรุณาลองดีลอื่น'
      });
    }

    res.status(200).json({
      success: true,
      message: 'เข้าร่วมดีลสำเร็จ กรุณาดำเนินการชำระเงิน',
      deal: updated.rows[0],
    });
  } catch (err) {
    console.error('Join Deal Error:', err);
    res.status(500).json({
      error: 'เกิดข้อผิดพลาดในการเข้าร่วมดีล',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

/**
 * POST /api/deals/:dealId/confirm-payment
 * Buyer ยืนยันว่าชำระเงินแล้ว → ระบบพักเงิน
 * Body: { paymentMethod? } (เก็บไว้ก่อน รอ Payment Gateway จริง)
 */
exports.confirmPayment = async (req, res) => {
  const { dealId } = req.params;
  const userId = req.user.id;

  try {
    const dealResult = await pool.query(
      'SELECT * FROM deals WHERE deal_id = $1',
      [dealId]
    );
    if (dealResult.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบดีลนี้' });
    }
    const deal = dealResult.rows[0];

    // Permission: ต้องเป็น Buyer เท่านั้น
    if (deal.buyer_id !== userId) {
      return res.status(403).json({
        error: 'เฉพาะผู้ซื้อเท่านั้นที่ยืนยันการชำระเงินได้'
      });
    }

    // Idempotent: ถ้าจ่ายแล้ว → return 200 (ไม่ Error)
    if (deal.escrow_status === 'HELD') {
      return res.status(200).json({
        success: true,
        message: 'ยืนยันการชำระเงินแล้ว',
        deal,
      });
    }

    // ต้องอยู่ STEP_2_PAYMENT เท่านั้น
    if (deal.status !== 'STEP_2_PAYMENT') {
      return res.status(400).json({
        error: `ไม่สามารถยืนยันการชำระเงินได้ สถานะปัจจุบัน: ${deal.status}`
      });
    }

    // Atomic Update: กัน race condition
    const updated = await pool.query(
      `UPDATE deals
       SET status = 'STEP_3_SHIPPING',
           escrow_status = 'HELD',
           updated_at = NOW()
       WHERE deal_id = $1
         AND status = 'STEP_2_PAYMENT'
         AND escrow_status = 'PENDING'
         AND buyer_id = $2
       RETURNING *`,
      [dealId, userId]
    );

    if (updated.rows.length === 0) {
      return res.status(409).json({
        error: 'ไม่สามารถยืนยันได้ อาจมีการเปลี่ยนสถานะไปแล้ว กรุณารีเฟรช'
      });
    }

    res.status(200).json({
      success: true,
      message: 'ยืนยันการชำระเงินสำเร็จ กรุณารอผู้ขายจัดส่งสินค้า',
      deal: updated.rows[0],
    });
  } catch (err) {
    console.error('Confirm Payment Error:', err);
    res.status(500).json({
      error: 'เกิดข้อผิดพลาด',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

/**
 * POST /api/deals/:dealId/ship
 * Seller ยืนยันจัดส่ง + กรอก Tracking
 * Body: { trackingNumber, provider? }
 */
exports.shipDeal = async (req, res) => {
  const { dealId } = req.params;
  const { trackingNumber, provider } = req.body;
  const userId = req.user.id;

  // Validate: ถ้าเป็นวิธีจัดส่ง ต้องมี trackingNumber
  try {
    const dealResult = await pool.query(
      'SELECT * FROM deals WHERE deal_id = $1',
      [dealId]
    );
    if (dealResult.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบดีลนี้' });
    }
    const deal = dealResult.rows[0];

    // Permission: ต้องเป็น Seller
    if (deal.seller_id !== userId) {
      return res.status(403).json({
        error: 'เฉพาะผู้ขายเท่านั้นที่ยืนยันการจัดส่งได้'
      });
    }

    // ต้องอยู่ STEP_3_SHIPPING เท่านั้น
    if (deal.status !== 'STEP_3_SHIPPING') {
      return res.status(400).json({
        error: `ไม่สามารถยืนยันการจัดส่งได้ สถานะปัจจุบัน: ${deal.status}`
      });
    }

    // ถ้าเป็นวิธีจัดส่ง ต้องมี trackingNumber
    const method = deal.shipping?.method;
    if (method && method !== 'pickup' && !trackingNumber) {
      return res.status(400).json({
        error: 'กรุณากรอกเลขพัสดุ (Tracking Number)'
      });
    }

    // Merge shipping data — เก็บ method เดิมไว้
    const updatedShipping = {
      ...(deal.shipping || {}),
      provider: provider || deal.shipping?.provider || null,
      trackingNumber: trackingNumber || deal.shipping?.trackingNumber || null,
      shippedAt: new Date().toISOString(),
    };

    // Atomic Update
    const updated = await pool.query(
      `UPDATE deals
       SET status = 'STEP_4_INSPECTION',
           shipping = $1::jsonb,
           updated_at = NOW()
       WHERE deal_id = $2
         AND status = 'STEP_3_SHIPPING'
         AND seller_id = $3
       RETURNING *`,
      [JSON.stringify(updatedShipping), dealId, userId]
    );

    if (updated.rows.length === 0) {
      return res.status(409).json({
        error: 'ไม่สามารถยืนยันได้ อาจมีการเปลี่ยนสถานะไปแล้ว'
      });
    }

    res.status(200).json({
      success: true,
      message: 'ยืนยันการจัดส่งสำเร็จ กรุณารอผู้ซื้อตรวจรับ',
      deal: updated.rows[0],
    });
  } catch (err) {
    console.error('Ship Deal Error:', err);
    res.status(500).json({
      error: 'เกิดข้อผิดพลาด',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

/**
 * POST /api/deals/:dealId/confirm-receipt
 * Buyer ยืนยันรับสินค้า → เปลี่ยนสถานะเป็น RELEASE_PENDING
 * (แยกจากการปล่อยเงินจริง ตาม Spec ข้อ 12-13)
 */
exports.confirmReceipt = async (req, res) => {
  const { dealId } = req.params;
  const userId = req.user.id;

  try {
    const dealResult = await pool.query(
      'SELECT * FROM deals WHERE deal_id = $1',
      [dealId]
    );
    if (dealResult.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบดีลนี้' });
    }
    const deal = dealResult.rows[0];

    // Permission: ต้องเป็น Buyer
    if (deal.buyer_id !== userId) {
      return res.status(403).json({
        error: 'เฉพาะผู้ซื้อเท่านั้นที่ยืนยันรับสินค้าได้'
      });
    }

    // Idempotent: ถ้าอยู่ RELEASE_PENDING แล้ว → return 200
    if (deal.status === 'RELEASE_PENDING') {
      return res.status(200).json({
        success: true,
        message: 'ยืนยันรับสินค้าแล้ว กำลังรอระบบปล่อยเงิน',
        deal,
      });
    }

    // ต้องอยู่ STEP_4_INSPECTION เท่านั้น
    if (deal.status !== 'STEP_4_INSPECTION') {
      return res.status(400).json({
        error: `ไม่สามารถยืนยันรับสินค้าได้ สถานะปัจจุบัน: ${deal.status}`
      });
    }

    // Atomic Update
    const updated = await pool.query(
      `UPDATE deals
       SET status = 'RELEASE_PENDING',
           escrow_status = 'RELEASE_PENDING',
           updated_at = NOW()
       WHERE deal_id = $1
         AND status = 'STEP_4_INSPECTION'
         AND escrow_status = 'HELD'
         AND buyer_id = $2
       RETURNING *`,
      [dealId, userId]
    );

    if (updated.rows.length === 0) {
      return res.status(409).json({
        error: 'ไม่สามารถยืนยันได้ อาจมีการเปลี่ยนสถานะไปแล้ว'
      });
    }

    res.status(200).json({
      success: true,
      message: 'ยืนยันรับสินค้าสำเร็จ ระบบจะดำเนินการปล่อยเงินให้ผู้ขาย',
      deal: updated.rows[0],
    });
  } catch (err) {
    console.error('Confirm Receipt Error:', err);
    res.status(500).json({
      error: 'เกิดข้อผิดพลาด',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

/**
 * POST /api/deals/:dealId/release
 * ปล่อยเงินให้ผู้ขาย (MVP: ให้คู่สัญญาฝ่ายใดฝ่ายหนึ่ง trigger ได้)
 * Production: จะถูกเรียกโดย System/Webhook หลังตรวจ Dispute
 */
exports.releasePayment = async (req, res) => {
  const { dealId } = req.params;
  const userId = req.user.id;


  try {
    const dealResult = await pool.query(
      'SELECT * FROM deals WHERE deal_id = $1',
      [dealId]
    );
    if (dealResult.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบดีลนี้' });
    }
    const deal = dealResult.rows[0];

    const isParty = deal.buyer_id === userId || deal.seller_id === userId;
    if (!isParty) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ปล่อยเงินในดีลนี้' });
    }

    if (deal.escrow_status === 'RELEASED') {
      return res.status(200).json({
        success: true,
        message: 'ดีลนี้ปิดสำเร็จแล้ว',
        deal,
      });
    }

    if (deal.status !== 'RELEASE_PENDING' || deal.escrow_status !== 'RELEASE_PENDING') {
      return res.status(400).json({
        error: `ไม่สามารถปล่อยเงินได้ สถานะปัจจุบัน: ${deal.status} / ${deal.escrow_status}`,
      });
    }

    const updated = await pool.query(
      `UPDATE deals
       SET status = 'STEP_5_COMPLETED',
           escrow_status = 'RELEASED',
           released_at = NOW(),
           updated_at = NOW()
       WHERE deal_id = $1
         AND status = 'RELEASE_PENDING'
         AND escrow_status = 'RELEASE_PENDING'
       RETURNING *`,
      [dealId]
    );

    if (updated.rows.length === 0) {
      return res.status(409).json({
        error: 'ไม่สามารถปล่อยเงินได้ อาจมีการเปลี่ยนสถานะไปแล้ว',
      });
    }

    const releasedDeal = updated.rows[0];
    const sellerAmount = calcSellerReceivable(releasedDeal);

    try {
      await pool.query(
        `INSERT INTO wallet_transactions (user_id, deal_id, type, amount, note)
         VALUES ($1, $2, 'escrow_release', $3, $4)
         ON CONFLICT DO NOTHING`,
        [
          releasedDeal.seller_id,
          releasedDeal.deal_id,
          sellerAmount,
          `Released via deal ${releasedDeal.deal_id}`,
        ]
      );
    } catch (ledgerErr) {
      console.error('Ledger insert failed (deal already released?):', ledgerErr);
    }

    res.status(200).json({
      success: true,
      message: 'ปล่อยเงินสำเร็จ ดีลเสร็จสมบูรณ์',
      deal: releasedDeal,
    });
  } catch (err) {
    console.error('Release Payment Error:', err);
    res.status(500).json({
      error: 'เกิดข้อผิดพลาด',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

/**
 * POST /api/deals/:dealId/cancel
 * ยกเลิกดีล (ก่อนโอนเงินเท่านั้น)
 * Body: { reason }
 */
exports.cancelDeal = async (req, res) => {
  const { dealId } = req.params;
  const userId = req.user.id;
  const { reason } = req.body;

  if (!reason || reason.trim().length < 3) {
    return res.status(400).json({ error: 'กรุณาระบุเหตุผล (อย่างน้อย 3 ตัวอักษร)' });
  }

  try {
    const dealResult = await pool.query('SELECT * FROM deals WHERE deal_id = $1', [dealId]);
    if (dealResult.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบดีลนี้' });
    }
    const deal = dealResult.rows[0];

    if (deal.status === 'CANCELLED') {
      return res.status(200).json({ success: true, message: 'ดีลนี้ถูกยกเลิกแล้ว', deal });
    }

    if (!canCancelDeal(deal, userId)) {
      return res.status(403).json({
        error: 'คุณไม่มีสิทธิ์ยกเลิกดีลนี้ หรือดีลนี้เลยจุดที่ยกเลิกได้แล้ว',
      });
    }

    const updated = await pool.query(
      `UPDATE deals
       SET status = 'CANCELLED',
           cancelled_at = NOW(),
           cancelled_by = $1,
           cancel_reason = $2,
           updated_at = NOW()
       WHERE deal_id = $3
         AND status IN ('STEP_1_NEGOTIATION', 'STEP_2_PAYMENT')
         AND (seller_id = $1 OR buyer_id = $1)
       RETURNING *`,
      [userId, reason.trim(), dealId]
    );

    if (updated.rows.length === 0) {
      return res.status(409).json({ error: 'ไม่สามารถยกเลิกได้ สถานะอาจเปลี่ยนไปแล้ว' });
    }

    res.status(200).json({
      success: true,
      message: 'ยกเลิกดีลสำเร็จ',
      deal: updated.rows[0],
    });
  } catch (err) {
    console.error('Cancel Deal Error:', err);
    res.status(500).json({
      error: 'เกิดข้อผิดพลาดในการยกเลิกดีล',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

/**
 * POST /api/deals/:dealId/dispute
 * เปิดข้อพิพาท (หลังโอนเงินแล้วเท่านั้น)
 * Body: { reason, detail }
 */
exports.disputeDeal = async (req, res) => {
  const { dealId } = req.params;
  const userId = req.user.id;
  const { reason, detail } = req.body;

  if (!reason || reason.trim().length < 3) {
    return res.status(400).json({ error: 'กรุณาระบุเหตุผล' });
  }
  if (!detail || detail.trim().length < 10) {
    return res.status(400).json({ error: 'กรุณาอธิบายรายละเอียด (อย่างน้อย 10 ตัวอักษร)' });
  }

  try {
    const dealResult = await pool.query('SELECT * FROM deals WHERE deal_id = $1', [dealId]);
    if (dealResult.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบดีลนี้' });
    }
    const deal = dealResult.rows[0];

    if (deal.status === 'DISPUTED') {
      return res.status(200).json({ success: true, message: 'ดีลนี้เปิดข้อพิพาทอยู่แล้ว', deal });
    }

    if (!canDisputeDeal(deal, userId)) {
      return res.status(403).json({
        error: 'คุณไม่มีสิทธิ์เปิดข้อพิพาทในดีลนี้ หรือสถานะยังไม่ถึงขั้น',
      });
    }

    const updated = await pool.query(
      `UPDATE deals
       SET status = 'DISPUTED',
           disputed_at = NOW(),
           disputed_by = $1,
           dispute_reason = $2,
           dispute_detail = $3,
           updated_at = NOW()
       WHERE deal_id = $4
         AND status IN ('STEP_3_SHIPPING', 'STEP_4_INSPECTION', 'RELEASE_PENDING')
         AND (seller_id = $1 OR buyer_id = $1)
       RETURNING *`,
      [userId, reason.trim(), detail.trim(), dealId]
    );

    if (updated.rows.length === 0) {
      return res.status(409).json({ error: 'ไม่สามารถเปิดข้อพิพาทได้ สถานะอาจเปลี่ยนไปแล้ว' });
    }

    res.status(200).json({
      success: true,
      message: 'เปิดข้อพิพาทสำเร็จ ทีมงานจะติดต่อกลับภายใน 24 ชม.',
      deal: updated.rows[0],
    });
  } catch (err) {
    console.error('Dispute Deal Error:', err);
    res.status(500).json({
      error: 'เกิดข้อผิดพลาดในการเปิดข้อพิพาท',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

/**
 * POST /api/deals/:dealId/resolve
 * Admin resolve ข้อพิพาท
 * Body: { resolution, buyerAmount?, sellerAmount?, note? }
 */
exports.resolveDispute = async (req, res) => {
  const { dealId } = req.params;
  const adminId = req.user.id;
  const { resolution, buyerAmount, sellerAmount, note } = req.body;

  if (!['refund_buyer', 'release_seller', 'split'].includes(resolution)) {
    return res.status(400).json({
      error: 'resolution ต้องเป็น refund_buyer | release_seller | split',
    });
  }

  try {
    const dealResult = await pool.query('SELECT * FROM deals WHERE deal_id = $1', [dealId]);
    if (dealResult.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบดีลนี้' });
    }
    const deal = dealResult.rows[0];

    if (deal.status !== 'DISPUTED') {
      return res.status(400).json({ error: `ดีลนี้ไม่ได้อยู่ในสถานะพิพาท (ปัจจุบัน: ${deal.status})` });
    }

    const price = parseFloat(deal.price) || 0;
    const fee = parseFloat(deal.escrow_fee_amount) || 0;
    const splitType = deal.escrow_fee_split;

    const buyerFeeShare =
      splitType === 'buyer' ? fee : splitType === 'half' ? fee / 2 : 0;
    const sellerFeeShare =
      splitType === 'seller' ? fee : splitType === 'half' ? fee / 2 : 0;

    const buyerPaid = price + buyerFeeShare;
    const sellerReceivable = price - sellerFeeShare;
    const escrowTotal = price + fee;

    let buyerRefund = 0;
    let sellerRelease = 0;

    if (resolution === 'refund_buyer') {
      buyerRefund = buyerPaid;
    } else if (resolution === 'release_seller') {
      sellerRelease = sellerReceivable;
    } else {
      buyerRefund = parseFloat(buyerAmount) || 0;
      sellerRelease = parseFloat(sellerAmount) || 0;

      if (buyerRefund < 0 || sellerRelease < 0) {
        return res.status(400).json({ error: 'จำนวนเงินต้องไม่ติดลบ' });
      }
      if (buyerRefund + sellerRelease > escrowTotal) {
        return res.status(400).json({
          error: `ยอดรวม (${buyerRefund + sellerRelease}) เกิน escrow (${escrowTotal})`,
        });
      }
    }

    const updated = await pool.query(
      `UPDATE deals
       SET status = 'STEP_5_COMPLETED',
           escrow_status = 'RELEASED',
           released_at = NOW(),
           resolved_at = NOW(),
           resolved_by = $1,
           resolution = $2,
           updated_at = NOW()
       WHERE deal_id = $3
         AND status = 'DISPUTED'
       RETURNING *`,
      [adminId, resolution, dealId]
    );

    if (updated.rows.length === 0) {
      return res.status(409).json({ error: 'ไม่สามารถ resolve ได้ สถานะอาจเปลี่ยนไปแล้ว' });
    }

    const ledgerNote = `Dispute resolved (${resolution})${note ? ' — ' + note : ''}`;

    try {
      if (buyerRefund > 0 && deal.buyer_id) {
        await pool.query(
          `INSERT INTO wallet_transactions (user_id, deal_id, type, amount, note)
           VALUES ($1, $2, 'escrow_refund', $3, $4)
           ON CONFLICT DO NOTHING`,
          [deal.buyer_id, deal.deal_id, buyerRefund, ledgerNote]
        );
      }
      if (sellerRelease > 0) {
        await pool.query(
          `INSERT INTO wallet_transactions (user_id, deal_id, type, amount, note)
           VALUES ($1, $2, 'escrow_release', $3, $4)
           ON CONFLICT DO NOTHING`,
          [deal.seller_id, deal.deal_id, sellerRelease, ledgerNote]
        );
      }
    } catch (ledgerErr) {
      console.error('Ledger insert during resolve failed:', ledgerErr);
    }

    res.status(200).json({
      success: true,
      message: 'resolve ข้อพิพาทสำเร็จ',
      deal: updated.rows[0],
      ledger: { buyerRefund, sellerRelease },
    });
  } catch (err) {
    console.error('Resolve Dispute Error:', err);
    res.status(500).json({
      error: 'เกิดข้อผิดพลาดในการ resolve',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};  

/**
 * POST /api/deals/:dealId/evidence
 * Seller อัปโหลดหลักฐาน — max 5 ไฟล์/ดีล, 2MB/ไฟล์
 */
exports.uploadEvidence = async (req, res) => {
  const { dealId } = req.params;
  const userId = req.user.id;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'กรุณาแนบไฟล์' });
    }

    const dealResult = await pool.query('SELECT * FROM deals WHERE deal_id = $1', [dealId]);
    if (dealResult.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบดีลนี้' });
    }
    const deal = dealResult.rows[0];

    if (deal.seller_id !== userId) {
      return res.status(403).json({ error: 'เฉพาะผู้ขายเท่านั้นที่อัปโหลดหลักฐานได้' });
    }

    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS cnt FROM deal_evidence WHERE deal_id = $1',
      [deal.deal_id]
    );
    if (countResult.rows[0].cnt >= 5) {
      return res.status(400).json({ error: 'อัปโหลดครบ 5 ไฟล์แล้ว' });
    }

    const file = req.file;
    const ext = file.originalname.split('.').pop().toLowerCase();
    const storagePath = `${deal.deal_id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });
    if (uploadErr) {
      console.error('Supabase upload error:', uploadErr);
      return res.status(500).json({ error: 'อัปโหลดไฟล์ไม่สำเร็จ', details: uploadErr.message });
    }

    const insertResult = await pool.query(
      `INSERT INTO deal_evidence
         (deal_id, uploaded_by, phase, file_url, file_name, mime_type, file_size)
       VALUES ($1, $2, 'shipping', $3, $4, $5, $6)
       RETURNING *`,
      [deal.deal_id, userId, storagePath, file.originalname, file.mimetype, file.size]
    );

    res.status(201).json({
      success: true,
      message: 'อัปโหลดหลักฐานสำเร็จ',
      evidence: insertResult.rows[0],
    });
  } catch (err) {
    console.error('Upload Evidence Error:', err);
    res.status(500).json({
      error: 'เกิดข้อผิดพลาด',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

/**
 * GET /api/deals/:dealId/evidence
 * ดึงรายการหลักฐาน + signed URL (1 ชั่วโมง)
 */
exports.getEvidence = async (req, res) => {
  const { dealId } = req.params;
  const userId = req.user.id;

  try {
    const dealResult = await pool.query('SELECT * FROM deals WHERE deal_id = $1', [dealId]);
    if (dealResult.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบดีลนี้' });
    }
    const deal = dealResult.rows[0];

    const isParty = deal.seller_id === userId || deal.buyer_id === userId;
    if (!isParty && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ดูหลักฐานของดีลนี้' });
    }

    const result = await pool.query(
      'SELECT * FROM deal_evidence WHERE deal_id = $1 ORDER BY created_at ASC',
      [deal.deal_id]
    );

    const items = await Promise.all(
      result.rows.map(async (row) => {
        const { data } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(row.file_url, 3600);
        return { ...row, signed_url: data?.signedUrl || null };
      })
    );

    res.json({ success: true, count: items.length, evidence: items });
  } catch (err) {
    console.error('Get Evidence Error:', err);
    res.status(500).json({
      error: 'เกิดข้อผิดพลาด',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

exports.hideDeal = async (req, res) => {
  const { dealId } = req.params;
  const userId = req.user.id;

  try {
    const dealResult = await pool.query('SELECT * FROM deals WHERE deal_id = $1', [dealId]);
    if (dealResult.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบดีลนี้' });
    }
    const deal = dealResult.rows[0];

    const isSeller = deal.seller_id === userId;
    const isBuyer = deal.buyer_id === userId;

    if (!isSeller && !isBuyer) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ในดีลนี้' });
    }

    if (!canHideDeal(deal)) {
      return res.status(400).json({ error: 'ไม่สามารถซ่อนดีลนี้ได้ (สถานะไม่เหมาะสม หรือยังไม่ครบ 7 วัน)' });
    }

    const columnToUpdate = isSeller ? 'hidden_by_seller' : 'hidden_by_buyer';
    
    const updated = await pool.query(
      `UPDATE deals
       SET ${columnToUpdate} = true,
           updated_at = NOW()
       WHERE deal_id = $1
       RETURNING *`,
      [dealId]
    );

    res.status(200).json({
      success: true,
      message: 'ซ่อนดีลสำเร็จ',
      deal: updated.rows[0],
    });
  } catch (err) {
    console.error('Hide Deal Error:', err);
    res.status(500).json({
      error: 'เกิดข้อผิดพลาด',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};