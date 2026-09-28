const http = require('http');
const path = require('path');
require('dotenv').config();

// 1. นำเข้า Express App ก่อนเป็นอันดับแรก
let app;
try {
  app = require('./app');
} catch (err) {
  console.error('❌ Failed to load ./app:', err.message);
  process.exit(1);
}

// 2. นำเข้า Database Pool แบบ Dynamic Fallback
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

// 3. นำเข้า Socket.io
let Server;
try {
  Server = require('socket.io').Server;
} catch (err) {
  console.warn('⚠️ socket.io package is missing. WebSockets disabled.');
}

// Global Uncaught Exception Handlers
process.on('uncaughtException', (err) => {
  console.error('🔥 Uncaught Exception:', err.stack || err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Unhandled Rejection at:', promise, 'reason:', reason);
});

// ==========================================================
// 4. SOCKET.IO & HTTP SERVER SETUP
// ==========================================================
const server = http.createServer(app);

let io = null;
if (Server) {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "*",
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  // แชร์ io instance ให้แอปใช้งาน (ถ้าต้องการเรียกใช้ผ่าน app.get)
  app.set('io', io);

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

// 5. เริ่มต้นเปิด Server
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`🚀 Server running successfully on http://${HOST}:${PORT}`);
});