const mongoose = require('mongoose');
const Food = require('./models/Food');
const Ingredient = require('./models/Ingredient');
const Price = require('./models/Price');

// ── Baseline Ingredient Catalog ──
const rawIngredients = [
    { name: "Oats", category: "commodity", defaultUnit: "g", aliases: ["oatmeal", "oat"] },
    { name: "Poha", category: "commodity", defaultUnit: "g", aliases: ["flattened rice"] },
    { name: "Semolina", category: "commodity", defaultUnit: "g", aliases: ["rava", "upma"] },
    { name: "Rice", category: "commodity", defaultUnit: "g", aliases: ["basmati", "white rice", "steamed rice"] },
    { name: "Dal", category: "commodity", defaultUnit: "g", aliases: ["lentils", "lentil", "moong dal", "urad dal", "masoor dal"] },
    { name: "Wheat Flour", category: "commodity", defaultUnit: "g", aliases: ["atta", "roti", "paratha", "bread", "wheat", "pasta"] },
    { name: "Potato", category: "commodity", defaultUnit: "g", aliases: ["aloo", "potatoes"] },
    { name: "Onion", category: "commodity", defaultUnit: "g", aliases: ["onions"] },
    { name: "Tomato", category: "commodity", defaultUnit: "g", aliases: ["tomatoes"] },
    { name: "Spinach", category: "commodity", defaultUnit: "g", aliases: ["palak", "greens"] },
    { name: "Chickpeas", category: "commodity", defaultUnit: "g", aliases: ["chana", "chole", "sprouts", "kidney beans", "rajma"] },
    { name: "Oil", category: "commodity", defaultUnit: "ml", aliases: ["refined oil", "mustard oil"] },
    
    { name: "Milk", category: "dairy", defaultUnit: "ml", aliases: ["whole milk", "toned milk"] },
    { name: "Paneer", category: "dairy", defaultUnit: "g", aliases: ["cottage cheese"] },
    { name: "Curd", category: "dairy", defaultUnit: "g", aliases: ["yogurt", "greek yogurt", "dahi", "buttermilk", "chaas"] },
    { name: "Butter", category: "dairy", defaultUnit: "g", aliases: ["ghee", "white butter"] },
    { name: "Cheese", category: "dairy", defaultUnit: "g", aliases: ["cheddar", "mozzarella"] },
    
    { name: "Tofu", category: "vegan", defaultUnit: "g", aliases: ["soya curd"] },
    { name: "Soy Chunks", category: "vegan", defaultUnit: "g", aliases: ["soya chunks", "soy protein"] },
    { name: "Almond Milk", category: "vegan", defaultUnit: "ml", aliases: ["almond beverage"] },
    { name: "Peanuts", category: "vegan", defaultUnit: "g", aliases: ["groundnut", "peanut"] },
    { name: "Almonds", category: "vegan", defaultUnit: "g", aliases: ["almond"] },
    { name: "Jaggery", category: "vegan", defaultUnit: "g", aliases: ["gur", "sugar"] },
    
    { name: "Protein Bar", category: "packaged", defaultUnit: "piece", aliases: ["bar"] },
    { name: "Biscuits", category: "packaged", defaultUnit: "piece", aliases: ["biscuit", "cookie"] },
    
    { name: "Eggs", category: "meat", defaultUnit: "piece", aliases: ["egg", "boiled egg"] },
    { name: "Chicken", category: "meat", defaultUnit: "g", aliases: ["chicken breast", "chicken curry"] },
    { name: "Fish", category: "meat", defaultUnit: "g", aliases: ["fish fillet", "pomfret", "salmon"] },
    { name: "Mutton", category: "meat", defaultUnit: "g", aliases: ["mutton chunks"] }
];

// Baseline prices (₹ per standard unit: g, ml, or piece)
const basePrices = {
    "Oats": 0.05,        // ₹50/kg
    "Poha": 0.04,        // ₹40/kg
    "Semolina": 0.04,    // ₹40/kg
    "Rice": 0.05,        // ₹50/kg
    "Dal": 0.09,         // ₹90/kg
    "Wheat Flour": 0.04, // ₹40/kg
    "Potato": 0.02,      // ₹20/kg
    "Onion": 0.03,       // ₹30/kg
    "Tomato": 0.04,      // ₹40/kg
    "Spinach": 0.03,     // ₹30/kg
    "Chickpeas": 0.08,   // ₹80/kg
    "Oil": 0.15,         // ₹150/L
    "Milk": 0.06,        // ₹60/L
    "Paneer": 0.35,      // ₹350/kg
    "Curd": 0.08,        // ₹80/kg
    "Butter": 0.45,      // ₹450/kg
    "Cheese": 0.50,      // ₹500/kg
    "Tofu": 0.20,        // ₹200/kg
    "Soy Chunks": 0.10,  // ₹100/kg
    "Almond Milk": 0.18, // ₹180/L
    "Peanuts": 0.15,     // ₹150/kg
    "Almonds": 1.00,     // ₹1000/kg
    "Jaggery": 0.06,     // ₹60/kg
    "Protein Bar": 60,   // ₹60/piece
    "Biscuits": 5,       // ₹5/piece
    "Eggs": 6.5,         // ₹6.5/piece
    "Chicken": 0.24,     // ₹240/kg
    "Fish": 0.40,        // ₹400/kg
    "Mutton": 0.65       // ₹650/kg
};

// Helper to map food items to raw ingredients and quantities
const getFoodIngredients = (foodName) => {
    const name = foodName.toLowerCase();
    
    if (name.includes("oatmeal")) {
        return [
            { name: "Oats", qty: 50, unit: "g" },
            { name: "Milk", qty: 150, unit: "ml" },
            { name: "Jaggery", qty: 10, unit: "g" }
        ];
    } else if (name.includes("poha")) {
        return [
            { name: "Poha", qty: 60, unit: "g" },
            { name: "Peanuts", qty: 10, unit: "g" },
            { name: "Onion", qty: 20, unit: "g" },
            { name: "Oil", qty: 5, unit: "ml" }
        ];
    } else if (name.includes("upma")) {
        return [
            { name: "Semolina", qty: 60, unit: "g" },
            { name: "Onion", qty: 20, unit: "g" },
            { name: "Oil", qty: 5, unit: "ml" }
        ];
    } else if (name.includes("dosa")) {
        return [
            { name: "Rice", qty: 50, unit: "g" },
            { name: "Dal", qty: 15, unit: "g" },
            { name: "Butter", qty: 10, unit: "g" }
        ];
    } else if (name.includes("idli")) {
        return [
            { name: "Rice", qty: 50, unit: "g" },
            { name: "Dal", qty: 15, unit: "g" }
        ];
    } else if (name.includes("omelette") || name.includes("scrambled eggs")) {
        return [
            { name: "Eggs", qty: 2, unit: "piece" },
            { name: "Butter", qty: 5, unit: "g" },
            { name: "Onion", qty: 15, unit: "g" }
        ];
    } else if (name.includes("paratha")) {
        return [
            { name: "Wheat Flour", qty: 60, unit: "g" },
            { name: "Potato", qty: 40, unit: "g" },
            { name: "Butter", qty: 10, unit: "g" }
        ];
    } else if (name.includes("sandwich")) {
        return [
            { name: "Wheat Flour", qty: 50, unit: "g" }, // Bread
            { name: "Cheese", qty: 15, unit: "g" },
            { name: "Tomato", qty: 20, unit: "g" }
        ];
    } else if (name.includes("pancakes")) {
        return [
            { name: "Wheat Flour", qty: 50, unit: "g" },
            { name: "Milk", qty: 100, unit: "ml" },
            { name: "Butter", qty: 10, unit: "g" },
            { name: "Jaggery", qty: 15, unit: "g" }
        ];
    } else if (name.includes("yogurt bowl") || name.includes("greek yogurt")) {
        return [
            { name: "Curd", qty: 150, unit: "g" },
            { name: "Almonds", qty: 10, unit: "g" },
            { name: "Jaggery", qty: 10, unit: "g" }
        ];
    } else if (name.includes("smoothie")) {
        return [
            { name: "Milk", qty: 200, unit: "ml" },
            { name: "Oats", qty: 20, unit: "g" },
            { name: "Peanuts", qty: 15, unit: "g" }
        ];
    } else if (name.includes("dal rice") || name.includes("khichdi")) {
        return [
            { name: "Dal", qty: 40, unit: "g" },
            { name: "Rice", qty: 80, unit: "g" },
            { name: "Butter", qty: 5, unit: "g" } // representing ghee
        ];
    } else if (name.includes("rajma chawal")) {
        return [
            { name: "Chickpeas", qty: 50, unit: "g" }, // kidney beans
            { name: "Rice", qty: 80, unit: "g" },
            { name: "Tomato", qty: 30, unit: "g" },
            { name: "Oil", qty: 8, unit: "ml" }
        ];
    } else if (name.includes("chole bhature")) {
        return [
            { name: "Chickpeas", qty: 60, unit: "g" },
            { name: "Wheat Flour", qty: 80, unit: "g" },
            { name: "Oil", qty: 20, unit: "ml" }
        ];
    } else if (name.includes("paneer sabzi") || name.includes("paneer bhurji") || name.includes("palak paneer")) {
        return [
            { name: "Paneer", qty: 75, unit: "g" },
            { name: "Tomato", qty: 40, unit: "g" },
            { name: "Onion", qty: 30, unit: "g" },
            { name: "Wheat Flour", qty: 50, unit: "g" }, // roti
            { name: "Oil", qty: 8, unit: "ml" }
        ];
    } else if (name.includes("chicken curry") || name.includes("chicken breast") || name.includes("chicken stir fry") || name.includes("chicken soup")) {
        return [
            { name: "Chicken", qty: 100, unit: "g" },
            { name: "Onion", qty: 30, unit: "g" },
            { name: "Oil", qty: 10, unit: "ml" },
            { name: "Wheat Flour", qty: 50, unit: "g" } // roti/carb
        ];
    } else if (name.includes("egg curry")) {
        return [
            { name: "Eggs", qty: 2, unit: "piece" },
            { name: "Onion", qty: 30, unit: "g" },
            { name: "Rice", qty: 80, unit: "g" },
            { name: "Oil", qty: 8, unit: "ml" }
        ];
    } else if (name.includes("mix veg")) {
        return [
            { name: "Potato", qty: 40, unit: "g" },
            { name: "Onion", qty: 20, unit: "g" },
            { name: "Spinach", qty: 30, unit: "g" },
            { name: "Wheat Flour", qty: 50, unit: "g" }, // roti
            { name: "Oil", qty: 8, unit: "ml" }
        ];
    } else if (name.includes("biryani")) {
        const hasChicken = name.includes("chicken") || !name.includes("mutton");
        return [
            { name: hasChicken ? "Chicken" : "Mutton", qty: 100, unit: "g" },
            { name: "Rice", qty: 100, unit: "g" },
            { name: "Butter", qty: 10, unit: "g" }, // ghee
            { name: "Onion", qty: 30, unit: "g" }
        ];
    } else if (name.includes("tofu stir fry") || name.includes("tofu scramble")) {
        return [
            { name: "Tofu", qty: 100, unit: "g" },
            { name: "Onion", qty: 25, unit: "g" },
            { name: "Oil", qty: 6, unit: "ml" }
        ];
    } else if (name.includes("fish curry") || name.includes("fish fry")) {
        return [
            { name: "Fish", qty: 100, unit: "g" },
            { name: "Rice", qty: 80, unit: "g" },
            { name: "Oil", qty: 10, unit: "ml" }
        ];
    } else if (name.includes("soya chunks curry")) {
        return [
            { name: "Soy Chunks", qty: 40, unit: "g" },
            { name: "Onion", qty: 25, unit: "g" },
            { name: "Tomato", qty: 30, unit: "g" },
            { name: "Oil", qty: 8, unit: "ml" }
        ];
    } else if (name.includes("pasta")) {
        return [
            { name: "Wheat Flour", qty: 70, unit: "g" }, // pasta sheets
            { name: "Cheese", qty: 20, unit: "g" },
            { name: "Tomato", qty: 40, unit: "g" },
            { name: "Oil", qty: 5, unit: "ml" }
        ];
    } else if (name.includes("salad bowl")) {
        return [
            { name: "Spinach", qty: 50, unit: "g" },
            { name: "Tomato", qty: 40, unit: "g" },
            { name: "Onion", qty: 25, unit: "g" },
            { name: "Oil", qty: 5, unit: "ml" }
        ];
    } else if (name.includes("wrap")) {
        return [
            { name: "Wheat Flour", qty: 50, unit: "g" },
            { name: "Paneer", qty: 40, unit: "g" },
            { name: "Onion", qty: 20, unit: "g" }
        ];
    } else if (name.includes("roasted almonds")) {
        return [
            { name: "Almonds", qty: 25, unit: "g" },
            { name: "Oil", qty: 2, unit: "ml" }
        ];
    } else if (name.includes("fruit salad")) {
        return [
            { name: "Jaggery", qty: 5, unit: "g" } // mock sweetener
        ];
    } else if (name.includes("roasted chana")) {
        return [
            { name: "Chickpeas", qty: 30, unit: "g" }
        ];
    } else if (name.includes("sprout chaat")) {
        return [
            { name: "Chickpeas", qty: 40, unit: "g" }, // sprouts
            { name: "Onion", qty: 15, unit: "g" },
            { name: "Tomato", qty: 20, unit: "g" }
        ];
    } else if (name.includes("makhana")) {
        return [
            { name: "Butter", qty: 5, unit: "g" } // ghee roasted
        ];
    } else if (name.includes("protein bar")) {
        return [
            { name: "Protein Bar", qty: 1, unit: "piece" }
        ];
    } else if (name.includes("boiled corn")) {
        return [
            { name: "Butter", qty: 5, unit: "g" }
        ];
    } else if (name.includes("biscuits")) {
        return [
            { name: "Biscuits", qty: 3, unit: "piece" }
        ];
    } else if (name.includes("paneer cubes") || name.includes("paneer tikka")) {
        return [
            { name: "Paneer", qty: 50, unit: "g" },
            { name: "Oil", qty: 3, unit: "ml" }
        ];
    } else if (name.includes("peanuts")) {
        return [
            { name: "Peanuts", qty: 30, unit: "g" }
        ];
    } else if (name.includes("popcorn")) {
        return [
            { name: "Oil", qty: 5, unit: "ml" }
        ];
    } else if (name.includes("boiled egg")) {
        return [
            { name: "Eggs", qty: 2, unit: "piece" }
        ];
    }
    
    // Default fallback
    return [
        { name: "Wheat Flour", qty: 30, unit: "g" },
        { name: "Oil", qty: 2, unit: "ml" }
    ];
};

// ── Expanded food database: 60+ items ──
const generateFoodDatabase = () => {
    const db = [];
    
    const breakfastBases = [
        { name: "Oatmeal", type: "vegan", p: 5, c: 30, f: 3, cal: 150, cost: 20 },
        { name: "Poha", type: "vegan", p: 4, c: 40, f: 3, cal: 250, cost: 15 },
        { name: "Upma", type: "vegan", p: 5, c: 30, f: 5, cal: 200, cost: 15 },
        { name: "Dosa", type: "vegan", p: 5, c: 40, f: 6, cal: 235, cost: 25 },
        { name: "Idli", type: "vegan", p: 7, c: 45, f: 2, cal: 225, cost: 20 },
        { name: "Omelette", type: "non-vegetarian", p: 14, c: 4, f: 12, cal: 182, cost: 22 },
        { name: "Scrambled Eggs", type: "non-vegetarian", p: 13, c: 1, f: 11, cal: 155, cost: 20 },
        { name: "Paratha", type: "vegetarian", p: 5, c: 38, f: 10, cal: 260, cost: 20 },
        { name: "Sandwich", type: "vegetarian", p: 8, c: 30, f: 8, cal: 220, cost: 30 },
        { name: "Pancakes", type: "vegetarian", p: 6, c: 45, f: 10, cal: 300, cost: 40 },
        { name: "Yogurt Bowl", type: "vegetarian", p: 10, c: 15, f: 2, cal: 120, cost: 50 },
        { name: "Smoothie", type: "vegetarian", p: 6, c: 42, f: 3, cal: 218, cost: 30 }
    ];

    const lunchDinnerBases = [
        { name: "Dal Rice", type: "vegan", p: 14, c: 60, f: 2, cal: 380, cost: 25 },
        { name: "Rajma Chawal", type: "vegan", p: 16, c: 68, f: 3, cal: 430, cost: 30 },
        { name: "Chole Bhature", type: "vegan", p: 15, c: 80, f: 18, cal: 580, cost: 45 },
        { name: "Paneer Sabzi + Roti", type: "vegetarian", p: 18, c: 35, f: 18, cal: 380, cost: 60 },
        { name: "Chicken Curry + Rice", type: "non-vegetarian", p: 30, c: 55, f: 16, cal: 490, cost: 90 },
        { name: "Egg Curry + Rice", type: "non-vegetarian", p: 18, c: 50, f: 14, cal: 410, cost: 40 },
        { name: "Mix Veg + Roti", type: "vegan", p: 8, c: 42, f: 5, cal: 250, cost: 20 },
        { name: "Biryani", type: "non-vegetarian", p: 32, c: 62, f: 18, cal: 550, cost: 120 },
        { name: "Khichdi", type: "vegan", p: 10, c: 50, f: 4, cal: 285, cost: 20 },
        { name: "Tofu Stir Fry", type: "vegan", p: 14, c: 48, f: 8, cal: 330, cost: 55 },
        { name: "Fish Curry + Rice", type: "non-vegetarian", p: 28, c: 48, f: 10, cal: 410, cost: 100 },
        { name: "Soya Chunks Curry", type: "vegan", p: 20, c: 15, f: 3, cal: 168, cost: 25 },
        { name: "Pasta", type: "vegetarian", p: 12, c: 55, f: 14, cal: 400, cost: 70 },
        { name: "Salad Bowl", type: "vegan", p: 6, c: 15, f: 8, cal: 150, cost: 60 },
        { name: "Wrap", type: "vegetarian", p: 10, c: 35, f: 12, cal: 300, cost: 50 }
    ];

    const snackBases = [
        { name: "Roasted Almonds", type: "vegan", p: 6, c: 6, f: 14, cal: 164, cost: 50 },
        { name: "Fruit Salad", type: "vegan", p: 1, c: 25, f: 0.2, cal: 95, cost: 30 },
        { name: "Roasted Chana", type: "vegan", p: 8, c: 18, f: 2, cal: 120, cost: 10 },
        { name: "Sprout Chaat", type: "vegan", p: 8, c: 16, f: 0.5, cal: 100, cost: 10 },
        { name: "Makhana", type: "vegetarian", p: 4, c: 20, f: 0.5, cal: 100, cost: 40 },
        { name: "Protein Bar", type: "vegetarian", p: 20, c: 25, f: 8, cal: 250, cost: 80 },
        { name: "Boiled Corn", type: "vegan", p: 3, c: 21, f: 1, cal: 96, cost: 15 },
        { name: "Biscuits", type: "vegetarian", p: 3, c: 22, f: 5, cal: 140, cost: 10 },
        { name: "Paneer Cubes", type: "vegetarian", p: 9, c: 1, f: 9, cal: 120, cost: 30 },
        { name: "Greek Yogurt", type: "vegetarian", p: 10, c: 4, f: 0.7, cal: 64, cost: 50 },
        { name: "Peanuts", type: "vegan", p: 7, c: 5, f: 12, cal: 160, cost: 10 },
        { name: "Popcorn", type: "vegan", p: 3, c: 15, f: 1, cal: 90, cost: 20 }
    ];

    const modifiers = ["Spicy", "Sweet", "Tangy", "Garlic", "Roasted", "Grilled", "Fried", "Baked", "Steamed", "Smoked", "Homestyle", "Special", "Classic", "Healthy", "Cheesy", "Butter", "Masala", "Herbed", "Zesty", "Creamy"];

    const generatedNames = new Set();

    const generateVariations = (bases, category, targetCount) => {
        let count = 0;
        let attempt = 0;

        while (count < targetCount && attempt < 5000) {
            attempt++;
            const base = bases[Math.floor(Math.random() * bases.length)];
            const modifier1 = modifiers[Math.floor(Math.random() * modifiers.length)];
            const modifier2 = modifiers[Math.floor(Math.random() * modifiers.length)];
            
            const namePatterns = [
                `${modifier1} ${base.name}`,
                `${base.name} with ${modifier1} Sauce`,
                `${modifier1} & ${modifier2} ${base.name}`,
                `${base.name} (${modifier1})`,
                `Chef's Special ${base.name}`
            ];
            const finalName = namePatterns[Math.floor(Math.random() * namePatterns.length)];

            if (!generatedNames.has(finalName)) {
                generatedNames.add(finalName);
                
                const varFactor = () => 0.85 + (Math.random() * 0.3);
                const p = Math.round(base.p * varFactor());
                const c = Math.round(base.c * varFactor());
                const f = Math.round(base.f * varFactor());
                const cal = Math.round((p * 4) + (c * 4) + (f * 9));
                const cost = Math.round(base.cost * varFactor());
                const studentFriendly = cost <= 50;

                db.push({
                    name: finalName,
                    type: base.type === "vegetarian" ? "vegetarian" : base.type === "vegan" ? "vegan" : "non-vegetarian",
                    protein: p,
                    carbs: c,
                    fats: f,
                    calories: cal,
                    cost: cost,
                    studentFriendly: studentFriendly,
                    category: category,
                    ingredients: getFoodIngredients(base.name)
                });
                count++;
            }
        }
    };

    // Generate balanced distribution
    generateVariations(breakfastBases, "Breakfast", 260);
    generateVariations(lunchDinnerBases, "Lunch", 260);
    generateVariations(lunchDinnerBases, "Dinner", 260);
    generateVariations(snackBases, "Snacks", 260);

    return db;
};

async function seedDatabase() {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/nutrisetu';
        console.log(`Connecting to: ${mongoUri}`);
        await mongoose.connect(mongoUri);
        console.log('MongoDB connected successfully for seeding.');

        // 1. Seed Ingredients
        await Ingredient.deleteMany({});
        console.log('Cleared existing ingredients.');
        const seededIngredients = await Ingredient.insertMany(rawIngredients);
        console.log(`✅ Seeded ${seededIngredients.length} ingredients.`);

        // 2. Seed Initial Price Cache
        await Price.deleteMany({});
        console.log('Cleared existing price caches.');
        const priceRecords = seededIngredients.map(ing => {
            const priceVal = basePrices[ing.name];
            return {
                ingredient: ing._id,
                normalizedPrice: priceVal || 0.1,
                unit: ing.defaultUnit,
                source: "Baseline Seeder",
                updatedAt: new Date()
            };
        });
        await Price.insertMany(priceRecords);
        console.log(`✅ Seeded ${priceRecords.length} price cache records.`);

        // 3. Seed Foods
        await Food.deleteMany({});
        console.log('Cleared existing food entries.');
        const foodDatabase = generateFoodDatabase();
        
        // Map food types appropriately
        const formattedFoods = foodDatabase.map(food => {
            let mappedType = "vegetarian";
            if (food.type === "vegan") mappedType = "vegan";
            else if (food.type === "non-vegetarian" || food.type === "nonveg" || food.type === "non-veg") mappedType = "non-vegetarian";
            return {
                ...food,
                type: mappedType
            };
        });

        await Food.insertMany(formattedFoods);
        console.log(`✅ Seeded ${formattedFoods.length} food items with ingredients successfully.`);

    } catch (err) {
        console.error('Error seeding database:', err);
        process.exitCode = 1;
    } finally {
        await mongoose.connection.close();
        console.log('MongoDB connection closed.');
    }
}

seedDatabase();
