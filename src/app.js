const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// ==========================================
// 🚨 ปิดการนำเข้า Routes ทั้งหมดไว้ก่อนชั่วคราว
// เพราะข้างในยังใช้ Firebase อยู่ (จะค่อยๆ ย้ายมา Supabase ทีหลัง)
// ==========================================
const authRoutes = require('./routes/authRoutes');
// const apiRoutes = require('./routes/api');
// const chatRoutes = require('./routes/chat');
// const paymentRoutes = require('./routes/payment');
// const notificationRoutes = require('./routes/notifications');
// const transactionRoutes = require('./routes/transactionRoutes');
const dealRoutes = require('./routes/dealRoutes');
// const userRoutes = require('./routes/userRoutes');

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10kb' }));

// Rate Limit (เก็บไว้ได้ ไม่มีปัญหา)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 5,
});
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 100,
});

// ==========================================
// 🚨 ปิดการใช้งาน Route ไว้ก่อน
// ==========================================
app.use('/api/auth', authRoutes);
// app.use('/api/users', userRoutes);
// app.use('/api/notifications', notificationRoutes);
app.use('/api/deals', dealRoutes);         
// app.use('/api/chats', chatRoutes);         
// app.use('/api/payment', paymentRoutes);
// app.use('/api/transactions', transactionRoutes);
// app.use('/api', apiRoutes);

// ✅ Health Check (อันนี้ต้องเปิดไว้เพื่อทดสอบ)
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'ValueFlow Backend is running' });
});

module.exports = app;