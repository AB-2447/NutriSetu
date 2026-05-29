const User = require('../models/User');
const Log = require('../models/Log');
const Plan = require('../models/Plan');
const BudgetHistory = require('../models/BudgetHistory');
const WeightHistory = require('../models/WeightHistory');
const ChatHistory = require('../models/ChatHistory');

exports.updateBudget = async (req, res) => {
    try {
        const { budgetTarget } = req.body;
        if (budgetTarget === undefined || typeof budgetTarget !== 'number' || budgetTarget <= 0) {
            return res.status(400).json({ error: 'Valid budgetTarget value is required' });
        }

        const user = await User.findByIdAndUpdate(
            req.user.id,
            { budgetTarget },
            { new: true }
        ).select('-passwordHash');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Calculate total spend today to log in budget history
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const logsToday = await Log.find({
            userId: req.user.id,
            date: { $gte: startOfToday }
        });
        const totalSpentToday = logsToday.reduce((sum, log) => sum + (log.cost || 0), 0);

        // Update/insert today's budget history record
        await BudgetHistory.findOneAndUpdate(
            {
                userId: req.user.id,
                date: { $gte: startOfToday }
            },
            {
                budgetTarget,
                spent: totalSpentToday,
                date: new Date()
            },
            { upsert: true, new: true }
        );

        res.json(user);
    } catch (err) {
        console.error('Update budget error:', err);
        res.status(500).json({ error: 'Server error updating budget' });
    }
};

exports.getBudgetHistory = async (req, res) => {
    try {
        // Fetch budget history for the last 30 days
        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() - 30);
        
        const history = await BudgetHistory.find({
            userId: req.user.id,
            date: { $gte: limitDate }
        }).sort({ date: 1 });

        res.json(history);
    } catch (err) {
        console.error('Fetch budget history error:', err);
        res.status(500).json({ error: 'Server error fetching budget history' });
    }
};

exports.updateDiet = async (req, res) => {
    try {
        const { dietType } = req.body;
        if (!['veg', 'vegan', 'nonveg'].includes(dietType)) {
            return res.status(400).json({ error: 'dietType must be veg, vegan, or nonveg' });
        }

        const user = await User.findByIdAndUpdate(
            req.user.id,
            { dietType },
            { new: true }
        ).select('-passwordHash');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(user);
    } catch (err) {
        console.error('Update diet error:', err);
        res.status(500).json({ error: 'Server error updating diet type' });
    }
};

exports.deleteProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Wipe all user-owned collections
        await User.findByIdAndDelete(userId);
        await Log.deleteMany({ userId });
        await Plan.deleteMany({ userId });
        await BudgetHistory.deleteMany({ userId });
        await WeightHistory.deleteMany({ userId });
        await ChatHistory.deleteMany({ userId });

        res.json({ success: true, message: 'User profile and all associated logs wiped successfully' });
    } catch (err) {
        console.error('Wipe profile error:', err);
        res.status(500).json({ error: 'Server error resetting profile' });
    }
};
