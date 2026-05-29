const mongoose = require('mongoose');
const Food = require('./models/Food');
const dotenv = require('dotenv');

dotenv.config();

const USDA_API_KEY = process.env.USDA_API_KEY || 'DEMO_KEY';
const USDA_SEARCH_URL = `https://api.nal.usda.gov/fdc/v1/foods/search`;

const foodList = [
    { query: "Scrambled Eggs", type: "non-vegetarian", category: "Breakfast", cost: 20 },
    { query: "Banana, raw", type: "vegan", category: "Snacks", cost: 10 },
    { query: "Oatmeal", type: "vegan", category: "Breakfast", cost: 25 },
    { query: "Whole Milk", type: "vegetarian", category: "Breakfast", cost: 20 },
    { query: "Grilled Chicken Breast", type: "non-vegetarian", category: "Dinner", cost: 120 },
    { query: "Steamed White Rice", type: "vegan", category: "Lunch", cost: 15 },
    { query: "Lentils, boiled", type: "vegan", category: "Lunch", cost: 30 }, 
    { query: "Paneer", type: "vegetarian", category: "Lunch", cost: 50 },
    { query: "Spinach, raw", type: "vegan", category: "Dinner", cost: 15 },
    { query: "Whole Wheat Bread", type: "vegan", category: "Breakfast", cost: 10 },
    { query: "Almonds, raw", type: "vegan", category: "Snacks", cost: 80 },
    { query: "Boiled Eggs", type: "non-vegetarian", category: "Snacks", cost: 15 },
    { query: "Yogurt, plain", type: "vegetarian", category: "Breakfast", cost: 30 },
    { query: "Roasted Peanuts", type: "vegan", category: "Snacks", cost: 15 },
    { query: "Apple, raw", type: "vegan", category: "Snacks", cost: 20 }
];

const getFoodIngredients = (queryName) => {
    const name = queryName.toLowerCase();
    if (name.includes("eggs") || name.includes("egg")) {
        return [{ name: "Eggs", qty: 2, unit: "piece" }];
    } else if (name.includes("banana")) {
        return [{ name: "Banana", qty: 1, unit: "piece" }];
    } else if (name.includes("oatmeal") || name.includes("oats")) {
        return [
            { name: "Oats", qty: 50, unit: "g" },
            { name: "Milk", qty: 100, unit: "ml" }
        ];
    } else if (name.includes("milk")) {
        return [{ name: "Milk", qty: 200, unit: "ml" }];
    } else if (name.includes("chicken")) {
        return [{ name: "Chicken", qty: 120, unit: "g" }];
    } else if (name.includes("rice")) {
        return [{ name: "Rice", qty: 100, unit: "g" }];
    } else if (name.includes("lentils") || name.includes("dal")) {
        return [{ name: "Dal", qty: 50, unit: "g" }];
    } else if (name.includes("paneer")) {
        return [{ name: "Paneer", qty: 80, unit: "g" }];
    } else if (name.includes("spinach")) {
        return [{ name: "Spinach", qty: 50, unit: "g" }];
    } else if (name.includes("bread") || name.includes("roti")) {
        return [{ name: "Wheat Flour", qty: 40, unit: "g" }];
    } else if (name.includes("almonds")) {
        return [{ name: "Almonds", qty: 20, unit: "g" }];
    } else if (name.includes("yogurt") || name.includes("curd")) {
        return [{ name: "Curd", qty: 150, unit: "g" }];
    } else if (name.includes("peanuts")) {
        return [{ name: "Peanuts", qty: 30, unit: "g" }];
    } else if (name.includes("apple")) {
        return [{ name: "Jaggery", qty: 5, unit: "g" }]; // mock sweetener representation
    }
    return [{ name: "Wheat Flour", qty: 30, unit: "g" }];
};

async function fetchUSDAFoodData(item) {
    try {
        const url = `${USDA_SEARCH_URL}?api_key=${USDA_API_KEY}&query=${encodeURIComponent(item.query)}&pageSize=1`;
        const response = await fetch(url);
        
        if (!response.ok) {
            console.error(`Failed to fetch ${item.query}: HTTP ${response.status}`);
            return null;
        }

        const data = await response.json();
        if (!data.foods || data.foods.length === 0) {
            console.warn(`No results found for ${item.query}`);
            return null;
        }

        const foodInfo = data.foods[0];
        const nutrients = foodInfo.foodNutrients;

        const getVal = (id) => {
            const nutrient = nutrients.find(n => n.nutrientId === id || n.nutrientNumber === id.toString());
            return nutrient ? nutrient.value : 0;
        };

        return {
            name: `${item.query} (USDA ${foodInfo.fdcId})`,
            type: item.type,
            category: item.category,
            cost: item.cost,
            studentFriendly: item.cost < 50,
            calories: Math.round(getVal(1008)),
            protein: Math.round(getVal(1003)),
            fats: Math.round(getVal(1004)),
            carbs: Math.round(getVal(1005)),
            ingredients: getFoodIngredients(item.query)
        };
    } catch (err) {
        console.error(`Error fetching USDA data for ${item.query}:`, err);
        return null;
    }
}

async function seedDatabase() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/nutrisetu');
        console.log('MongoDB connected for USDA seeding.');

        console.log('Fetching data from USDA FoodData Central API...');
        const usdaFoods = [];

        for (const item of foodList) {
            console.log(`Fetching: ${item.query}...`);
            const mappedFood = await fetchUSDAFoodData(item);
            if (mappedFood) {
                usdaFoods.push(mappedFood);
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (usdaFoods.length > 0) {
            await Food.deleteMany({});
            console.log('Cleared existing food entries.');

            await Food.insertMany(usdaFoods);
            console.log(`✅ Inserted ${usdaFoods.length} USDA food items successfully.`);
            
            const cats = {};
            usdaFoods.forEach(f => { cats[f.category] = (cats[f.category] || 0) + 1; });
            console.log('Category breakdown:', cats);
        } else {
            console.log('No food items were fetched successfully. Database remains unchanged.');
        }

    } catch (err) {
        console.error('Error in USDA seed script:', err);
        process.exitCode = 1;
    } finally {
        await mongoose.connection.close();
        console.log('MongoDB connection closed.');
    }
}

seedDatabase();
