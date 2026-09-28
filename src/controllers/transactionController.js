const pool = require('../config/db');

/**
 * ดึงรายการธุรกรรมทั้งหมดของผู้ใช้ที่ล็อกอินอยู่
 */
exports.getTransactions = async (req, res) => {
  try {
    const userId = req.user.id;

    const query = `
      SELECT * FROM transactions 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `;
    const { rows } = await pool.query(query, [userId]);

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (err) {
    console.error('Error fetching transactions:', err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลธุรกรรม' });
  }
};

/**
 * สร้างรายการธุรกรรมใหม่ (รายรับ/รายจ่าย)
 */
exports.createTransaction = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, amount, category, description } = req.body;

    if (!type || amount === undefined || !category) {
      return res.status(400).json({ error: 'กรุณากรอกประเภท, จำนวนเงิน และหมวดหมู่ให้ครบถ้วน' });
    }

    if (!['income', 'expense'].includes(type)) {
      return res.status(400).json({ error: 'ประเภทธุรกรรมต้องเป็น income หรือ expense เท่านั้น' });
    }

    const query = `
      INSERT INTO transactions (user_id, type, amount, category, description, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *;
    `;
    const values = [userId, type, amount, category, description || ''];

    const { rows } = await pool.query(query, values);

    return res.status(201).json({
      success: true,
      message: 'บันทึกรายการสำเร็จ',
      data: rows[0]
    });
  } catch (err) {
    console.error('Error creating transaction:', err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างรายการธุรกรรม' });
  }
};