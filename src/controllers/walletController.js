const pool = require('../config/db');

/**
 * GET /api/wallet
 * คืนยอดเงินพร้อมใช้ของผู้ใช้ (จาก ledger)
 * Frontend ใช้แค่ available / breakdown ที่เหลือคำนวณจาก deals
 */
exports.getWallet = async (req, res) => {
  const userId = req.user.id;
  try {
    // ยอดพร้อมใช้ = SUM(ledger)
    const balResult = await pool.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS available
       FROM wallet_transactions
       WHERE user_id = $1`,
      [userId]
    );

    const available = parseFloat(balResult.rows[0].available);

    // แยกตาม type (สำหรับอนาคต — withdrawal / topup)
    const breakdownResult = await pool.query(
      `SELECT type, COALESCE(SUM(amount), 0)::numeric AS total, COUNT(*)::int AS count
       FROM wallet_transactions
       WHERE user_id = $1
       GROUP BY type`,
      [userId]
    );

    const breakdown = {};
    for (const row of breakdownResult.rows) {
      breakdown[row.type] = {
        total: parseFloat(row.total),
        count: row.count,
      };
    }

    res.json({
      success: true,
      balance: {
        available,
        currency: 'THB',
      },
      breakdown,
    });
  } catch (err) {
    console.error('Get Wallet Error:', err);
    res.status(500).json({
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลกระเป๋าเงิน',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

/**
 * GET /api/wallet/transactions
 * ดึงประวัติ ledger ของผู้ใช้ (raw rows — ไม่ join กับ deals)
 * Query: ?limit=50&offset=0
 */
exports.getTransactions = async (req, res) => {
  const userId = req.user.id;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);

  try {
    const result = await pool.query(
      `SELECT id, deal_id, type, amount, currency, reference, note, created_at
       FROM wallet_transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    res.json({
      success: true,
      count: result.rows.length,
      limit,
      offset,
      transactions: result.rows,
    });
  } catch (err) {
    console.error('Get Wallet Transactions Error:', err);
    res.status(500).json({
      error: 'เกิดข้อผิดพลาดในการดึงประวัติธุรกรรม',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};