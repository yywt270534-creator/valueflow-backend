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
const transactionRoutes = require('./routes/transactionRoutes');
const dealRoutes = require('./routes/dealRoutes'); // 👈 ต้องมั่นใจว่ามีไฟล์นี้และนำเข้าถูกต้อง

const app = express();

// 🔴 [สำคัญมากสำหรับ Railway] ต้องเปิดใช้งาน trust proxy เพื่อแก้ปัญหา rate-limit พัง
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors());

// Webhook และ JSON Middleware...
app.post('/api/payment/webhook', express.raw({ type: 'application/json' }), paymentRoutes);
app.use(express.json({ limit: '10kb' }));

// ... (Health Check และ Rate Limiters ของเดิม) ...
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

// ==========================================
// 🛑 [จุดตาย] ลงทะเบียน Route ให้แยกขาดจากกันเด็ดขาด
// ==========================================
app.use('/api/auth', authRoutes);
app.use('/api/notifications', notificationRoutes);

app.use('/api/deals', dealRoutes);   // 👈 จัดการเรื่องดีลทั้งหมด ต้องวิ่งเข้า dealRoutes เท่านั้น ห้ามเอา chatRoutes มาแปะตรงนี้!
app.use('/api/chats', chatRoutes);   // 👈 จัดการเรื่องแชท แยกไปที่พรีฟิกซ์ /api/chats

app.use('/api/payment', paymentRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api', apiRoutes);

module.exports = app;