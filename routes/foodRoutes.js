const express = require('express');
const foodController = require('../controllers/foodController');

const router = express.Router();

// Public route for foods, matching the original app flow
router.get('/', foodController.getAllFoods);

module.exports = router;
