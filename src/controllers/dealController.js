const pool = require('../config/db');
const generateDealId = require('../utils/generateDealId');

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
      whereClause = 'd.seller_id = $1';
      params = [userId];
    } else if (role === 'buyer') {
      whereClause = 'd.buyer_id = $1';
      params = [userId];
    } else {
      whereClause = '(d.seller_id = $1 OR d.buyer_id = $1)';
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

    // Permission: ต้องเป็น Buyer หรือ Seller ของดีลนี้
    const isParty = deal.buyer_id === userId || deal.seller_id === userId;
    if (!isParty) {
      return res.status(403).json({
        error: 'คุณไม่มีสิทธิ์ปล่อยเงินในดีลนี้'
      });
    }

    // Idempotent: ถ้าปล่อยแล้ว → return 200
    if (deal.escrow_status === 'RELEASED') {
      return res.status(200).json({
        success: true,
        message: 'ดีลนี้ปิดสำเร็จแล้ว',
        deal,
      });
    }

    // ต้องอยู่ RELEASE_PENDING เท่านั้น
    if (deal.status !== 'RELEASE_PENDING' || deal.escrow_status !== 'RELEASE_PENDING') {
      return res.status(400).json({
        error: `ไม่สามารถปล่อยเงินได้ สถานะปัจจุบัน: ${deal.status} / ${deal.escrow_status}`
      });
    }

    // Atomic Update
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
        error: 'ไม่สามารถปล่อยเงินได้ อาจมีการเปลี่ยนสถานะไปแล้ว'
      });
    }

    res.status(200).json({
      success: true,
      message: 'ปล่อยเงินสำเร็จ ดีลเสร็จสมบูรณ์',
      deal: updated.rows[0],
    });
  } catch (err) {
    console.error('Release Payment Error:', err);
    res.status(500).json({
      error: 'เกิดข้อผิดพลาด',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};