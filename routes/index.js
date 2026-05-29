const express = require('express');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const foodRoutes = require('./foodRoutes');
const logRoutes = require('./logRoutes');
const priceRoutes = require('./priceRoutes');
const mealRoutes = require('./mealRoutes');
const chatRoutes = require('./chatRoutes');
const mealController = require('../controllers/mealController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/user', userRoutes);
router.use('/foods', foodRoutes);
router.use('/logs', logRoutes);
router.use('/prices', priceRoutes);
router.use('/meals', mealRoutes);
router.use('/chat', chatRoutes);

// Expose direct endpoint for single food cost calculations as requested: GET /api/meal-cost/:id
router.get('/meal-cost/:id', authMiddleware, mealController.getFoodCost);

module.exports = router;
