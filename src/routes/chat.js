const express = require('express');
const router = express.Router();
const { getDealChats, sendMessage } = require('../controllers/chatController');
const authMiddleware = require('../middleware/authMiddleware');

// ✅ 1. วาง Route เฉพาะ (ถ้ามี) ไว้ด้านบนสุดก่อน
// เช่น ถ้ารวม /my-deals ไว้ที่นี่ด้วย ต้องไว้บนสุด (แต่ถ้าอยู่เดลอยู่แล้ว ให้เช็กข้อ 2)

// ✅ 2. วาง Route ที่มี Parameter ไว้ด้านล่างสุดเสมอ ห้ามเอาขึ้นก่อน
router.get('/:dealId/chats', authMiddleware, getDealChats);
router.get('/:dealId', authMiddleware, getDealChats);
router.post('/:dealId/messages', authMiddleware, sendMessage);

module.exports = router;