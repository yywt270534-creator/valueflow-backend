const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const requireAdmin = require('../middleware/adminMiddleware');
const { resolveDispute, getDisputedDeals } = require('../controllers/dealController');

// ทุก route: ต้อง login + ต้องเป็น admin
router.use(authMiddleware);
router.use(requireAdmin);

router.post('/deals/:dealId/resolve', resolveDispute);
router.get('/deals/disputes', getDisputedDeals);
module.exports = router;