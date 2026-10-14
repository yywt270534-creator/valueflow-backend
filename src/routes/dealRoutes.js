const express = require('express');
const router = express.Router();
const { 
  createDeal, 
  getDealById, 
  joinDeal,
  confirmPayment,
  shipDeal,
  confirmReceipt,
  releasePayment,
  getMyDeals
} = require('../controllers/dealController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.post('/', createDeal);
router.get('/', getMyDeals);
router.get('/:dealId', getDealById);
router.post('/:dealId/join', joinDeal);
router.post('/:dealId/confirm-payment', confirmPayment);
router.post('/:dealId/ship', shipDeal);
router.post('/:dealId/confirm-receipt', confirmReceipt);
router.post('/:dealId/release', releasePayment);  // 👈 เพิ่ม

module.exports = router;