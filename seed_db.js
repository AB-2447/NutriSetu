const mongoose = require('mongoose');
const Food = require('./models/Food');
require('dotenv').config();

const rawData = require('./seed_n.js');

async function seedDatabase() {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/nutrisetu';
    
    try {
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB.');

        console.log('Clearing old food data...');
        await Food.deleteMany({});
        console.log('Old food data cleared.');

        const foodsToInsert = rawData.foods.map(item => {
            // Map categories to match enum or standard capitalization
            const mappedCategories = item.category.map(c => {
                const lower = c.toLowerCase();
                if (lower.includes('breakfast')) return 'Breakfast';
                if (lower.includes('lunch')) return 'Lunch';
                if (lower.includes('dinner')) return 'Dinner';
                if (lower.includes('snack')) return 'Snacks';
                return 'Snacks'; // Default
            });

            // Map type
            let mappedType = 'vegetarian';
            if (item.type) {
                const t = item.type.toLowerCase();
                if (t === 'veg' || t === 'vegetarian') mappedType = 'vegetarian';
                else if (t === 'vegan') mappedType = 'vegan';
                else if (t === 'non-veg' || t === 'non-vegetarian') mappedType = 'non-vegetarian';
            }

            // Convert ingredients object to array
            const ingredientsArray = [];
            if (item.ingredients) {
                for (const [name, qty] of Object.entries(item.ingredients)) {
                    ingredientsArray.push({
                        name: name.trim(),
                        qty: parseFloat(qty) || 0,
                        unit: 'g' // Defaulting to grams since it's a per 100g database
                    });
                }
            }

            return {
                name: item.name,
                type: mappedType,
                protein: item.proteins || 0,
                carbs: item.carbohydrates || 0,
                fats: item.fat || 0,
                calories: item.calories || 0,
                studentFriendly: true, // Assuming true by default for base ingredients, algorithms handle premium logic
                category: mappedCategories,
                ingredients: ingredientsArray
            };
        });

        console.log(`Inserting ${foodsToInsert.length} food items...`);
        await Food.insertMany(foodsToInsert);
        console.log('Database seeded successfully with new per-100g architecture!');

    } catch (error) {
        console.error('Error seeding database:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

seedDatabase();
