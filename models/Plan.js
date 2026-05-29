const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
    userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    calorieTarget: { type: Number, required: true },
    goal:          { type: String, required: true },
    createdAt:     { type: Date, default: Date.now }
});

module.exports = mongoose.model('Plan', planSchema);
