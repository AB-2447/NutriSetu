const mongoose = require('mongoose');

const weightHistorySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    weight: { type: Number, required: true },
    date:   { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('WeightHistory', weightHistorySchema);
