const db = require('../config/db');

// 1. ดึงรายการแจ้งเตือนทั้งหมดของผู้ใช้งานที่ล็อกอินอยู่
const getNotifications = async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await db.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    console.error('getNotifications Error:', err.message);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลการแจ้งเตือน' });
  }
};

// 2. อัปเดตสถานะการแจ้งเตือนเป็น "อ่านแล้ว" (is_read = true)
const markAsRead = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const result = await db.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบรายการแจ้งเตือนนี้' });
    }

    res.status(200).json({
      success: true,
      message: 'อัปเดตสถานะการแจ้งเตือนสำเร็จ',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('markAsRead Error:', err.message);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการอัปเดตการแจ้งเตือน' });
  }
};

// ส่งออกฟังก์ชันทั้งหมดเป็น Object
module.exports = {
  getNotifications,
  markAsRead
};