const express = require('express');
const router = express.Router();
const { register, login } = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

// ==========================================
// Public Routes (ไม่ต้องใช้ Token)
// ==========================================
router.post('/register', register);
router.post('/login', login);

// ==========================================
// Protected Routes (ต้องแนบ Bearer Token)
// ==========================================
router.get('/me', authMiddleware, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'ดึงข้อมูลโปรไฟล์สำเร็จ',
    user: req.user
  });
});

module.exports = router;