const express = require('express');
const router = express.Router();

// 1. นำเข้า Controller (ระบุชื่อใน { } ให้ตรงกับที่ export มาจาก notificationController.js)
const { getNotifications, markAsRead } = require('../controllers/notificationController');

// 2. นำเข้า Auth Middleware สำหรับตรวจสอบ JWT Token
const authMiddleware = require('../middleware/authMiddleware');

// ==========================================
// เส้นทาง API สำหรับระบบแจ้งเตือน (Notification Routes)
// ==========================================

// ดึงรายการแจ้งเตือนทั้งหมดของผู้ใช้
router.get('/', authMiddleware, getNotifications);

// อัปเดตสถานะการแจ้งเตือนเฉพาะรายการเป็นอ่านแล้ว
router.put('/:id/read', authMiddleware, markAsRead);

module.exports = router;