const Food = require('../models/Food');
const costCalculator = require('./costCalculator');

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS & CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const BUDGET_LEVELS = {
    LOW: { min: 80, max: 150 },
    MEDIUM: { min: 150, max: 300 },
    HIGH: { min: 300, max: 600 },
    PREMIUM: { min: 600, max: Infinity }
};

const INGREDIENT_SWAP_TABLE = {
    'paneer': {
        replacement: 'Soy Chunks',
        savings: 25,
        reason: 'Soy chunks are a high-protein, budget-friendly vegan substitute.'
    },
    'almonds': {
        replacement: 'Peanuts',
        savings: 40,
        reason: 'Peanuts offer similar healthy fats and protein at 1/5th the cost.'
    },
    'fish': {
        replacement: 'Eggs',
        savings: 30,
        reason: 'Eggs are a highly bioavailable protein source at a fraction of fish prices.'
    },
    'tofu': {
        replacement: 'Soy Chunks',
        savings: 15,
        reason: 'Soy chunks provide excellent vegan protein at lower retail costs.'
    },
    'chicken breast': {
        replacement: 'Eggs',
        savings: 20,
        reason: 'Eggs provide complete proteins and are more budget-friendly than chicken breast.'
    },
    'chicken': {
        replacement: 'Eggs',
        savings: 15,
        reason: 'Eggs are a cheap and highly nutritious animal protein alternative.'
    }
};

const CALORIE_TOLERANCE              = 0.20;
const STUDENT_FRIENDLY_COST_PER_ITEM = 40;
const MAX_PRICE_SNAPSHOTS = 30;

const SPIKE_THRESHOLDS = {
    warning:  0.10,  // +10%
    high:     0.25,  // +25%
    critical: 0.50   // +50%
};

const MIN_SUBSTITUTE_SCORE = 0.50;

const PRESSURE_LEVELS = {
    ok:         0.00,
    tight:      0.15,
    stressed:   0.35
};

// ─────────────────────────────────────────────────────────────────────────────
// PRICE HISTORY (In-memory cache tracker)
// ─────────────────────────────────────────────────────────────────────────────
const priceStore = {};

function recordPrice(foodId, cost) {
    if (!priceStore[foodId]) priceStore[foodId] = [];
    priceStore[foodId].push({ cost, recordedAt: new Date().toISOString() });
    if (priceStore[foodId].length > MAX_PRICE_SNAPSHOTS) {
        priceStore[foodId] = priceStore[foodId].slice(-MAX_PRICE_SNAPSHOTS);
    }
}

function getPriceBaseline(foodId) {
    const history = priceStore[foodId];
    if (!history || history.length === 0) return null;

    const sorted = [...history].map(h => h.cost).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
}

// ─────────────────────────────────────────────────────────────────────────────
// SPIKE DETECTOR
// ─────────────────────────────────────────────────────────────────────────────
function getSpikeLevel(foodId, currentCost) {
    const baseline = getPriceBaseline(foodId);
    if (baseline === null || baseline <= 0) {
        return { level: null, baseline: null, changePercent: null };
    }

    const changePercent = (currentCost - baseline) / baseline;

    let level = null;
    if      (changePercent >= SPIKE_THRESHOLDS.critical) level = 'critical';
    else if (changePercent >= SPIKE_THRESHOLDS.high)     level = 'high';
    else if (changePercent >= SPIKE_THRESHOLDS.warning)  level = 'warning';

    return {
        level,
        baseline:      Math.round(baseline * 100) / 100,
        changePercent: Math.round(changePercent * 1000) / 10
    };
}

function isSpiked(foodId, currentCost) {
    return getSpikeLevel(foodId, currentCost).level !== null;
}

function detectSpikes(foodsWithCosts) {
    const levelOrder = { critical: 0, high: 1, warning: 2 };
    return foodsWithCosts
        .map(({ food, calculatedCost }) => {
            const id = food._id.toString();
            const { level, baseline, changePercent } = getSpikeLevel(id, calculatedCost);
            if (!level) return null;
            return {
                foodId:      id,
                foodName:    food.name,
                currentCost: Math.round(calculatedCost * 100) / 100,
                baseline,
                changePercent,
                level
            };
        })
        .filter(Boolean)
        .sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBSTITUTE FINDER
// ─────────────────────────────────────────────────────────────────────────────
function scoreSubstitute(original, candidate) {
    const proximity = (orig, cand) =>
        orig <= 0 ? 1 : Math.max(0, 1 - Math.abs(cand - orig) / orig);

    const calScore  = proximity(original.calories,        candidate.calories);
    const protScore = proximity(original.protein,         candidate.protein);
    const costImpro = original.calculatedCost > 0
        ? Math.min(1, (original.calculatedCost - candidate.calculatedCost) / original.calculatedCost)
        : 0;
    const costScore = costImpro > 0 ? costImpro : 0;

    return (calScore * 0.4) + (protScore * 0.4) + (costScore * 0.2);
}

function getAcceptableSubstituteTypes(originalType) {
    if (originalType === 'vegan')      return ['vegan'];
    if (originalType === 'vegetarian') return ['vegan', 'vegetarian'];
    return ['vegan', 'vegetarian', 'non-vegetarian'];
}

function findSubstitute(spikedItem, allCategoryItems) {
    const spikedId          = spikedItem.food._id.toString();
    const acceptableTypes   = getAcceptableSubstituteTypes(spikedItem.food.type);

    let bestCandidate = null;
    let bestScore     = MIN_SUBSTITUTE_SCORE;

    for (const candidate of allCategoryItems) {
        const candidateId = candidate.food._id.toString();
        if (candidateId === spikedId)                              continue;
        if (!acceptableTypes.includes(candidate.food.type))       continue;
        if (candidate.calculatedCost >= spikedItem.calculatedCost) continue;
        if (isSpiked(candidateId, candidate.calculatedCost))       continue;

        const score = scoreSubstitute(spikedItem, candidate);
        if (score > bestScore) {
            bestScore     = score;
            bestCandidate = candidate;
        }
    }

    if (!bestCandidate) return null;

    const savingsPercent = spikedItem.calculatedCost > 0
        ? Math.round(
            ((spikedItem.calculatedCost - bestCandidate.calculatedCost) / spikedItem.calculatedCost) * 1000
          ) / 10
        : 0;

    return { ...bestCandidate, substituteScore: Math.round(bestScore * 100) / 100, savingsPercent };
}

// ─────────────────────────────────────────────────────────────────────────────
// BUDGET PRESSURE ANALYSER
// ─────────────────────────────────────────────────────────────────────────────
function estimateMinimumDailyCost(foodsWithCosts, calorieTarget) {
    const ranked = foodsWithCosts
        .filter(f => f.calories > 0)
        .map(f => ({ costPerCal: f.calculatedCost / f.calories, ...f }))
        .sort((a, b) => a.costPerCal - b.costPerCal);

    let remainingCals = calorieTarget;
    let totalCost     = 0;

    for (const item of ranked) {
        if (remainingCals <= 0) break;
        const calsFromItem = Math.min(remainingCals, item.calories);
        totalCost     += (calsFromItem / item.calories) * item.calculatedCost;
        remainingCals -= calsFromItem;
    }

    return totalCost;
}

function computeBasketInflation(foodsWithCosts) {
    const changes = foodsWithCosts
        .map(({ food, calculatedCost }) => {
            const baseline = getPriceBaseline(food._id.toString());
            return baseline && baseline > 0
                ? (calculatedCost - baseline) / baseline
                : null;
        })
        .filter(c => c !== null);

    if (changes.length < 3) return null;

    const avg = changes.reduce((sum, c) => sum + c, 0) / changes.length;
    return Math.round(avg * 1000) / 10;
}

function analyseBudgetPressure(user, foodsWithCosts) {
    const { budgetTarget, calorieTarget } = user;

    const estimatedMinCost       = estimateMinimumDailyCost(foodsWithCosts, calorieTarget);
    const basketInflationPercent = computeBasketInflation(foodsWithCosts);

    const gap             = estimatedMinCost > 0
        ? (estimatedMinCost - budgetTarget) / estimatedMinCost
        : 0;
    const budgetGapPercent = Math.round(gap * 1000) / 10;

    let level;
    if      (gap <= PRESSURE_LEVELS.ok)       level = 'ok';
    else if (gap <= PRESSURE_LEVELS.tight)    level = 'tight';
    else if (gap <= PRESSURE_LEVELS.stressed) level = 'stressed';
    else                                      level = 'infeasible';

    const inflationNote = basketInflationPercent !== null
        ? ` Overall basket prices are up ~${basketInflationPercent}% from historical baseline.`
        : '';

    const recommendations = {
        ok:         `Your budget comfortably covers current prices.${inflationNote}`,
        tight:      `Your budget is ~${budgetGapPercent}% short. Consider reducing portion sizes or enabling ingredient swaps.${inflationNote}`,
        stressed:   `Prices have risen significantly. Your budget is ~${budgetGapPercent}% below the minimum. Switch to budget_challenge mode or increase your daily budget.${inflationNote}`,
        infeasible: `At current prices, your calorie target cannot be met within budget (${budgetGapPercent}% gap). A budget increase of at least ₹${Math.ceil(budgetGapPercent)} is recommended.${inflationNote}`
    };

    return {
        level,
        userBudget:             Math.round(budgetTarget * 100) / 100,
        estimatedMinDailyCost:  Math.round(estimatedMinCost * 100) / 100,
        budgetGapPercent,
        basketInflationPercent,
        recommendation: recommendations[level]
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ADAPTIVE QUALITY & ALIGNMENT ENGINES (PART 4)
// ─────────────────────────────────────────────────────────────────────────────

function getBudgetLevel(dailyBudget) {
    const budget = dailyBudget || 300;
    if (budget < 150) return 'LOW';
    if (budget < 300) return 'MEDIUM';
    if (budget < 600) return 'HIGH';
    return 'PREMIUM';
}

function calculateMealQualityScore(combo, budgetLevel, dietType) {
    // 1. Protein Quality Score (max 30 points)
    let totalProtein = combo.totalProtein || 0;
    let proteinQualityScore = 0;
    
    if (totalProtein > 0) {
        let weightedProteinSum = 0;
        
        combo.foods.forEach(f => {
            const name = f.food.name.toLowerCase();
            let pq = 0.5; // default lower quality (grains/flour/potato)
            
            if (dietType === 'non-vegetarian' || dietType === 'nonveg') {
                if (name.includes('chicken') || name.includes('egg') || name.includes('fish') || name.includes('mutton') || name.includes('paneer') || name.includes('curd') || name.includes('milk') || name.includes('tofu') || name.includes('cheese') || name.includes('yogurt')) {
                    pq = 1.0;
                } else if (name.includes('soya') || name.includes('soy') || name.includes('sprout') || name.includes('chana') || name.includes('chickpea') || name.includes('dal') || name.includes('lentil') || name.includes('kidney') || name.includes('rajma')) {
                    pq = 0.8;
                }
            } else if (dietType === 'vegetarian' || dietType === 'veg') {
                if (name.includes('paneer') || name.includes('curd') || name.includes('milk') || name.includes('tofu') || name.includes('cheese') || name.includes('yogurt')) {
                    pq = 1.0;
                } else if (name.includes('soya') || name.includes('soy') || name.includes('sprout') || name.includes('chana') || name.includes('chickpea') || name.includes('dal') || name.includes('lentil') || name.includes('kidney') || name.includes('rajma')) {
                    pq = 0.8;
                }
            } else { // vegan
                if (name.includes('tofu') || name.includes('soya') || name.includes('soy') || name.includes('sprout')) {
                    pq = 1.0;
                } else if (name.includes('chana') || name.includes('chickpea') || name.includes('dal') || name.includes('lentil') || name.includes('kidney') || name.includes('rajma') || name.includes('peanuts')) {
                    pq = 0.8;
                }
            }
            
            const proteinInFood = f.food.protein * (f.grams / 100);
            weightedProteinSum += proteinInFood * pq;
        });
        
        proteinQualityScore = (weightedProteinSum / totalProtein) * 30;
    }
    
    // 2. Micronutrient Density Score (max 30 points)
    let weightedMicroSum = 0;
    let totalGramsForMicro = 0;
    
    combo.foods.forEach(f => {
        const name = f.food.name.toLowerCase();
        let density = 0.3; // Default low density (flour, rice, oil, sugar, butter)
        
        if (name.includes('spinach') || name.includes('salad') || name.includes('veg') || name.includes('vegetable') || name.includes('tomato') || name.includes('onion') || name.includes('capsicum')) {
            density = 1.0;
        } else if (name.includes('fruit') || name.includes('oats') || name.includes('poha') || name.includes('dal') || name.includes('sprout') || name.includes('chana') || name.includes('chickpea') || name.includes('egg') || name.includes('fish') || name.includes('chicken') || name.includes('tofu') || name.includes('paneer') || name.includes('curd') || name.includes('milk') || name.includes('yogurt')) {
            density = 0.7;
        }
        
        weightedMicroSum += density * f.grams;
        totalGramsForMicro += f.grams;
    });
    
    let microDensityScore = totalGramsForMicro > 0 ? (weightedMicroSum / totalGramsForMicro) * 30 : 0;
    
    // 3. Food Diversity Score (max 20 points)
    let uniqueFoodsCount = combo.foods.length;
    let foodDiversityScore = 8;
    if (uniqueFoodsCount >= 3) {
        foodDiversityScore = 20;
    } else if (uniqueFoodsCount === 2) {
        foodDiversityScore = 15;
    }
    
    // 4. Processing Level Score (max 10 points)
    let weightedProcessingSum = 0;
    let totalGramsForProc = 0;
    combo.foods.forEach(f => {
        const name = f.food.name.toLowerCase();
        let proc = 0.7; // default moderately processed
        
        if (name.includes('salad') || name.includes('fruit') || name.includes('dal') || name.includes('rice') || name.includes('chicken breast') || name.includes('fish') || name.includes('mutton') || name.includes('egg') || name.includes('oats') || name.includes('sprout') || name.includes('spinach') || name.includes('chana') || name.includes('chickpea')) {
            proc = 1.0; // whole, natural
        } else if (name.includes('biscuit') || name.includes('bar') || name.includes('pasta') || name.includes('bread') || name.includes('cheese') || name.includes('dosa') || name.includes('idli')) {
            proc = 0.3; // highly processed
        }
        
        weightedProcessingSum += proc * f.grams;
        totalGramsForProc += f.grams;
    });
    let processingLevelScore = totalGramsForProc > 0 ? (weightedProcessingSum / totalGramsForProc) * 10 : 0;
    
    // 5. Budget Alignment & Ingredient Quality Score (max 10 points)
    let alignmentScore = 100;
    if (budgetLevel === 'LOW') {
        let premiumItemsCount = 0;
        combo.foods.forEach(f => {
            const name = f.food.name.toLowerCase();
            if (name.includes('almond') || name.includes('fish') || name.includes('mutton') || name.includes('cheese') || name.includes('paneer') || name.includes('bar')) {
                premiumItemsCount++;
            }
        });
        alignmentScore = Math.max(0, 100 - premiumItemsCount * 25);
        
        let hasCheapStaple = false;
        combo.foods.forEach(f => {
            const name = f.food.name.toLowerCase();
            if (name.includes('dal') || name.includes('soya') || name.includes('peanut') || name.includes('egg')) {
                hasCheapStaple = true;
            }
        });
        if (hasCheapStaple) alignmentScore = Math.min(100, alignmentScore + 10);
    } else if (budgetLevel === 'HIGH' || budgetLevel === 'PREMIUM') {
        let hasPremiumUpgrade = false;
        combo.foods.forEach(f => {
            const name = f.food.name.toLowerCase();
            if (name.includes('paneer') || name.includes('tofu') || name.includes('almond') || name.includes('egg') || name.includes('chicken') || name.includes('fish') || name.includes('fruit') || name.includes('salad') || name.includes('yogurt') || name.includes('cheese')) {
                hasPremiumUpgrade = true;
            }
        });
        alignmentScore = hasPremiumUpgrade ? 100 : 40;
    } else { // MEDIUM
        let hasMidUpgrade = false;
        combo.foods.forEach(f => {
            const name = f.food.name.toLowerCase();
            if (name.includes('paneer') || name.includes('tofu') || name.includes('egg') || name.includes('chicken') || name.includes('sprout') || name.includes('curd')) {
                hasMidUpgrade = true;
            }
        });
        alignmentScore = hasMidUpgrade ? 100 : 70;
    }
    let budgetAlignmentScore = (alignmentScore / 100) * 10;
    
    let finalScore = Math.round(proteinQualityScore + microDensityScore + foodDiversityScore + processingLevelScore + budgetAlignmentScore);
    
    // Priority logic: If user is non-veg, prioritize combos that contain non-veg items
    if (dietType === 'non-vegetarian') {
        const hasNonVeg = combo.foods.some(f => f.food.type === 'non-vegetarian');
        if (hasNonVeg) {
            finalScore += 30; // High priority bump
        }
    }
    
    return finalScore;
}

// ─────────────────────────────────────────────────────────────────────────────
// MEAL OPTIMIZER CLASS
// ─────────────────────────────────────────────────────────────────────────────

class MealOptimizer {
    async buildMealCombos(user, options = {}) {
        const { mode = 'normal', budgetLimit = null } = options;

        let allFoods;
        try {
            allFoods = await Food.find({});
        } catch (err) {
            throw new Error(`MealOptimizer: Failed to load food database — ${err.message}`);
        }

        const allowedTypes = this.getAllowedFoodTypes(user.dietType);
        const dietFoods    = allFoods.filter(f => allowedTypes.includes(f.type));

        let foodsWithCosts;
        try {
            foodsWithCosts = await Promise.all(
                dietFoods.map(async food => {
                    const calculatedCost = await costCalculator.calculateFoodCost(food);
                    return { food, calculatedCost, calories: food.calories, protein: food.protein };
                })
            );
        } catch (err) {
            throw new Error(`MealOptimizer: Failed to calculate food costs — ${err.message}`);
        }

        // ── Step 1: Record prices into history ──
        for (const { food, calculatedCost } of foodsWithCosts) {
            recordPrice(food._id.toString(), calculatedCost);
        }

        // ── Step 2: Detect spikes ──
        const globalSpikes = detectSpikes(foodsWithCosts);
        const spikeMap     = new Map(globalSpikes.map(s => [s.foodId, s]));

        // ── Step 3: Budget pressure analysis ──
        const budgetPressure = analyseBudgetPressure(user, foodsWithCosts);

        // ── Step 4: Build substitute lookup ──
        const substituteLookup = new Map();
        for (const spike of globalSpikes) {
            const spikedItem     = foodsWithCosts.find(f => f.food._id.toString() === spike.foodId);
            if (!spikedItem) continue;
            const categoryItems  = foodsWithCosts.filter(f => f.food.category === spikedItem.food.category);
            substituteLookup.set(spike.foodId, findSubstitute(spikedItem, categoryItems));
        }

        const calorieTarget = user.calorieTarget;
        const splits = {
            Breakfast: 0.25,
            Lunch:     0.35,
            Dinner:    0.30,
            Snacks:    0.10
        };

        const result = {
            Breakfast: [],
            Lunch:     [],
            Dinner:    [],
            Snacks:    [],
            priceAlerts:   globalSpikes,
            budgetPressure
        };

        const budgetLevel = getBudgetLevel(user.budgetTarget);

        for (const category of ['Breakfast', 'Lunch', 'Dinner', 'Snacks']) {
            const categoryFoods = foodsWithCosts.filter(f => f.food.category && f.food.category.includes(category));
            const targetCal      = calorieTarget * splits[category];
            const categoryBudget = user.budgetTarget * splits[category];
            const validCombos    = [];

            // Helper: estimate serving weight in grams from macronutrients
            // Macros account for ~30-40% of total food weight; the rest is water/fiber
            const estimateGrams = (food, portions) => {
                const macroGrams = (food.protein || 0) + (food.carbs || 0) + (food.fats || 0);
                // For most Indian foods, macros are ~30-40% of weight. Use 2.8x multiplier.
                return Math.round(macroGrams * 2.8 * portions);
            };

            // Helper: check if a food is premium (for LOW budget filtering)
            const isPremium = (name) => {
                const n = name.toLowerCase();
                return n.includes('fish') || n.includes('mutton') || n.includes('almond') || n.includes('bar');
            };

            // Helper: prevent repeating the same base dish in a combo
            const hasDuplicateBaseDish = (entries) => {
                const baseGroups = [
                    ['idli'], ['poha', 'pohe'], ['dosa', 'dosai'], ['rice', 'chawal', 'pulao', 'khichdi'], 
                    ['roti', 'chapati', 'phulka', 'paratha', 'bhakri', 'puri', 'naan'], 
                    ['dal', 'amti', 'varan'], ['paneer'], ['chicken', 'murgh'], ['upma'], ['oats'], 
                    ['salad'], ['sandwich', 'burger', 'wrap', 'roll'], ['chole', 'rajma', 'usali', 'matki', 'chana'], 
                    ['sabzi', 'curry', 'bhaji'], ['pasta', 'noodles', 'maggi'], ['pizza'], 
                    ['soup'], ['smoothie', 'shake', 'juice'], ['tea', 'coffee', 'chai']
                ];
                
                const names = entries.map(e => e.resolved.food.name.toLowerCase());
                
                for (const group of baseGroups) {
                    const count = names.filter(n => group.some(syn => n.includes(syn))).length;
                    if (count >= 2) return true; // Found 2 or more foods with the same base dish group
                }
                
                return false;
            };

            // Helper: build a scored combo from an array of {resolved, grams} entries
            const buildCombo = (entries, rawItems) => {
                if (entries.length > 1 && hasDuplicateBaseDish(entries)) return null;

                // entries = [{ resolved, grams }, ...]
                const totalCals    = entries.reduce((s, e) => s + e.resolved.calories * (e.grams / 100), 0);
                const totalCost    = entries.reduce((s, e) => s + e.resolved.calculatedCost * (e.grams / 100), 0);
                const totalProtein = entries.reduce((s, e) => s + e.resolved.protein * (e.grams / 100), 0);

                if (Math.abs(totalCals - targetCal) > targetCal * CALORIE_TOLERANCE) return null;

                if (category === 'Breakfast') {
                    const totalEggGrams = entries.reduce((sum, e) => {
                        const name = e.resolved.food.name.toLowerCase();
                        return (name.includes('egg') || name.includes('anda')) ? sum + e.grams : sum;
                    }, 0);
                    if (totalEggGrams > 200) return null; // cap at ~4 eggs
                }

                const affordabilityScore = totalCost <= categoryBudget ? 100 : Math.max(0, Math.round(100 - ((totalCost - categoryBudget) / categoryBudget) * 100));

                const totalGrams = entries.reduce((s, e) => s + e.grams, 0);
                const studentFriendly = entries.every(e => e.resolved.food.studentFriendly) &&
                    totalCost <= STUDENT_FRIENDLY_COST_PER_ITEM * (totalGrams / 100);

                const substitutions = entries
                    .filter(e => e.resolved.substitution)
                    .map(e => e.resolved.substitution);

                const combo = {
                    foods: entries.map(e => ({
                        food: e.resolved.food,
                        grams: e.grams
                    })),
                    totalCalories:     Math.round(totalCals),
                    totalCost:         Math.round(totalCost * 100) / 100,
                    totalProtein:      Math.round(totalProtein),
                    affordabilityScore,
                    studentFriendly,
                    swaps: entries.flatMap(e => this.getIngredientSwaps(e.resolved.food)),
                    priceAlerts:   this._comboAlerts(rawItems, spikeMap),
                    substitutions,
                    isSubstituted: substitutions.length > 0
                };

                combo.mealQualityScore = calculateMealQualityScore(combo, budgetLevel, user.dietType);

                const calDiff = Math.abs(combo.totalCalories - targetCal);
                const calFitScore = Math.max(0, 100 - (calDiff / targetCal) * 100);
                combo.finalScore = Math.round(calFitScore * 0.4 + combo.mealQualityScore * 0.3 + combo.affordabilityScore * 0.3);

                // LOW budget filter: reject premium items, and enforce a strict cost ceiling
                if (budgetLevel === 'LOW') {
                    if (entries.some(e => isPremium(e.resolved.food.name))) return null;
                    // Strict ceiling: do not allow a combo to cost more than 1.5x the category budget
                    if (totalCost > categoryBudget * 1.5) return null;
                }

                return combo;
            };

            // ── 1. Single items (with portion scaling) ──
            for (const item of categoryFoods) {
                if (item.calories <= 0) continue;
                const resolved = this._resolveItem(item, substituteLookup);
                const grams = Math.max(1, Math.round((targetCal / resolved.calories) * 100));
                const combo = buildCombo([{ resolved, grams }], [item]);
                if (combo) validCombos.push(combo);
            }

            // ── 2. Double combinations (2 distinct items, portions scaled) ──
            const sortedCategoryFoods = [...categoryFoods]
                .sort((a, b) => a.calculatedCost - b.calculatedCost)
                .slice(0, 60);

            for (let i = 0; i < sortedCategoryFoods.length; i++) {
                for (let j = i + 1; j < sortedCategoryFoods.length; j++) {
                    const rawA = sortedCategoryFoods[i];
                    const rawB = sortedCategoryFoods[j];
                    if (rawA.calories <= 0 || rawB.calories <= 0) continue;

                    const itemA = this._resolveItem(rawA, substituteLookup);
                    const itemB = this._resolveItem(rawB, substituteLookup);

                    // Primary item gets 60% of calories, secondary gets 40%
                    const gramsA = Math.max(1, Math.round((targetCal * 0.6 / itemA.calories) * 100));
                    const gramsB = Math.max(1, Math.round((targetCal * 0.4 / itemB.calories) * 100));

                    const combo = buildCombo(
                        [{ resolved: itemA, grams: gramsA }, { resolved: itemB, grams: gramsB }],
                        [rawA, rawB]
                    );
                    if (combo) validCombos.push(combo);
                }
            }

            // ── 3. Triple combinations (3 distinct items, portions scaled) ──
            // Sort by lowest cost to prioritize budget-friendly combinations
            const tripleCandidates = [...categoryFoods]
                .sort((a, b) => a.calculatedCost - b.calculatedCost)
                .slice(0, 30);

            for (let i = 0; i < tripleCandidates.length; i++) {
                for (let j = i + 1; j < tripleCandidates.length; j++) {
                    for (let k = j + 1; k < tripleCandidates.length; k++) {
                        const rawA = tripleCandidates[i];
                        const rawB = tripleCandidates[j];
                        const rawC = tripleCandidates[k];
                        if (rawA.calories <= 0 || rawB.calories <= 0 || rawC.calories <= 0) continue;

                        const itemA = this._resolveItem(rawA, substituteLookup);
                        const itemB = this._resolveItem(rawB, substituteLookup);
                        const itemC = this._resolveItem(rawC, substituteLookup);

                        // Split calories: 40% / 35% / 25%
                        const gramsA = Math.max(1, Math.round((targetCal * 0.40 / itemA.calories) * 100));
                        const gramsB = Math.max(1, Math.round((targetCal * 0.35 / itemB.calories) * 100));
                        const gramsC = Math.max(1, Math.round((targetCal * 0.25 / itemC.calories) * 100));

                        const combo = buildCombo(
                            [{ resolved: itemA, grams: gramsA }, { resolved: itemB, grams: gramsB }, { resolved: itemC, grams: gramsC }],
                            [rawA, rawB, rawC]
                        );
                        if (combo) validCombos.push(combo);
                    }
                }
            }

            // ── Sorting strategy per mode ──
            const getBaseDishes = (combo) => {
                const baseGroups = [
                    ['idli'], ['poha', 'pohe'], ['dosa', 'dosai'], ['rice', 'chawal', 'pulao', 'khichdi'], 
                    ['roti', 'chapati', 'phulka', 'paratha', 'bhakri', 'puri', 'naan'], 
                    ['dal', 'amti', 'varan'], ['paneer'], ['chicken', 'murgh'], ['upma'], ['oats'], 
                    ['salad'], ['sandwich', 'burger', 'wrap', 'roll'], ['chole', 'rajma', 'usali', 'matki', 'chana'], 
                    ['sabzi', 'curry', 'bhaji'], ['pasta', 'noodles', 'maggi'], ['pizza'], 
                    ['soup'], ['smoothie', 'shake', 'juice'], ['tea', 'coffee', 'chai']
                ];
                const bases = new Set();
                const names = combo.foods.map(f => f.food.name.toLowerCase());
                for (const name of names) {
                    for (let i = 0; i < baseGroups.length; i++) {
                        if (baseGroups[i].some(syn => name.includes(syn))) {
                            bases.add(i); // Add the index of the group
                        }
                    }
                }
                return bases;
            };

            const selectDiverseCombos = (combosList, maxCount) => {
                const selected = [];
                for (const combo of combosList) {
                    if (selected.length >= maxCount) break;
                    
                    const comboFoodIds = new Set(combo.foods.map(f => f.food._id.toString()));
                    const comboBases = getBaseDishes(combo);
                    
                    let hasOverlap = false;
                    for (const sel of selected) {
                        const selFoodIds = new Set(sel.foods.map(f => f.food._id.toString()));
                        for (const id of comboFoodIds) {
                            if (selFoodIds.has(id)) { hasOverlap = true; break; }
                        }
                        if (hasOverlap) break;
                        
                        const selBases = getBaseDishes(sel);
                        for (const b of comboBases) {
                            if (selBases.has(b)) { hasOverlap = true; break; }
                        }
                        if (hasOverlap) break;
                    }
                    if (!hasOverlap) selected.push(combo);
                }
                
                // Fallback: if we are too strict, just add whatever doesn't share exact IDs
                if (selected.length < maxCount) {
                    for (const combo of combosList) {
                        if (selected.length >= maxCount) break;
                        if (selected.includes(combo)) continue;
                        
                        const comboFoodIds = new Set(combo.foods.map(f => f.food._id.toString()));
                        let idOverlap = false;
                        for (const sel of selected) {
                            const selFoodIds = new Set(sel.foods.map(f => f.food._id.toString()));
                            for (const id of comboFoodIds) {
                                if (selFoodIds.has(id)) { idOverlap = true; break; }
                            }
                            if (idOverlap) break;
                        }
                        if (!idOverlap) selected.push(combo);
                    }
                }
                
                // Absolute Fallback
                if (selected.length < maxCount) {
                    for (const combo of combosList) {
                        if (selected.length >= maxCount) break;
                        if (!selected.includes(combo)) selected.push(combo);
                    }
                }
                return selected;
            };

            if (mode === 'student') {
                const sorted = validCombos
                    .filter(c => c.studentFriendly)
                    .sort((a, b) => b.finalScore - a.finalScore);
                result[category] = selectDiverseCombos(sorted, 5);
            } else if (mode === 'budget_challenge') {
                const sorted = validCombos
                    .sort((a, b) => a.totalCost - b.totalCost);
                result[category] = selectDiverseCombos(sorted, 8);
            } else {
                const sorted = validCombos
                    .sort((a, b) => b.finalScore - a.finalScore);
                result[category] = selectDiverseCombos(sorted, 5);
            }
        }

        if (mode === 'budget_challenge') {
            return {
                dailyPlans:    this.applyDailyBudgetConstrainedPlans(result, budgetLimit ?? 100, user),
                priceAlerts:   result.priceAlerts,
                budgetPressure: result.budgetPressure
            };
        }

        return result;
    }

    _resolveItem(item, substituteLookup) {
        const id  = item.food._id.toString();
        const sub = substituteLookup.get(id);
        if (!sub) return item;

        return {
            ...sub,
            substitution: {
                originalFoodId:   id,
                originalFoodName: item.food.name,
                originalCost:     Math.round(item.calculatedCost * 100) / 100,
                substituteFoodId: sub.food._id.toString(),
                substituteName:   sub.food.name,
                substituteCost:   Math.round(sub.calculatedCost * 100) / 100,
                savingsPercent:   sub.savingsPercent,
                substituteScore:  sub.substituteScore,
                reason: `${item.food.name} price spiked. Switched to ${sub.food.name} (${sub.savingsPercent}% cheaper, nutritionally similar).`
            }
        };
    }

    _comboAlerts(rawItems, spikeMap) {
        return rawItems
            .map(item => spikeMap.get(item.food._id.toString()))
            .filter(Boolean);
    }

    getAllowedFoodTypes(dietType) {
        if (dietType === 'vegan') return ['vegan'];
        if (dietType === 'veg')   return ['vegan', 'vegetarian'];
        return ['vegan', 'vegetarian', 'non-vegetarian'];
    }

    calculateAffordability(cost, targetBudget) {
        if (cost <= 0) return 100;
        return Math.round(Math.max(1, (targetBudget / cost) * 50));
    }

    getIngredientSwaps(food) {
        if (!food.ingredients) return [];
        return food.ingredients.reduce((swaps, ing) => {
            const key = ing.name.toLowerCase();
            if (INGREDIENT_SWAP_TABLE[key]) {
                swaps.push({ original: ing.name, ...INGREDIENT_SWAP_TABLE[key] });
            }
            return swaps;
        }, []);
    }

    applyDailyBudgetConstrainedPlans(categoryCombos, dailyLimit, user) {
        const { Breakfast: breakfast, Lunch: lunch, Dinner: dinner, Snacks: snacks } = categoryCombos;
        const dailyPlans = [];

        for (const bf of breakfast) {
            for (const lu of lunch) {
                for (const dn of dinner) {
                    for (const sn of snacks) {
                        const totalCost = bf.totalCost + lu.totalCost + dn.totalCost + sn.totalCost;
                        if (totalCost <= dailyLimit) {
                            const totalDailyCalories = bf.totalCalories + lu.totalCalories + dn.totalCalories + sn.totalCalories;
                            const totalDailyProtein = bf.totalProtein + lu.totalProtein + dn.totalProtein + sn.totalProtein;
                            
                            // Daily Quality
                            const dailyQualityScore = Math.round((bf.mealQualityScore + lu.mealQualityScore + dn.mealQualityScore + sn.mealQualityScore) / 4);
                            
                            // Daily Affordability
                            const dailyAffordabilityScore = totalCost <= dailyLimit ? 100 : Math.max(0, Math.round(100 - ((totalCost - dailyLimit) / dailyLimit) * 100));
                            
                            // Calorie Fit Score
                            const calDiff = Math.abs(totalDailyCalories - user.calorieTarget);
                            const calFitScore = Math.max(0, 100 - (calDiff / user.calorieTarget) * 100);
                            
                            // Daily Rank Score
                            const dailyRankScore = Math.round(calFitScore * 0.4 + dailyQualityScore * 0.3 + dailyAffordabilityScore * 0.3);

                            dailyPlans.push({
                                meals: { Breakfast: bf, Lunch: lu, Dinner: dn, Snacks: sn },
                                totalDailyCost: Math.round(totalCost * 100) / 100,
                                totalDailyCalories,
                                totalDailyProtein,
                                dailyQualityScore,
                                dailyAffordabilityScore,
                                dailyRankScore
                            });
                        }
                    }
                }
            }
        }

        const sortedPlans = dailyPlans.sort((a, b) => b.dailyRankScore - a.dailyRankScore);
        const selectedPlans = [];

        const getFoodIds = (plan) => {
            const ids = new Set();
            for (const combo of Object.values(plan.meals)) {
                combo.foods.forEach(f => ids.add(f.food._id.toString()));
            }
            return ids;
        };

        const getPlanDietType = (plan) => {
            let hasNonVeg = false;
            let hasVeg = false;
            for (const combo of Object.values(plan.meals)) {
                combo.foods.forEach(f => {
                    if (f.food.type === 'non-vegetarian') hasNonVeg = true;
                    else if (f.food.type === 'vegetarian') hasVeg = true;
                });
            }
            if (hasNonVeg) return 'non-vegetarian';
            if (hasVeg) return 'vegetarian';
            return 'vegan';
        };

        const usedDietTypes = new Set();

        for (const plan of sortedPlans) {
            if (selectedPlans.length >= 5) break;

            const planFoodIds = getFoodIds(plan);
            const planDietType = getPlanDietType(plan);

            // 1. Check for overlapping food items with already selected plans
            let hasOverlap = false;
            for (const selected of selectedPlans) {
                const selectedFoodIds = getFoodIds(selected);
                for (const id of planFoodIds) {
                    if (selectedFoodIds.has(id)) {
                        hasOverlap = true;
                        break;
                    }
                }
                if (hasOverlap) break;
            }

            // 2. Try to diversify diet types (if we already have this diet type, we skip it UNLESS we are desperate)
            // But we prioritize non-overlap first. If it's non-overlapping, it's good, but let's give a slight preference to new diet types.
            if (!hasOverlap) {
                selectedPlans.push(plan);
                usedDietTypes.add(planDietType);
            }
        }

        // Fallback: If we couldn't find 5 completely non-overlapping plans, relax the overlap constraint
        // but still try to avoid EXACT duplicates.
        if (selectedPlans.length < 5) {
            for (const plan of sortedPlans) {
                if (selectedPlans.length >= 5) break;
                if (!selectedPlans.includes(plan)) {
                    selectedPlans.push(plan);
                }
            }
        }

        return selectedPlans;
    }
}

module.exports = MealOptimizer;
