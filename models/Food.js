const mongoose = require('mongoose');

const foodSchema = new mongoose.Schema({
    name:           { type: String, required: true, trim: true, unique: true, index: true },
    type:           { type: String, required: true, enum: ['vegetarian','vegan','non-vegetarian'] },
    protein:        { type: Number, required: true }, // g per 100g
    carbs:          { type: Number, required: true }, // g per 100g
    fats:           { type: Number, required: true }, // g per 100g
    calories:       { type: Number, required: true }, // kcal per 100g
    studentFriendly:{ type: Boolean, default: true },
    category:       [{ type: String, required: true }],
    ingredients:    [{
        name:       { type: String, required: true },
        qty:        { type: Number, required: true },
        unit:       { type: String, required: true, enum: ['g', 'ml', 'piece'] }
    }]
});

module.exports = mongoose.model('Food', foodSchema);
