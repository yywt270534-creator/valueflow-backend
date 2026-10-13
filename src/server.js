require('dotenv').config();

// โหลด Database ทดสอบการเชื่อมต่อทันที (ถ้าไม่ผ่าน จะเห็น Error ตอน start)
require('./config/db');

// โหลด Express App ที่มี middleware + routes ทั้งหมด
const app = require('./app');

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});