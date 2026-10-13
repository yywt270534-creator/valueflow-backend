const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // จำเป็นสำหรับ Supabase
});

// ทดสอบเชื่อมต่อทันทีที่โหลดไฟล์
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection error:', err.stack);
  } else {
    console.log('✅ Successfully connected to Supabase PostgreSQL');
    release();
  }
});

module.exports = pool;