const http = require('http');
const { Server } = require('socket.io');
// แก้ไขบรรทัดที่ 3 ใน server.js
const app = require('./src/app'); // ชี้ไปยัง src/app.js ให้ถูกต้อง
const pool = require('./config/db');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const server = http.createServer(app);

// ตั้งค่า Socket.io พร้อมจำกัด CORS
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware สำหรับตรวจสอบ JWT และสิทธิ์การใช้งาน
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'ไม่พบ Token การยืนยันตัวตน' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // เก็บข้อมูล Payload ไว้ใช้งานต่อ
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ' });
  }
};

// ==========================================
// API: อัปเดตสถานะดีล (พร้อมระบบป้องกันสิทธิ์ State Machine)
// ==========================================
app.put('/api/deals/:dealId/status', verifyToken, async (req, res) => {
  const { dealId } = req.params;
  const { nextStatus } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  const validStatuses = ['pending', 'paid', 'delivered', 'inspected', 'completed', 'cancelled'];
  if (!validStatuses.includes(nextStatus)) {
    return res.status(400).json({ error: 'สถานะไม่ถูกต้องตามเงื่อนไขระบบ' });
  }

  try {
    // 1. ตรวจสอบว่าดีลมีอยู่จริงหรือไม่
    const dealQuery = await pool.query(`SELECT * FROM deals WHERE id = $1`, [dealId]);
    if (dealQuery.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบดีลนี้ในระบบ' });
    }
    const deal = dealQuery.rows[0];

    const isBuyer = deal.buyer_id === userId;
    const isSeller = deal.seller_id === userId;
    const isAdmin = userRole === 'admin';

    // 2. ตรวจสอบสิทธิ์การเปลี่ยนสถานะตาม Escrow Workflow
    let isAuthorized = false;
    if (deal.status === 'pending' && nextStatus === 'paid' && isBuyer) isAuthorized = true;
    if (deal.status === 'pending' && nextStatus === 'cancelled' && isBuyer) isAuthorized = true;
    if (deal.status === 'paid' && nextStatus === 'delivered' && (isSeller || isAdmin)) isAuthorized = true;
    if (deal.status === 'delivered' && nextStatus === 'inspected' && (isBuyer || isAdmin)) isAuthorized = true;
    if (deal.status === 'inspected' && nextStatus === 'completed' && isAdmin) isAuthorized = true;

    if (!isAuthorized) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เปลี่ยนสถานะดีลนี้ในขั้นตอนนี้' });
    }

    // 3. ดำเนินการอัปเดตลงฐานข้อมูล
    const updateResult = await pool.query(
      `UPDATE deals SET status = $1 WHERE id = $2 RETURNING *`,
      [nextStatus, dealId]
    );

    const updatedDeal = updateResult.rows[0];

    // 4. ส่งข้อมูลอัปเดตผ่าน Socket.io ไปยังห้องของดีลนี้
    io.to(`deal_${dealId}`).emit('deal_status_updated', updatedDeal);

    res.json({
      success: true,
      message: 'อัปเดตสถานะดีลสำเร็จ',
      data: updatedDeal
    });
  } catch (err) {
    console.error('Update Deal Status Error:', err.message);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
  }
});

// Socket.io Event Handling
io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);

  socket.on('join_deal', async (data) => {
    const { dealId, userId } = typeof data === 'object' ? data : { dealId: data, userId: null };

    if (!dealId) {
      return socket.emit('error', { message: 'Missing dealId' });
    }

    try {
      if (userId) {
        const checkQuery = `SELECT id FROM deals WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)`;
        const checkResult = await pool.query(checkQuery, [dealId, userId]);
        
        if (checkResult.rows.length === 0) {
          return socket.emit('error', { message: 'Unauthorized to join this deal room' });
        }
      }

      socket.join(`deal_${dealId}`);
      console.log(`User ${userId || socket.id} joined room: deal_${dealId}`);
    } catch (err) {
      console.error('Join deal error:', err.message);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  socket.on('send_message', async (data) => {
    const { deal_id, sender_id, message } = data;

    if (!deal_id || !sender_id || !message || message.trim() === '') {
      return socket.emit('chat_error', { error: 'ข้อมูลไม่ครบถ้วน หรือข้อความว่างเปล่า' });
    }

    try {
      const authCheck = await pool.query(
        `SELECT id FROM deals WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)`,
        [deal_id, sender_id]
      );

      if (authCheck.rows.length === 0) {
        return socket.emit('chat_error', { error: 'คุณไม่มีสิทธิ์ส่งข้อความในดีลนี้' });
      }

      const query = `
        INSERT INTO deal_chats (deal_id, sender_id, message, created_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING *;
      `;
      const result = await pool.query(query, [deal_id, sender_id, message.trim()]);
      const savedMessage = result.rows[0];

      io.to(`deal_${deal_id}`).emit('receive_message', savedMessage);
    } catch (err) {
      console.error('Socket chat error:', err.message);
      socket.emit('chat_error', { error: 'ไม่สามารถส่งข้อความได้เนื่องจากระบบขัดข้อง' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Server running safely on port ${PORT} with WebSocket support in ${process.env.NODE_ENV || 'development'} mode`);
});