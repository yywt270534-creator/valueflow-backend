const db = require('../config/db');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// 1. API สำหรับสร้างคำสั่งชำระเงิน (Create Payment Intent)
const createPaymentIntent = async (req, res) => {
    try {
        const { deal_id, amount } = req.body; // amount มีหน่วยเป็นสตางค์

        if (!deal_id || !amount) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุ deal_id และ amount ให้ครบถ้วน' });
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: 'thb',
            metadata: { deal_id: deal_id.toString() }
        });

        res.status(200).json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });
    } catch (error) {
        // ดึงเฉพาะข้อความ Error ที่อ่านเข้าใจง่ายออกมาแสดงใน Terminal
        console.error('Create Payment Intent Error:', error.message);
        
        // ส่งข้อความ Error กลับไปแสดงที่ Thunder Client ชั่วคราวเพื่อให้เราวิเคราะห์ง่ายขึ้น
        res.status(500).json({ 
            success: false, 
            message: 'เกิดข้อผิดพลาดในการสร้างคำสั่งชำระเงินกับ Stripe',
            stripeError: error.message 
        });
    }
}; // <--- [จุดที่แก้ไข] เพิ่มปีกกาปิดและเซมิโคลอนตรงนี้ให้ฟังก์ชัน createPaymentIntent

// 2. Webhook สำหรับรับแจ้งเตือนการชำระเงินสำเร็จ
const handlePaymentWebhook = async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error(`⚠️ Webhook signature verification failed:`, err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type !== 'payment_intent.succeeded') {
        return res.status(200).json({ message: 'Event ignored' });
    }

    const paymentIntent = event.data.object;
    const deal_id = paymentIntent.metadata?.deal_id;

    if (!deal_id) {
        console.error('Webhook Error: Missing deal_id in payment intent metadata');
        return res.status(400).json({ success: false, message: 'ไม่พบรหัสดีลใน metadata' });
    }

    const client = await db.connect();

    try {
        await client.query('BEGIN');

        // ส่งเฉพาะ deal_id เข้าไปที่ $1 ให้ถูกต้อง
        const updateDeal = await client.query(
            `UPDATE deals SET status = 'paid', updated_at = NOW() WHERE id = $1 RETURNING *`,
            [deal_id]
        );

        if (updateDeal.rows.length === 0) {
            await client.query('ROLLBACK');
            console.error(`Webhook Error: Deal #${deal_id} not found in database`);
            return res.status(404).json({ success: false, message: 'ไม่พบดีลนี้ในระบบ' });
        }

        const deal = updateDeal.rows[0];

        // สร้างการแจ้งเตือนให้กับผู้ซื้อและผู้ขาย
        const notificationMessage = `ดีล #${deal.id} ได้รับการชำระเงินเรียบร้อยแล้ว สถานะเปลี่ยนเป็น 'paid'`;
        
        await client.query(
            `INSERT INTO notifications (user_id, title, message, deal_id, is_read, created_at) 
             VALUES ($1, $2, $3, $4, false, NOW()), ($5, $2, $3, $4, false, NOW())`,
            [deal.buyer_id, 'การชำระเงินสำเร็จ', notificationMessage, deal.id, deal.seller_id]
        );

        await client.query('COMMIT');
        console.log(`✅ Deal #${deal.id} successfully updated to 'paid' via Stripe Webhook`);
        res.status(200).json({ received: true });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Payment Webhook Database Error:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ขณะบันทึกข้อมูล' });
    } finally {
        client.release();
    }
};

module.exports = { createPaymentIntent, handlePaymentWebhook };