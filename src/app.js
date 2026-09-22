const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const apiRoutes = require('./routes/api');
const chatRoutes = require('./routes/chat');
const paymentRoutes = require('./routes/payment');
const notificationRoutes = require('./routes/notifications');
const transactionRoutes = require('./routes/transactionRoutes'); // [จุดที่เพิ่ม 1] นำเข้า Transaction Routes

const app = express();

app.use(helmet());
app.use(cors());

// [จุดสำคัญที่ 1] ดักจับเฉพาะ Webhook ให้ใช้ express.raw() และวางไว้ก่อน express.json() ทั่วไป
app.post('/api/payment/webhook', express.raw({ type: 'application/json' }), paymentRoutes);

// [จุดสำคัญที่ 2] เปิดใช้งาน express.json() สำหรับ API อื่นๆ ในระบบ
app.use(express.json({ limit: '10kb' }));

// ==========================================
// Health Check Routes (แก้ปัญหา Cannot GET /)
// ==========================================
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'ValueFlow Backend API is running successfully!',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

app.get('/api', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'ValueFlow API Endpoint'
  });
});

// Rate Limiters
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 100,
  message: { error: "Too many requests from this IP, please try again later" }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 5,
  message: { error: "Too many login attempts from this IP, please try again after 15 minutes" }
});

app.use('/api', generalLimiter);
app.use('/api/auth/login', loginLimiter);

// Register Routes
app.use('/api/auth', authRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/deals', chatRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/transactions', transactionRoutes); // [จุดที่เพิ่ม 2] ลงทะเบียน Transaction Routes
app.use('/api', apiRoutes);

module.exports = app;