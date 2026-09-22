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

const app = express();

app.use(helmet());
app.use(cors());

// [จุดสำคัญที่ 1] ดักจับเฉพาะ Webhook ให้ใช้ express.raw() และวางไว้ก่อน express.json() ทั่วไป
app.post('/api/payment/webhook', express.raw({ type: 'application/json' }), paymentRoutes);

// [จุดสำคัญที่ 2] เปิดใช้งาน express.json() สำหรับ API อื่นๆ ในระบบ
app.use(express.json({ limit: '10kb' }));

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

// Register Routes อื่นๆ
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/api/deals', chatRoutes);

// [จุดสำคัญที่ 3] สำหรับ Payment API ทั่วไป (เช่น /create-payment-intent) ให้อยู่ภายใต้ /api/payment
app.use('/api/payment', paymentRoutes);

module.exports = app;