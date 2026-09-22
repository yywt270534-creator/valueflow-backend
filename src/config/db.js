const { Pool } = require('pg');
require('dotenv').config();

// ตรวจสอบว่ามี DATABASE_URL หรือไม่
if (!process.env.DATABASE_URL) {
  console.error('❌ CRITICAL ERROR: DATABASE_URL environment variable is missing!');
}

// ตั้งค่า Connection Pool สำหรับ PostgreSQL (Supabase)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' || (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('supabase'))
    ? { rejectUnauthorized: false }
    : false
});

pool.on('connect', () => {
  console.log('🐘 Connected to PostgreSQL Database successfully');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err.message);
});

module.exports = pool;