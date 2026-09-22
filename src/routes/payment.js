const express = require('express');
const router = express.Router();
const { createPaymentIntent, handlePaymentWebhook } = require('../controllers/paymentController');

// เส้นทางสำหรับสร้าง Payment Intent (รับ JSON ปกติ)
router.post('/create-payment-intent', createPaymentIntent);

// เส้นทางสำหรับรับ Webhook จาก Stripe
router.post('/webhook', handlePaymentWebhook);

module.exports = router;