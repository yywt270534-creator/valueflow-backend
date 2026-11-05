const multer = require('multer');

// เก็บใน memory ก่อน → stream ตรงเข้า Supabase Storage
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB (เผื่อวิดีโอสั้น)
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('อนุญาตเฉพาะไฟล์ jpg, png, webp เท่านั้น'));
    }
    cb(null, true);
  },
});

module.exports = upload;