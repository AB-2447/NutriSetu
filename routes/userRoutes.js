const express = require('express');
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware); // all user routes are protected

router.patch('/budget', userController.updateBudget);
router.get('/budget/history', userController.getBudgetHistory);
router.patch('/diet', userController.updateDiet);
router.delete('/', userController.deleteProfile);

module.exports = router;
