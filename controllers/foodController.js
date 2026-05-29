const Food = require('../models/Food');

exports.getAllFoods = async (req, res) => {
    try {
        const foods = await Food.find({});
        res.json(foods);
    } catch (err) {
        console.error('Fetch foods error:', err);
        res.status(500).json({ error: 'Server error fetching foods' });
    }
};
