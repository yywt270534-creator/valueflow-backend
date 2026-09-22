const db = require('../config/db');

// ==========================================
// 1. ฟังก์ชันสร้างดีลใหม่ (Create Deal)
// ==========================================
const createDeal = async (req, res) => {
  try {
    const title = req.body.title || req.body.description || req.body.name;
    const rawAmount = req.body.amount || req.body.price;
    const amount = parseFloat(rawAmount);

    if (!title || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ 
        error: 'Invalid payload or amount',
        details: 'กรุณาระบุชื่อดีลและจำนวนเงินที่ถูกต้อง (จำนวนเงินต้องมากกว่า 0)' 
      });
    }

    const userId = req.user.id;
    const buyerId = req.body.buyer_id || userId;
    const sellerId = req.body.seller_id;

    // บังคับว่าต้องมี seller_id ที่ชัดเจน ห้ามเป็นค่าว่างเพื่อป้องกันการสวมสิทธิ์
    if (!sellerId) {
      return res.status(400).json({ error: 'Missing seller_id: ทุกดีลต้องระบุผู้ขายให้ชัดเจน' });
    }

    if (buyerId === sellerId) {
      return res.status(400).json({ error: 'Buyer and Seller cannot be the same user' });
    }

    const newDeal = await db.query(
      `INSERT INTO deals (title, amount, buyer_id, seller_id, status) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title, amount, buyerId, sellerId, 'pending']
    );

    res.status(201).json({
      message: 'สร้างดีลสำเร็จ',
      deal: newDeal.rows[0]
    });

  } catch (error) {
    console.error('Create Deal Error:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างดีลที่เซิร์ฟเวอร์' });
  }
};

// ==========================================
// 2. ดูรายการดีลของฉัน (Get My Deals)
// ==========================================
const getMyDeals = async (req, res) => {
  const userId = req.user.id;
  try {
    const deals = await db.query(
      'SELECT * FROM deals WHERE buyer_id = $1 OR seller_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    res.json(deals.rows);
  } catch (err) {
    console.error('getMyDeals Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch deals' });
  }
};

// ==========================================
// 3. ดูรายละเอียดดีลเฉพาะเจาะจง (Get Deal by ID)
// ==========================================
const getDealById = async (req, res) => {
  const dealId = req.params.id || req.params.dealId;
  const userId = req.user.id;
  
  try {
    const deal = await db.query('SELECT * FROM deals WHERE id = $1', [dealId]);
    if (deal.rows.length === 0) return res.status(404).json({ error: 'Deal not found' });

    const currentDeal = deal.rows[0];
    if (currentDeal.buyer_id !== userId && currentDeal.seller_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized to view this deal' });
    }

    res.json(currentDeal);
  } catch (err) {
    console.error('getDealById Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch deal' });
  }
};

// ==========================================
// 4. Strict State Machine & Strict Role Check
// ==========================================
const updateDealStatus = async (req, res) => {
  const dealId = req.params.id || req.params.dealId;
  const { nextStatus } = req.body;
  const userId = req.user.id;
  const userSystemRole = req.user.role;

  const client = await db.pool.connect(); 

  try {
    await client.query('BEGIN');

    // Lock Row ป้องกัน Race Condition
    const dealResult = await client.query('SELECT * FROM deals WHERE id = $1 FOR UPDATE', [dealId]);
    if (dealResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    const deal = dealResult.rows[0];
    const currentStatus = deal.status;

    const isBuyer = deal.buyer_id === userId;
    const isSeller = deal.seller_id === userId;
    const isAdmin = userSystemRole === 'admin';

    if (!isBuyer && !isSeller && !isAdmin) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Unauthorized: Not part of this deal' });
    }

    const actorRole = isAdmin ? 'admin' : (isSeller ? 'seller' : 'buyer');

    // กำหนดเส้นทางและสิทธิ์ที่ถูกต้องตามหลักการ Escrow 100%
    const allowedTransitions = {
      'pending': { 
        next: ['paid', 'cancelled'], 
        allowedRoles: { 'paid': ['buyer', 'admin'], 'cancelled': ['buyer', 'seller', 'admin'] } 
      },
      'paid': { 
        next: ['delivered', 'disputed'], 
        allowedRoles: { 'delivered': ['seller', 'admin'], 'disputed': ['buyer', 'seller', 'admin'] } 
      },
      'delivered': { 
        next: ['inspected', 'disputed'], 
        allowedRoles: { 'inspected': ['buyer', 'admin'], 'disputed': ['buyer', 'seller', 'admin'] } 
      },
      'inspected': { 
        next: ['completed', 'disputed'], 
        allowedRoles: { 'completed': ['admin'], 'disputed': ['buyer', 'seller', 'admin'] } 
      },
      'disputed': { 
        next: ['completed', 'refunded'], 
        allowedRoles: { 'completed': ['admin'], 'refunded': ['admin'] } 
      }
    };

    const currentRules = allowedTransitions[currentStatus];

    if (!currentRules || !currentRules.next.includes(nextStatus)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Invalid transition from ${currentStatus} to ${nextStatus}` });
    }

    // ตรวจสอบสิทธิ์ขาดจาก Role จริง ห้ามสลับฝั่งกดเด็ดขาด
    const permittedRolesForThisStep = currentRules.allowedRoles[nextStatus] || [];
    const hasPermission = isAdmin || permittedRolesForThisStep.includes(actorRole);

    if (!hasPermission) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: `Role '${actorRole}' is not allowed to transition from ${currentStatus} to ${nextStatus}` });
    }

    const updatedDeal = await client.query(
      'UPDATE deals SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [nextStatus, dealId]
    );

    await client.query(
      `INSERT INTO deal_logs (deal_id, actor_role, previous_status, new_status) VALUES ($1, $2, $3, $4)`,
      [dealId, actorRole, currentStatus, nextStatus]
    );

    await client.query('COMMIT');
    res.json({ message: 'Status updated successfully', deal: updatedDeal.rows[0] });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('updateDealStatus Error:', err.message);
    res.status(500).json({ error: 'Failed to update deal status' });
  } finally {
    client.release();
  }
};

module.exports = { 
  createDeal, 
  getMyDeals, 
  getDealById, 
  updateDealStatus 
};