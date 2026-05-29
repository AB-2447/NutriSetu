const express = require('express');
const logController = require('../controllers/logController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware); // all log and progress routes require authentication

router.get('/', logController.getLogsToday);
router.post('/', logController.logFood);
router.delete('/:id', logController.deleteLog);
router.get('/history', logController.getLogHistory);

// Weight progression endpoints
router.post('/weight', logController.logWeight);
router.get('/weight/history', logController.getWeightHistory);

module.exports = router;
