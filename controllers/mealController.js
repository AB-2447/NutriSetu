const Food = require('../models/Food');
const costCalculator = require('../services/costCalculator');
const MealOptimizer = require('../services/mealOptimizer');
const mealOptimizer = new MealOptimizer();

exports.getFoodCost = async (req, res) => {
    try {
        const { id } = req.params;
        const food = await Food.findById(id);
        if (!food) {
            return res.status(404).json({ error: 'Food item not found' });
        }
        
        const cost = await costCalculator.calculateFoodCost(food);
        res.json({ foodId: id, name: food.name, cost });
    } catch (err) {
        console.error('Fetch food cost error:', err);
        res.status(500).json({ error: 'Server error calculating food cost' });
    }
};

exports.getMealRecommendations = async (req, res) => {
    try {
        const { mode = 'normal', limit = null } = req.query;
        
        // req.user is bound by authMiddleware
        const user = req.user;
        const budgetLimit = limit ? parseFloat(limit) : null;

        const recommendations = await mealOptimizer.buildMealCombos(user, {
            mode,
            budgetLimit
        });

        res.json(recommendations);
    } catch (err) {
        console.error('Fetch meal recommendations error:', err);
        res.status(500).json({ error: 'Server error generating meal recommendations' });
    }
};
