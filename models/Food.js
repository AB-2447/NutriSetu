const mongoose = require('mongoose');

const foodSchema = new mongoose.Schema({
    name:           { type: String, required: true, trim: true, unique: true },
    type:           { type: String, required: true, enum: ['vegetarian','vegan','non-vegetarian'] },
    protein:        { type: Number, required: true }, // g
    carbs:          { type: Number, required: true },   // g
    fats:           { type: Number, required: true },    // g
    calories:       { type: Number, required: true }, // kcal
    cost:           { type: Number, required: true },  // Default cost fallback (₹)
    studentFriendly:{ type: Boolean, default: true },
    category:       { type: String, required: true, enum: ['Breakfast','Lunch','Dinner','Snacks'] },
    ingredients:    [{
        name:       { type: String, required: true },
        qty:        { type: Number, required: true },
        unit:       { type: String, required: true, enum: ['g', 'ml', 'piece'] }
    }]
});

module.exports = mongoose.model('Food', foodSchema);
