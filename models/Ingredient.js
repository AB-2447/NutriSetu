const mongoose = require('mongoose');

const ingredientSchema = new mongoose.Schema({
    name:        { type: String, required: true, unique: true, index: true, trim: true },
    category:    { type: String, required: true, enum: ['commodity', 'dairy', 'meat', 'vegan', 'packaged'] },
    defaultUnit: { type: String, required: true, enum: ['g', 'ml', 'piece'] },
    aliases:     [{ type: String }] // matches variation in naming
});

module.exports = mongoose.model('Ingredient', ingredientSchema);
