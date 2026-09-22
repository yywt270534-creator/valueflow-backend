const db = require('../config/db');

// 1. ดึงข้อความแชททั้งหมดของดีล
const getDealChats = async (req, res) => {
  const { dealId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    // ตรวจสอบสิทธิ์: ผู้ใช้ต้องเป็น buyer, seller หรือ admin เท่านั้น
    const deal = await db.query(
      'SELECT buyer_id, seller_id FROM deals WHERE id = $1', 
      [dealId]
    );

    if (deal.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลดีลนี้' });
    }

    const { buyer_id, seller_id } = deal.rows[0];
    if (buyer_id !== userId && seller_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลแชทของดีลนี้' });
    }

    // ดึงประวัติแชทพร้อมข้อมูลผู้ส่ง
    const chats = await db.query(
      `SELECT c.id, c.sender_id, c.message, c.created_at, u.email as sender_email 
       FROM deal_chats c
       JOIN users u ON c.sender_id = u.id
       WHERE c.deal_id = $1
       ORDER BY c.created_at ASC`,
      [dealId]
    );

    res.status(200).json({ success: true, data: chats.rows });
  } catch (err) {
    console.error('getDealChats Error:', err.message);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อความแชท' });
  }
};

// 2. ส่งข้อความแชทใหม่ในดีล
const sendMessage = async (req, res) => {
  const { dealId } = req.params;
  const { message } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  if (!message || message.trim() === '') {
    return res.status(400).json({ success: false, message: 'กรุณากรอกข้อความ' });
  }

  try {
    // ตรวจสอบสิทธิ์คู่ค้าในดีลก่อนบันทึก
    const deal = await db.query(
      'SELECT buyer_id, seller_id FROM deals WHERE id = $1', 
      [dealId]
    );

    if (deal.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลดีลนี้' });
    }

    const { buyer_id, seller_id } = deal.rows[0];
    if (buyer_id !== userId && seller_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์ส่งข้อความในดีลนี้' });
    }

    // บันทึกข้อความแชทใหม่
    const newChat = await db.query(
      `INSERT INTO deal_chats (deal_id, sender_id, message) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [dealId, userId, message]
    );

    res.status(201).json({
      success: true,
      message: 'ส่งข้อความสำเร็จ',
      data: newChat.rows[0]
    });
  } catch (err) {
    console.error('sendMessage Error:', err.message);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการส่งข้อความ' });
  }
};

module.exports = {
  getDealChats,
  sendMessage
};