const express = require('express');
const router = express.Router();

// นำเข้า Controller
const { 
  createDeal, 
  getMyDeals, 
  getDealById, 
  updateDealStatus 
} = require('../controllers/dealController');

// นำเข้า Middleware ตรวจสอบสิทธิ์
const authMiddleware = require('../middleware/authMiddleware');

// กำหนดเส้นทาง API สำหรับ Deal
router.post('/', authMiddleware, createDeal);
router.get('/my-deals', authMiddleware, getMyDeals);
router.get('/:id', authMiddleware, getDealById);
router.put('/:id/status', authMiddleware, updateDealStatus);

// จุดสำคัญที่สุด: ต้องส่งออก router ออกไปโดยตรง
module.exports = router;