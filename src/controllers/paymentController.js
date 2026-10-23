const db = require('../config/db');
const omise = require('../../omise');

// 1. API สำหรับสร้างคำสั่งชำระเงิน (Create Charge)
const createPaymentIntent = async (req, res) => {
    try {
        const { deal_id, amount } = req.body; // amount มีหน่วยเป็นสตางค์

        if (!deal_id || !amount) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุ deal_id และ amount ให้ครบถ้วน' });
        }

const charge = await omise.charges.create({
    amount: amount,
    currency: 'thb',
    ...(req.body.token ? { card: req.body.token } : { source: req.body.source_id }),
    metadata: { deal_id: deal_id.toString() }
});

        res.status(200).json({
            success: true,
            chargeId: charge.id,
            status: charge.status,
            qrCode: charge.source?.scannable_code?.image?.download_uri || null
        });
    } catch (error) {
        console.error('Create Charge Error:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'เกิดข้อผิดพลาดในการสร้างคำสั่งชำระเงินกับ Omise',
            errorDetails: error.message 
        });
    }
};

// 2. Webhook สำหรับรับแจ้งเตือนการชำระเงินสำเร็จ
const handlePaymentWebhook = async (req, res) => {
    const event = req.body;
    
    // Omise webhook ไม่มี signature ให้ตรวจสอบ
    if (event.key !== 'charge.complete') {
        return res.status(200).json({ message: 'Event ignored' });
    }

    const chargeId = event.data?.id;
    const deal_id = event.data?.metadata?.deal_id;

    if (!chargeId || !deal_id) {
        console.error('Webhook Error: Missing chargeId or deal_id');
        return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบถ้วน' });
    }

    // อัปเดต DB ตาม Handoff: STEP_2_PAYMENT -> STEP_3_SHIPPING
    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const updateDeal = await client.query(
            `UPDATE deals SET status = 'STEP_3_SHIPPING', updated_at = NOW() WHERE id = $1 AND status = 'STEP_2_PAYMENT' RETURNING *`,
            [deal_id]
        );

        if (updateDeal.rows.length === 0) {
            await client.query('ROLLBACK');
            console.error(`Webhook Error: Deal #${deal_id} not found or status is not STEP_2_PAYMENT`);
            return res.status(404).json({ success: false, message: 'ไม่พบดีลนี้หรือสถานะไม่ถูกต้อง' });
        }

        const deal = updateDeal.rows[0];
        const notificationMessage = `ดีล #${deal.id} ได้รับการชำระเงินเรียบร้อยแล้ว สถานะเปลี่ยนเป็น 'STEP_3_SHIPPING'`;
        
        await client.query(
            `INSERT INTO notifications (user_id, title, message, deal_id, is_read, created_at) 
             VALUES ($1, $2, $3, $4, false, NOW()), ($5, $2, $3, $4, false, NOW())`,
            [deal.buyer_id, 'การชำระเงินสำเร็จ', notificationMessage, deal.id, deal.seller_id]
        );

        await client.query('COMMIT');
        console.log(`✅ Deal #${deal.id} successfully updated to 'STEP_3_SHIPPING' via Omise Webhook`);
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