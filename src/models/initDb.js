const { pool } = require('../config/db'); // ดึง pool ออกมาตรงๆ

const createTables = async () => {
  try {
    // 1. ตาราง users
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'buyer',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. ตาราง deals
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deals (
        id SERIAL PRIMARY KEY,
        title VARCHAR(150) NOT NULL,
        description TEXT,
        amount DECIMAL(12, 2) NOT NULL,
        buyer_id INT REFERENCES users(id),
        seller_id INT REFERENCES users(id),
        status VARCHAR(30) DEFAULT 'created',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. ตาราง deal_logs (Audit Trail)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deal_logs (
        id SERIAL PRIMARY KEY,
        deal_id INT REFERENCES deals(id) ON DELETE CASCADE,
        actor_role VARCHAR(20) NOT NULL,
        previous_status VARCHAR(30),
        new_status VARCHAR(30) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. ตาราง deal_chats
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deal_chats (
        id SERIAL PRIMARY KEY,
        deal_id INT REFERENCES deals(id) ON DELETE CASCADE,
        sender_id INT REFERENCES users(id),
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 5. ตาราง notifications
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        deal_id INT REFERENCES deals(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('All 5 database tables created successfully.');
  } catch (err) {
    console.error('Error creating tables:', err.message);
  } finally {
    pool.end();
  }
};

createTables();