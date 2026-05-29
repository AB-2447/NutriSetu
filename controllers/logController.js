const Log = require('../models/Log');
const Food = require('../models/Food');
const User = require('../models/User');
const BudgetHistory = require('../models/BudgetHistory');
const WeightHistory = require('../models/WeightHistory');
const costCalculator = require('../services/costCalculator');

// Helper to get local start of today
function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

// Helper to update/sync daily budget spending history
async function syncBudgetHistory(userId) {
    try {
        const today = startOfToday();
        const logs = await Log.find({
            userId,
            date: { $gte: today }
        });
        
        const totalSpentToday = logs.reduce((sum, log) => sum + (log.cost || 0), 0);
        
        const user = await User.findById(userId);
        if (!user) return;

        await BudgetHistory.findOneAndUpdate(
            {
                userId,
                date: { $gte: today }
            },
            {
                budgetTarget: user.budgetTarget,
                spent: Math.round(totalSpentToday * 100) / 100,
                date: new Date()
            },
            { upsert: true }
        );
    } catch (err) {
        console.error('Error syncing budget history:', err.message);
    }
}

exports.logFood = async (req, res) => {
    try {
        const { foodId, foodName, calories, portions } = req.body;
        if (!foodName || calories === undefined || portions === undefined) {
            return res.status(400).json({ error: 'Missing required log fields: foodName, calories, portions' });
        }
        if (typeof portions !== 'number' || portions <= 0) {
            return res.status(400).json({ error: 'Portions must be a positive number' });
        }

        // Calculate cost dynamically
        let unitCost = 0;
        if (foodId) {
            const food = await Food.findById(foodId);
            if (food) {
                unitCost = await costCalculator.calculateFoodCost(food);
            }
        }
        
        const cost = Math.round(unitCost * portions * 100) / 100;

        const newLog = new Log({
            userId: req.user.id,
            foodId,
            foodName,
            calories,
            portions,
            cost,
            type: req.body.type,
            date: new Date()
        });

        await newLog.save();
        
        // Sync budget spending history for today
        await syncBudgetHistory(req.user.id);

        res.status(201).json(newLog);
    } catch (err) {
        console.error('Log food error:', err);
        res.status(500).json({ error: 'Server error saving log' });
    }
};

exports.getLogsToday = async (req, res) => {
    try {
        const logs = await Log.find({
            userId: req.user.id,
            date: { $gte: startOfToday() }
        });
        res.json(logs);
    } catch (err) {
        console.error('Fetch logs error:', err);
        res.status(500).json({ error: 'Server error fetching logs' });
    }
};

exports.getLogHistory = async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const since = new Date();
        since.setDate(since.getDate() - (days - 1));
        since.setHours(0, 0, 0, 0);

        const logs = await Log.find({
            userId: req.user.id,
            date: { $gte: since }
        });

        // Group by calendar date: YYYY-MM-DD
        const grouped = {};
        logs.forEach(log => {
            const d = new Date(log.date);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            if (!grouped[key]) {
                grouped[key] = { calories: 0, cost: 0 };
            }
            grouped[key].calories += log.calories || 0;
            grouped[key].cost += log.cost || 0;
        });

        res.json(grouped);
    } catch (err) {
        console.error('Fetch log history error:', err);
        res.status(500).json({ error: 'Server error fetching log history' });
    }
};

exports.deleteLog = async (req, res) => {
    try {
        const deleted = await Log.findOneAndDelete({
            _id: req.params.id,
            userId: req.user.id
        });
        
        if (!deleted) {
            return res.status(404).json({ error: 'Log entry not found' });
        }

        // Sync budget spending history for today
        await syncBudgetHistory(req.user.id);

        res.json({ success: true });
    } catch (err) {
        console.error('Delete log error:', err);
        res.status(500).json({ error: 'Server error deleting log' });
    }
};

exports.logWeight = async (req, res) => {
    try {
        const { weight } = req.body;
        if (weight === undefined || typeof weight !== 'number' || weight < 10 || weight > 500) {
            return res.status(400).json({ error: 'Invalid weight value. Must be between 10 and 500' });
        }

        // Record weight history
        const startOfTodayVal = startOfToday();
        const weightRecord = await WeightHistory.findOneAndUpdate(
            {
                userId: req.user.id,
                date: { $gte: startOfTodayVal }
            },
            {
                weight,
                date: new Date()
            },
            { upsert: true, new: true }
        );

        // Update active profile weight in User model
        await User.findByIdAndUpdate(req.user.id, { weight });

        res.status(201).json(weightRecord);
    } catch (err) {
        console.error('Log weight error:', err);
        res.status(500).json({ error: 'Server error logging weight' });
    }
};

exports.getWeightHistory = async (req, res) => {
    try {
        const history = await WeightHistory.find({
            userId: req.user.id
        }).sort({ date: 1 });
        
        res.json(history);
    } catch (err) {
        console.error('Fetch weight history error:', err);
        res.status(500).json({ error: 'Server error fetching weight history' });
    }
};
