const mongoose = require('mongoose');

const priceSchema = new mongoose.Schema({
    ingredient:      { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true, index: true },
    normalizedPrice: { type: Number, required: true }, // price in ₹ per g/ml/piece
    unit:            { type: String, required: true },
    source:          { type: String, required: true },
    updatedAt:       { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('Price', priceSchema);
