const jwt = require('jsonwebtoken');

// ฟังก์ชัน Middleware สำหรับตรวจสอบ JWT Token
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // ตรวจสอบว่ามีการส่ง Authorization Header มาหรือไม่
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token format' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // ถอดรหัส Token และบันทึกข้อมูลผู้ใช้ลงใน req.user
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    req.user = decoded;
    next(); // อนุญาตให้ผ่านไปทำขั้นตอนถัดไป
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

// ส่งออกเป็นฟังก์ชันโดยตรง (ไม่ห่อด้วย Object)
module.exports = authMiddleware;