const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');

// ดึงการเชื่อมต่อ Database Pool (ปรับ Path ถอยหลังตามโครงสร้างจริงของคุณ เช่น '../config/db')
let pool;
try {
  pool = require('../config/db');
} catch (err) {
  pool = require('../../config/db');
}

/**
 * @route   GET /api/users/profile
 * @desc    ดึงข้อมูลโปรไฟล์ผู้ใช้ที่ผ่านการยืนยันตัวตนแล้ว
 * @access  Private (ต้องแนบ Token มาใน Header)
 */
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    // 1. ดึง userId จาก payload ที่ถอดรหัสผ่าน authMiddleware
    const userId = req.user.id;

    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    // 2. Query ข้อมูลจากฐานข้อมูล PostgreSQL
    const query = 'SELECT id, email, created_at FROM users WHERE id = $1';
    const result = await pool.query(query, [userId]);

    // 3. ตรวจสอบว่าพบผู้ใช้หรือไม่
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลผู้ใช้ในระบบ' });
    }

    // 4. ส่งข้อมูลโปรไฟล์กลับไปที่ Frontend
    return res.status(200).json({
      message: 'ดึงข้อมูลโปรไฟล์สำเร็จ',
      user: result.rows[0]
    });

  } catch (err) {
    console.error('❌ Profile route error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;