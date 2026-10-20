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
  getMyDeals,
  cancelDeal,
  disputeDeal,
  uploadEvidence, getEvidence
} = require('../controllers/dealController');
const authMiddleware = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.use(authMiddleware);

router.post('/', createDeal);
router.get('/', getMyDeals);
router.get('/:dealId', getDealById);
router.post('/:dealId/join', joinDeal);
router.post('/:dealId/confirm-payment', confirmPayment);
router.post('/:dealId/ship', shipDeal);
router.post('/:dealId/confirm-receipt', confirmReceipt);
router.post('/:dealId/release', releasePayment);  // 👈 เพิ่ม
router.post('/:dealId/cancel', cancelDeal);
router.post('/:dealId/dispute', disputeDeal);
router.post('/:dealId/evidence', upload.single('file'), uploadEvidence);
router.get('/:dealId/evidence', getEvidence);
module.exports = router;