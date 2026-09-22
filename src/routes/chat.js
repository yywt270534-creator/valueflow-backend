const express = require('express');
const router = express.Router();

// นำเข้า Controller
const { getDealChats, sendMessage } = require('../controllers/chatController');

// นำเข้า Middleware ตรวจสอบสิทธิ์ (นำเข้าเป็นฟังก์ชันโดยตรง)
const authMiddleware = require('../middleware/authMiddleware');

// ==========================================
// เส้นทาง API สำหรับระบบแชท (Chat Routes)
// ==========================================

// 1. ดึงข้อความแชททั้งหมดตาม dealId
router.get('/:dealId', authMiddleware, getDealChats);
router.get('/:dealId/chats', authMiddleware, getDealChats); // รองรับ Path /:dealId/chats

// 2. ส่งข้อความแชทใหม่ตาม dealId
router.post('/:dealId', authMiddleware, sendMessage);
router.post('/:dealId/chats', authMiddleware, sendMessage); // รองรับ Path /:dealId/chats

module.exports = router;