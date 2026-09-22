const supabase = require('../config/supabase');

/**
 * ดึงรายการธุรกรรมทั้งหมดของผู้ใช้ที่ล็อกอินอยู่
 */
exports.getTransactions = async (req, res) => {
  try {
    const userId = req.user.id; // ดึง id จาก Payload ที่ authMiddleware แนบมา

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json({
      success: true,
      count: data.length,
      data: data
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * สร้างรายการธุรกรรมใหม่ (รายรับ/รายจ่าย)
 */
exports.createTransaction = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, amount, category, description } = req.body;

    // ตรวจสอบความถูกต้องของข้อมูลเบื้องต้น
    if (!type || !amount || !category) {
      return res.status(400).json({ error: 'กรุณากรอกประเภท, จำนวนเงิน และหมวดหมู่ให้ครบถ้วน' });
    }

    if (!['income', 'expense'].includes(type)) {
      return res.status(400).json({ error: 'ประเภทธุรกรรมต้องเป็น income หรือ expense เท่านั้น' });
    }

    const { data, error } = await supabase
      .from('transactions')
      .insert([
        {
          user_id: userId,
          type,
          amount,
          category,
          description: description || ''
        }
      ])
      .select();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      message: 'บันทึกรายการสำเร็จ',
      data: data[0]
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};