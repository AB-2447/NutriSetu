const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    foodId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Food' },
    foodName: { type: String, required: true },
    calories: { type: Number, required: true },
    grams:    { type: Number, required: true, min: 1 },
    cost:     { type: Number, required: true, default: 0 }, // dynamically calculated at time of log
    type:     { type: String },
    date:     { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('Log', logSchema);
