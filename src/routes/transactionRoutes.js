const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { getTransactions, createTransaction } = require('../controllers/transactionController');

// บังคับใช้ authMiddleware กับทุก Route ในไฟล์นี้
router.use(authMiddleware);

router.get('/', getTransactions);
router.post('/', createTransaction);

module.exports = router;