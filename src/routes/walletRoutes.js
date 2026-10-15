const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { getWallet, getTransactions } = require('../controllers/walletController');

// ทุก route ต้อง login
router.use(authMiddleware);

router.get('/', getWallet);
router.get('/transactions', getTransactions);

module.exports = router;