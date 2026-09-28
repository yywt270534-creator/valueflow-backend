const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // ปรับ path ตามโครงสร้างจริงของโปรเจกต์
const jwt = require('jsonwebtoken');

// Middleware ตรวจสอบ Token
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'ไม่พบ Token การยืนยันตัวตน' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ' });
  }
};

// 1. GET: ดึงรายการดีลทั้งหมด (/api/deals)
router.get('/', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    let query = `SELECT * FROM deals ORDER BY created_at DESC`;
    let params = [];

    if (userRole !== 'admin') {
      query = `
        SELECT * FROM deals 
        WHERE buyer_id = $1 OR seller_id = $1 
        ORDER BY created_at DESC
      `;
      params = [userId];
    }

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Get All Deals Error:', err.message);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
  }
});

// 2. GET: ดึงรายการดีลของฉัน (/api/deals/my-deals)
router.get('/my-deals', verifyToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const query = `
      SELECT * FROM deals 
      WHERE buyer_id = $1 OR seller_id = $1 
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query, [userId]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Get My Deals Error:', err.message);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
  }
});

// 3. PUT: อัปเดตสถานะดีล (/api/deals/:dealId/status)
router.put('/:dealId/status', verifyToken, async (req, res) => {
  const { dealId } = req.params;
  const { nextStatus } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  const validStatuses = ['pending', 'paid', 'delivered', 'inspected', 'completed', 'cancelled'];
  if (!validStatuses.includes(nextStatus)) {
    return res.status(400).json({ error: 'สถานะไม่ถูกต้องตามเงื่อนไขระบบ' });
  }

  try {
    const dealQuery = await pool.query(`SELECT * FROM deals WHERE id = $1`, [dealId]);
    if (dealQuery.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบดีลนี้ในระบบ' });
    }
    const deal = dealQuery.rows[0];

    const isBuyer = deal.buyer_id === userId;
    const isSeller = deal.seller_id === userId;
    const isAdmin = userRole === 'admin';

    let isAuthorized = false;
    if (deal.status === 'pending' && nextStatus === 'paid' && isBuyer) isAuthorized = true;
    if (deal.status === 'pending' && nextStatus === 'cancelled' && isBuyer) isAuthorized = true;
    if (deal.status === 'paid' && nextStatus === 'delivered' && (isSeller || isAdmin)) isAuthorized = true;
    if (deal.status === 'delivered' && nextStatus === 'inspected' && (isBuyer || isAdmin)) isAuthorized = true;
    if (deal.status === 'inspected' && nextStatus === 'completed' && isAdmin) isAuthorized = true;

    if (!isAuthorized) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เปลี่ยนสถานะดีลนี้ในขั้นตอนนี้' });
    }

    const updateResult = await pool.query(
      `UPDATE deals SET status = $1 WHERE id = $2 RETURNING *`,
      [nextStatus, dealId]
    );

    const updatedDeal = updateResult.rows[0];
    const io = req.app.get('io');
    if (io) io.to(`deal_${dealId}`).emit('deal_status_updated', updatedDeal);

    res.json({
      success: true,
      message: 'อัปเดตสถานะดีลสำเร็จ',
      data: updatedDeal
    });
  } catch (err) {
    console.error('Update Deal Status Error:', err.message);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
  }
});

module.exports = router;