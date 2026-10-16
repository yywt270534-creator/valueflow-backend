/**
 * Middleware: ตรวจว่า user มี role = 'admin'
 * ต้องใช้ต่อจาก authMiddleware เท่านั้น (เพราะต้องมี req.user ก่อน)
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden: ต้องเป็นผู้ดูแลระบบเท่านั้น',
    });
  }
  next();
};

module.exports = requireAdmin;