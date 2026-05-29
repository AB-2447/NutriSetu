const mongoose = require('mongoose');

const budgetHistorySchema = new mongoose.Schema({
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    budgetTarget: { type: Number, required: true },
    spent:        { type: Number, required: true },
    date:         { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('BudgetHistory', budgetHistorySchema);
