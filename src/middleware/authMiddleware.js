const jwt = require('jsonwebtoken');

/**
 * Middleware ตรวจสอบความถูกต้องของ JWT Token ใน Request Header
 */
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // 1. ตรวจสอบว่ามี Header Authorization และขึ้นต้นด้วย "Bearer " หรือไม่
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: 'Unauthorized: Missing or invalid token format' 
    });
  }

  // 2. แยกข้อความเพื่อเอาเฉพาะ Token string
  const token = authHeader.split(' ')[1];

  try {
    // 3. ยืนยันความถูกต้องของ Token ด้วย JWT_SECRET จาก Environment Variable
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 4. แนบข้อมูล Payload (id, email, role) เข้าไปใน req.user
    req.user = decoded;
    
    // 5. ส่งผ่านให้ Controller ถัดไปทำงาน
    next();
  } catch (err) {
    // แยกประเภท Error เพื่อให้ Client เข้าใจสาเหตุได้ชัดเจนขึ้น
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized: Token has expired' });
    }
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

module.exports = authMiddleware;