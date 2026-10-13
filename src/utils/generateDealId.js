const crypto = require('crypto');

/**
 * สร้างรหัสดีลรูปแบบ VF-XXXXXX (6 หลัก)
 * ใช้ crypto.randomBytes เพื่อไม่ให้คาดเดาได้
 * ตัวอักษรไม่รวม 0/O/1/I/L เพื่อไม่ให้ผู้ใช้พิมพ์ผิด
 */
function generateDealId() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return `VF-${code}`;
}

module.exports = generateDealId;