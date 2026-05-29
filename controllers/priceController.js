const Price = require('../models/Price');
const Ingredient = require('../models/Ingredient');
const priceService = require('../services/priceService');

exports.getAllPrices = async (req, res) => {
    try {
        const prices = await Price.find({}).populate('ingredient');
        res.json(prices);
    } catch (err) {
        console.error('Fetch prices error:', err);
        res.status(500).json({ error: 'Server error fetching prices' });
    }
};

exports.getIngredientPrice = async (req, res) => {
    try {
        const { ingredient } = req.params;
        const normalizedPrice = await priceService.getIngredientPrice(ingredient);
        res.json({ ingredient, normalizedPrice });
    } catch (err) {
        console.error('Fetch ingredient price error:', err);
        res.status(500).json({ error: 'Server error fetching ingredient price' });
    }
};

exports.triggerPriceUpdate = async (req, res) => {
    try {
        await priceService.refreshAllPrices();
        res.json({ success: true, message: 'Price refresh completed successfully' });
    } catch (err) {
        console.error('Trigger price update error:', err);
        res.status(500).json({ error: 'Server error triggering price update' });
    }
};
