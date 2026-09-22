const express = require('express');
const router = express.Router();

// 1. นำเข้า Route ย่อยสำหรับจัดการดีล (Deal Routes)
const dealRoutes = require('./dealRoutes');

// 2. เชื่อมต่อ Route ย่อยเข้ากับ Path หลัก /deals
// เมื่อ Client เรียก /api/deals ระบบจะส่ง Request ไปจัดการที่ dealRoutes
router.use('/deals', dealRoutes);

// 3. ส่งออก Router หลักเพื่อให้ app.js นำไปใช้งานต่อ
module.exports = router;