const db = require('../config/db');
const omise = require('../../omise');

// 1. API สำหรับสร้างคำสั่งชำระเงิน (Create Charge)
const createPaymentIntent = async (req, res) => {
    try {
const { deal_id } = req.body;
if (!deal_id) {
    return res.status(400).json({ success: false, message: 'กรุณาระบุ deal_id' });
}
const dealRes = await db.query('SELECT buyer_id, price, fee FROM deals WHERE deal_id = $1', [deal_id]);
if (dealRes.rows.length === 0) return res.status(404).json({ success: false, message: 'ไม่พบดีล' });
const deal = dealRes.rows[0];
if (deal.buyer_id !== req.user.id) return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์ชำระเงินดีลนี้' });
const amount = Math.round((parseFloat(deal.price) + parseFloat(deal.fee || 0)) * 100);

const { method, token } = req.body;
let charge;
if (method === 'promptpay') {
    const source = await omise.sources.create({ type: 'promptpay', amount, currency: 'thb' });
    charge = await omise.charges.create({ amount, currency: 'thb', source: source.id, metadata: { deal_id: deal_id.toString() } });
} else {
    charge = await omise.charges.create({ amount, currency: 'thb', card: token, metadata: { deal_id: deal_id.toString() } });
}

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
            // 🔒 Security Check: Verify charge with Omise API directly
        const realCharge = await omise.charges.retrieve(chargeId);
        if (realCharge.status !== 'successful') {
            console.error(`Webhook Error: Charge ${chargeId} status is ${realCharge.status}, not successful`);
            return res.status(400).json({ success: false, message: 'การชำระเงินยังไม่สำเร็จ' });
        }
        // Check amount match (realCharge.amount is in satangs)
        if (Number(realCharge.amount) !== Number(amount)) {
            console.error(`Webhook Error: Amount mismatch. Expected ${amount}, got ${realCharge.amount}`);
            return res.status(400).json({ success: false, message: 'ยอดเงินไม่ตรงกัน' });
        }
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