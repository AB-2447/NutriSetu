const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name:          { type: String, required: true, trim: true },
    email:         { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    passwordHash:  { type: String, required: true },
    age:           { type: Number, required: true, min: 1, max: 130 },
    gender:        { type: String, required: true, enum: ['male', 'female'] },
    height:        { type: Number, required: true, min: 50, max: 300 }, // cm
    weight:        { type: Number, required: true, min: 10, max: 500 }, // kg
    targetWeight:  { type: Number, required: true, min: 10, max: 500 },
    activityLevel: { type: String, required: true, enum: ['sedentary','lightly','moderately','very','extra'] },
    goal:          { type: String, required: true, enum: ['loss','maintenance','gain'] },
    dietType:      { type: String, required: true, enum: ['veg','vegan','nonveg'], default: 'veg' },
    tdee:          { type: Number, required: true },
    calorieTarget: { type: Number, required: true },
    budgetTarget:  { type: Number, required: true, default: 300 }, // ₹ per day
    createdAt:     { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
