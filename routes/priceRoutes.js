const express = require('express');
const priceController = require('../controllers/priceController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware); // all price query operations are protected

router.get('/', priceController.getAllPrices);
router.get('/:ingredient', priceController.getIngredientPrice);
router.post('/update', priceController.triggerPriceUpdate);

module.exports = router;
