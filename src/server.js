const http = require('http');
const path = require('path');
require('dotenv').config();

// 1. นำเข้า Express App
let app;
try {
  app = require('./app');
} catch (err) {
  console.error('❌ Failed to load ./app:', err.message);
  process.exit(1);
}

// 2. นำเข้า Database Pool แบบ Dynamic Fallback (ค้นหาทั้งใน src/config และ Root config)
let pool = null;
try {
  pool = require('./config/db');
  console.log('✅ Database module loaded from ./config/db');
} catch (err1) {
  try {
    pool = require('../config/db');
    console.log('✅ Database module loaded from ../config/db');
  } catch (err2) {
    console.warn('⚠️ Warning: Database pool could not be loaded from either ./config/db or ../config/db');
  }
}

// 3. นำเข้า Socket.io และ JWT แบบปลอดภัย
let Server;
try {
  Server = require('socket.io').Server;
} catch (err) {
  console.warn('⚠️ socket.io package is missing. WebSockets disabled.');
}

let jwt;
try {
  jwt = require('jsonwebtoken');
} catch (err) {
  console.warn('⚠️ jsonwebtoken package is missing.');
}

// Global Uncaught Exception Handlers ป้องกัน Process ดับกะทันหัน
process.on('uncaughtException', (err) => {
  console.error('🔥 Uncaught Exception:', err.stack || err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Unhandled Rejection at:', promise, 'reason:', reason);
});

const server = http.createServer(app);

// ตั้งค่า Socket.io
let io = null;
if (Server) {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "*",
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 User connected: ${socket.id}`);

    socket.on('join_deal', async (data) => {
      const { dealId, userId } = typeof data === 'object' ? data : { dealId: data, userId: null };
      if (!dealId) return socket.emit('error', { message: 'Missing dealId' });

      try {
        if (userId && pool) {
          const checkQuery = `SELECT id FROM deals WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)`;
          const checkResult = await pool.query(checkQuery, [dealId, userId]);
          if (checkResult.rows.length === 0) {
            return socket.emit('error', { message: 'Unauthorized to join this deal room' });
          }
        }
        socket.join(`deal_${dealId}`);
      } catch (err) {
        console.error('Join deal error:', err.message);
      }
    });

    socket.on('send_message', async (data) => {
      const { deal_id, sender_id, message } = data;
      if (!deal_id || !sender_id || !message || message.trim() === '') return;

      try {
        if (!pool) return;
        const query = `
          INSERT INTO deal_chats (deal_id, sender_id, message, created_at)
          VALUES ($1, $2, $3, NOW()) RETURNING *;
        `;
        const result = await pool.query(query, [deal_id, sender_id, message.trim()]);
        io.to(`deal_${deal_id}`).emit('receive_message', result.rows[0]);
      } catch (err) {
        console.error('Socket chat error:', err.message);
      }
    });

    socket.on('disconnect', () => {
      console.log(`❌ User disconnected: ${socket.id}`);
    });
  });
}

// Middleware ตรวจสอบ JWT
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'ไม่พบ Token การยืนยันตัวตน' });
  }

  const token = authHeader.split(' ')[1];
  try {
    if (!jwt) throw new Error('JWT module missing');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ' });
  }
};

// API Route: อัปเดตสถานะดีล
app.put('/api/deals/:dealId/status', verifyToken, async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database pool unavailable' });

  const { dealId } = req.params;
  const { nextStatus } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  const validStatuses = ['pending', 'paid', 'delivered', 'inspected', 'completed', 'cancelled'];
  if (!validStatuses.includes(nextStatus)) {
    return res.status(400).json({ error: 'สถานะไม่ถูกต้องตามเงื่อนไขระบบ' });
  }

  try {
    const dealQuery = await pool.query(`SELECT * FROM deals WHERE id = $1`, [dealId]);
    if (dealQuery.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบดีลนี้ในระบบ' });
    }
    const deal = dealQuery.rows[0];

    const isBuyer = deal.buyer_id === userId;
    const isSeller = deal.seller_id === userId;
    const isAdmin = userRole === 'admin';

    let isAuthorized = false;
    if (deal.status === 'pending' && nextStatus === 'paid' && isBuyer) isAuthorized = true;
    if (deal.status === 'pending' && nextStatus === 'cancelled' && isBuyer) isAuthorized = true;
    if (deal.status === 'paid' && nextStatus === 'delivered' && (isSeller || isAdmin)) isAuthorized = true;
    if (deal.status === 'delivered' && nextStatus === 'inspected' && (isBuyer || isAdmin)) isAuthorized = true;
    if (deal.status === 'inspected' && nextStatus === 'completed' && isAdmin) isAuthorized = true;

    if (!isAuthorized) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เปลี่ยนสถานะดีลนี้ในขั้นตอนนี้' });
    }

    const updateResult = await pool.query(
      `UPDATE deals SET status = $1 WHERE id = $2 RETURNING *`,
      [nextStatus, dealId]
    );

    const updatedDeal = updateResult.rows[0];
    if (io) io.to(`deal_${dealId}`).emit('deal_status_updated', updatedDeal);

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

// เริ่มต้นเปิด Server บน Host 0.0.0.0
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`🚀 Server running successfully on http://${HOST}:${PORT}`);
});