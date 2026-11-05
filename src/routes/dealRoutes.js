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
  uploadEvidence, getEvidence, hideDeal, editDeal, confirmDeal
} = require('../controllers/dealController');
const { sendMessage, getMessages } = require('../controllers/chatController');
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
router.patch('/:dealId/hide', hideDeal);
router.put('/:dealId', editDeal);
router.post('/:dealId/confirm', confirmDeal);
router.post('/:dealId/dispute', disputeDeal);
router.post('/:dealId/evidence', upload.single('file'), uploadEvidence);
router.get('/:dealId/evidence', getEvidence);
router.post('/:dealId/messages', upload.single('file'), sendMessage);
router.get('/:dealId/messages', getMessages);
module.exports = router;