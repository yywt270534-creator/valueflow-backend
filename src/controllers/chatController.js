const pool = require('../config/db');
const { supabase, BUCKET } = require('../supabase');

// POST /api/deals/:dealId/messages
exports.sendMessage = async (req, res) => {
  const { dealId } = req.params;
  const userId = req.user.id;
  const { message } = req.body;

  const file = req.file;
  if ((!message || message.trim().length === 0) && !file) {
    return res.status(400).json({ error: 'กรุณาพิมพ์ข้อความหรือแนบไฟล์' });
  }

  try {
    // 1. หา deal + เช็คว่าเป็น buyer/seller ในดีลนี้
    const dealResult = await pool.query('SELECT * FROM deals WHERE deal_id = $1', [dealId]);
    if (dealResult.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบดีลนี้' });
    }
    const deal = dealResult.rows[0];
    const isParty = deal.seller_id === userId || deal.buyer_id === userId;
    if (!isParty) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ส่งข้อความในดีลนี้' });
    }

    // 2. Insert message
  let msgType = 'text'
  let finalMsg = message ? message.trim() : ''

  if (file) {
    const ext = file.originalname.split('.').pop().toLowerCase()
    const storagePath = `chat/${dealId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
    
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false })

    if (uploadErr) {
      console.error('Supabase Upload Error:', uploadErr)
      return res.status(500).json({ error: 'อัปโหลดไฟล์ไม่สำเร็จ', details: uploadErr.message })
    }

    finalMsg = storagePath
    msgType = file.mimetype.startsWith('video/') ? 'video' : 'image'
  }

  const result = await pool.query(
    `INSERT INTO deal_messages (deal_id, sender_id, message, type)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [dealId, userId, finalMsg, msgType]
  );

    res.status(201).json({
      success: true,
      message: 'ส่งข้อความสำเร็จ',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('Send Message Error:', err);
    res.status(500).json({
      error: 'เกิดข้อผิดพลาดในการส่งข้อความ',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

// GET /api/deals/:dealId/messages
exports.getMessages = async (req, res) => {
  const { dealId } = req.params;
  const userId = req.user.id;

  try {
    const dealResult = await pool.query('SELECT * FROM deals WHERE deal_id = $1', [dealId]);
    if (dealResult.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบดีลนี้' });
    }
    const deal = dealResult.rows[0];
    const isParty = deal.seller_id === userId || deal.buyer_id === userId;
    if (!isParty && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ดูข้อความในดีลนี้' });
    }

    // Join users เพื่อดึงชื่อคนส่ง
    const result = await pool.query(
      `SELECT m.*, u.name AS sender_name
       FROM deal_messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.deal_id = $1
       ORDER BY m.created_at ASC
       LIMIT 100`,
      [dealId]
    );

      const messagesWithUrls = await Promise.all(
    result.rows.map(async (msg) => {
      if (msg.type === 'image' || msg.type === 'video') {
        const { data } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(msg.message, 3600)
        return { ...msg, signed_url: data?.signedUrl || null }
      }
      return { ...msg, signed_url: null }
    })
  )

  res.json({ success: true, count: messagesWithUrls.length, messages: messagesWithUrls });
  } catch (err) {
    console.error('Get Messages Error:', err);
    res.status(500).json({
      error: 'เกิดข้อผิดพลาดในการดึงข้อความ',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};