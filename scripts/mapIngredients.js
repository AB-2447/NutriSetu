const mongoose = require('mongoose');
const Food = require('../models/Food');
require('dotenv').config({ path: '../.env' });

// Heuristic recipe mapping based on keywords
const recipeRules = [
    // Breads / Rotis
    { keywords: ['roti', 'chapati', 'phulka', 'paratha'], ingredients: [{ name: 'Wheat Flour', qty: 30, unit: 'g' }, { name: 'Oil', qty: 5, unit: 'ml' }] },
    { keywords: ['puri'], ingredients: [{ name: 'Wheat Flour', qty: 25, unit: 'g' }, { name: 'Oil', qty: 15, unit: 'ml' }] },
    { keywords: ['bhakri'], ingredients: [{ name: 'Sorghum', qty: 40, unit: 'g' }] },
    
    // Breakfast items
    { keywords: ['idli'], ingredients: [{ name: 'Rice', qty: 30, unit: 'g' }, { name: 'Dal', qty: 10, unit: 'g' }] },
    { keywords: ['dosa', 'dosai'], ingredients: [{ name: 'Rice', qty: 40, unit: 'g' }, { name: 'Dal', qty: 15, unit: 'g' }, { name: 'Oil', qty: 5, unit: 'ml' }] },
    { keywords: ['upma'], ingredients: [{ name: 'Semolina', qty: 50, unit: 'g' }, { name: 'Oil', qty: 5, unit: 'ml' }, { name: 'Onion', qty: 20, unit: 'g' }] },
    { keywords: ['poha', 'pohe'], ingredients: [{ name: 'Poha', qty: 50, unit: 'g' }, { name: 'Peanuts', qty: 10, unit: 'g' }, { name: 'Onion', qty: 20, unit: 'g' }] },
    { keywords: ['oats'], ingredients: [{ name: 'Oats', qty: 40, unit: 'g' }, { name: 'Milk', qty: 150, unit: 'ml' }] },
    { keywords: ['sandwich'], ingredients: [{ name: 'Bread', qty: 50, unit: 'g' }, { name: 'Tomato', qty: 20, unit: 'g' }, { name: 'Cheese', qty: 15, unit: 'g' }] },
    
    // Rice dishes
    { keywords: ['pulao', 'khichdi'], ingredients: [{ name: 'Rice', qty: 60, unit: 'g' }, { name: 'Dal', qty: 20, unit: 'g' }, { name: 'Potato', qty: 30, unit: 'g' }] },
    { keywords: ['rice', 'chawal'], ingredients: [{ name: 'Rice', qty: 80, unit: 'g' }] },
    
    // Curries / Mains
    { keywords: ['paneer'], ingredients: [{ name: 'Paneer', qty: 80, unit: 'g' }, { name: 'Tomato', qty: 40, unit: 'g' }, { name: 'Oil', qty: 10, unit: 'ml' }] },
    { keywords: ['chicken', 'murgh'], ingredients: [{ name: 'Chicken', qty: 120, unit: 'g' }, { name: 'Onion', qty: 40, unit: 'g' }, { name: 'Oil', qty: 10, unit: 'ml' }] },
    { keywords: ['fish'], ingredients: [{ name: 'Fish', qty: 100, unit: 'g' }, { name: 'Oil', qty: 10, unit: 'ml' }] },
    { keywords: ['mutton'], ingredients: [{ name: 'Mutton', qty: 120, unit: 'g' }, { name: 'Onion', qty: 50, unit: 'g' }] },
    { keywords: ['egg', 'anda'], ingredients: [{ name: 'Eggs', qty: 2, unit: 'piece' }, { name: 'Oil', qty: 5, unit: 'ml' }] },
    { keywords: ['dal', 'amti'], ingredients: [{ name: 'Dal', qty: 50, unit: 'g' }, { name: 'Tomato', qty: 20, unit: 'g' }] },
    { keywords: ['chole', 'chana', 'chickpea'], ingredients: [{ name: 'Chickpeas', qty: 60, unit: 'g' }, { name: 'Onion', qty: 30, unit: 'g' }] },
    { keywords: ['rajma'], ingredients: [{ name: 'Rajma', qty: 60, unit: 'g' }, { name: 'Tomato', qty: 30, unit: 'g' }] },
    { keywords: ['sabzi', 'bhaji', 'curry'], ingredients: [{ name: 'Potato', qty: 50, unit: 'g' }, { name: 'Spinach', qty: 30, unit: 'g' }, { name: 'Oil', qty: 10, unit: 'ml' }] },
    
    // Snacks / Others
    { keywords: ['salad'], ingredients: [{ name: 'Tomato', qty: 50, unit: 'g' }, { name: 'Onion', qty: 30, unit: 'g' }, { name: 'Spinach', qty: 50, unit: 'g' }] },
    { keywords: ['milk', 'shake', 'smoothie'], ingredients: [{ name: 'Milk', qty: 200, unit: 'ml' }] },
    { keywords: ['tea', 'chai'], ingredients: [{ name: 'Milk', qty: 100, unit: 'ml' }, { name: 'Jaggery', qty: 10, unit: 'g' }] },
    { keywords: ['coffee'], ingredients: [{ name: 'Milk', qty: 100, unit: 'ml' }, { name: 'Jaggery', qty: 10, unit: 'g' }] },
    { keywords: ['pizza'], ingredients: [{ name: 'Wheat Flour', qty: 60, unit: 'g' }, { name: 'Cheese', qty: 40, unit: 'g' }, { name: 'Tomato', qty: 30, unit: 'g' }] },
    { keywords: ['pasta', 'noodles', 'maggi'], ingredients: [{ name: 'Wheat Flour', qty: 60, unit: 'g' }, { name: 'Tomato', qty: 30, unit: 'g' }, { name: 'Oil', qty: 10, unit: 'ml' }] },
];

async function run() {
    await mongoose.connect('mongodb://127.0.0.1:27017/nutrisetu');
    console.log('Connected to DB');
    
    const foods = await Food.find({});
    let updatedCount = 0;
    
    for (const food of foods) {
        if (food.ingredients && food.ingredients.length > 0) continue; // Skip if already has ingredients
        
        const lowerName = food.name.toLowerCase();
        let matched = false;
        
        // Find best matching rule
        for (const rule of recipeRules) {
            if (rule.keywords.some(k => lowerName.includes(k))) {
                food.ingredients = rule.ingredients;
                
                // Fine-tune quantities based on actual calories of the food vs base ingredients
                // (Simplified: just assign the base ingredients for now so dynamic pricing kicks in)
                
                await food.save();
                updatedCount++;
                matched = true;
                break;
            }
        }
        
        // Fallback for items that don't match any keywords
        if (!matched) {
            // Default generic ingredients based on category to ensure dynamic pricing activates
            const generic = [
                { name: 'Wheat Flour', qty: 20, unit: 'g' },
                { name: 'Rice', qty: 20, unit: 'g' },
                { name: 'Dal', qty: 20, unit: 'g' }
            ];
            food.ingredients = generic;
            await food.save();
            updatedCount++;
        }
    }
    
    console.log(`Updated ${updatedCount} foods with base ingredients.`);
    process.exit(0);
}

run();
