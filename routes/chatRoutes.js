const express = require('express');
const chatController = require('../controllers/chatController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware); // all chatbot routes are protected

router.get('/history', chatController.getChatHistory);
router.post('/', chatController.sendChatMessage);

module.exports = router;
