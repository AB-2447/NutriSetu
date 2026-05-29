const express = require('express');
const mealController = require('../controllers/mealController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware); // all recommendation queries require authentication

router.get('/recommendations', mealController.getMealRecommendations);

module.exports = router;
