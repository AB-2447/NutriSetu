const Food = require('../models/Food');
const costCalculator = require('./costCalculator');

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

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
    }
};

const CALORIE_TOLERANCE              = 0.20;
const STUDENT_FRIENDLY_COST_PER_ITEM = 40;

// Price history: keep last 30 snapshots per food (~1 month of daily runs)
const MAX_PRICE_SNAPSHOTS = 30;

// Spike thresholds: % rise above historical median baseline
const SPIKE_THRESHOLDS = {
    warning:  0.10,  // +10%
    high:     0.25,  // +25%
    critical: 0.50   // +50%
};

// Substitute must score >= this to be accepted (0–1 composite)
const MIN_SUBSTITUTE_SCORE = 0.50;

// Budget pressure gap thresholds
const PRESSURE_LEVELS = {
    ok:         0.00,
    tight:      0.15,
    stressed:   0.35
    // anything above stressed → 'infeasible'
};


// ─────────────────────────────────────────────────────────────────────────────
// PRICE HISTORY
// Stores rolling cost snapshots per food item (in-memory).
// Swap `priceStore` read/write for a MongoDB collection or Redis in production.
// ─────────────────────────────────────────────────────────────────────────────

const priceStore = {};

function recordPrice(foodId, cost) {
    if (!priceStore[foodId]) priceStore[foodId] = [];
    priceStore[foodId].push({ cost, recordedAt: new Date().toISOString() });
    if (priceStore[foodId].length > MAX_PRICE_SNAPSHOTS) {
        priceStore[foodId] = priceStore[foodId].slice(-MAX_PRICE_SNAPSHOTS);
    }
}

/**
 * Returns the median cost across all stored snapshots for a food.
 * Median is used (not mean) so a single outlier reading can't skew the baseline.
 * Returns null if no history exists yet.
 */
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
// Compares a food's current cost against its baseline and classifies the spike.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns spike level + metadata for a single food item.
 * @returns {{ level: 'warning'|'high'|'critical'|null, baseline: number|null, changePercent: number|null }}
 */
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
        changePercent: Math.round(changePercent * 1000) / 10  // e.g. 23.4 (%)
    };
}

/** Returns true if a food item's current cost is above any spike threshold. */
function isSpiked(foodId, currentCost) {
    return getSpikeLevel(foodId, currentCost).level !== null;
}

/**
 * Scans a full costed food list and returns all spiked items, sorted by severity.
 * @param {{ food, calculatedCost }[]} foodsWithCosts
 * @returns {SpikeReport[]}
 */
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
// Finds the best nutritionally equivalent cheaper replacement for a spiked food.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scores a candidate substitute against the original on three axes:
 *   - Calorie proximity  (weight 0.4)
 *   - Protein proximity  (weight 0.4)
 *   - Cost improvement   (weight 0.2)
 * All normalised to 0–1. Candidate must be cheaper; otherwise cost score = 0.
 */
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

/**
 * Returns the diet types that are acceptable substitutes for a given type.
 * Vegan can replace vegan.
 * Vegetarian can replace vegan or vegetarian.
 * Non-veg can only replace non-veg (hard dietary boundary).
 */
function getAcceptableSubstituteTypes(originalType) {
    if (originalType === 'vegan')      return ['vegan'];
    if (originalType === 'vegetarian') return ['vegan', 'vegetarian'];
    return ['vegan', 'vegetarian', 'non-vegetarian'];
}

/**
 * Finds the best substitute for a spiked food within the same meal category.
 * Returns null if no suitable candidate meets the minimum score threshold.
 *
 * @param {{ food, calculatedCost, calories, protein }} spikedItem
 * @param {{ food, calculatedCost, calories, protein }[]} allCategoryItems
 * @returns {object|null}
 */
function findSubstitute(spikedItem, allCategoryItems) {
    const spikedId          = spikedItem.food._id.toString();
    const acceptableTypes   = getAcceptableSubstituteTypes(spikedItem.food.type);

    let bestCandidate = null;
    let bestScore     = MIN_SUBSTITUTE_SCORE;

    for (const candidate of allCategoryItems) {
        const candidateId = candidate.food._id.toString();
        if (candidateId === spikedId)                              continue; // skip self
        if (!acceptableTypes.includes(candidate.food.type))       continue; // diet boundary
        if (candidate.calculatedCost >= spikedItem.calculatedCost) continue; // must be cheaper
        if (isSpiked(candidateId, candidate.calculatedCost))       continue; // skip spiked candidates

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
// Detects when cumulative inflation pushes prices beyond the user's budget.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Greedy lower-bound estimate: picks cheapest kcal/₹ foods until calorieTarget is met.
 * This is a floor, not a real meal plan — used only for gap analysis.
 */
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

/**
 * Average price change vs historical median across all foods with price history.
 * Returns null if fewer than 3 foods have history (not enough data).
 */
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
    return Math.round(avg * 1000) / 10; // e.g. 8.3 (%)
}

/**
 * Analyses budget pressure for a user given their costed food list.
 * @returns {{ level, userBudget, estimatedMinDailyCost, budgetGapPercent,
 *             basketInflationPercent, recommendation }}
 */
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
// MEAL OPTIMIZER
// ─────────────────────────────────────────────────────────────────────────────

class MealOptimizer {
    /**
     * Generates optimal meals matching calorie, diet, and budget constraints.
     *
     * Options:
     *   - mode:        'normal' | 'student' | 'budget_challenge'
     *   - budgetLimit: maximum daily budget for budget_challenge (e.g. ₹100/day)
     *
     * Result shape (normal / student):
     * {
     *   Breakfast, Lunch, Dinner, Snacks,   ← same as before
     *   priceAlerts:    SpikeReport[],       ← NEW: foods with price spikes
     *   budgetPressure: BudgetPressureReport ← NEW: inflation / budget gap
     * }
     *
     * Each combo now also carries:
     *   priceAlerts[]:    spikes within this combo's foods
     *   substitutions[]:  auto-applied swaps for spiked foods
     *   isSubstituted:    true when at least one food was replaced
     *
     * Result shape (budget_challenge):
     * {
     *   dailyPlans: [...],   ← same as before
     *   priceAlerts, budgetPressure
     * }
     */
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

        // ── Step 1: Record today's prices into rolling history ──
        for (const { food, calculatedCost } of foodsWithCosts) {
            recordPrice(food._id.toString(), calculatedCost);
        }

        // ── Step 2: Detect spikes; build fast foodId → spike lookup ──
        const globalSpikes = detectSpikes(foodsWithCosts);
        const spikeMap     = new Map(globalSpikes.map(s => [s.foodId, s]));

        // ── Step 3: Budget pressure analysis ──
        const budgetPressure = analyseBudgetPressure(user, foodsWithCosts);

        // ── Step 4: Build substitute lookup for every spiked food ──
        // substituteLookup: foodId → best substitute item (or null)
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

        for (const [category, fraction] of Object.entries(splits)) {
            const targetCal      = calorieTarget * fraction;
            const categoryBudget = user.budgetTarget * fraction;
            const categoryFoods  = foodsWithCosts.filter(f => f.food.category === category);
            const validCombos    = [];

            // ── 1. Single items ──
            for (const item of categoryFoods) {
                if (item.calories <= 0) continue;

                // Step 5: Swap spiked item for substitute if one was found
                const resolved = this._resolveItem(item, substituteLookup);

                const optimalPortions = Math.max(
                    1,
                    Math.round((targetCal / resolved.calories) * 10) / 10
                );
                const adjustedCals = resolved.calories * optimalPortions;

                if (Math.abs(adjustedCals - targetCal) <= targetCal * CALORIE_TOLERANCE) {
                    const adjustedCost       = resolved.calculatedCost * optimalPortions;
                    const affordabilityScore = this.calculateAffordability(adjustedCost, categoryBudget);
                    const studentFriendly    =
                        resolved.food.studentFriendly &&
                        adjustedCost <= STUDENT_FRIENDLY_COST_PER_ITEM * optimalPortions;

                    validCombos.push({
                        foods:             [{ food: resolved.food, portions: optimalPortions }],
                        totalCalories:     Math.round(adjustedCals),
                        totalCost:         Math.round(adjustedCost * 100) / 100,
                        totalProtein:      Math.round(resolved.protein * optimalPortions),
                        affordabilityScore,
                        studentFriendly,
                        swaps:             this.getIngredientSwaps(resolved.food),
                        priceAlerts:       this._comboAlerts([item], spikeMap),
                        substitutions:     resolved.substitution ? [resolved.substitution] : [],
                        isSubstituted:     !!resolved.substitution
                    });
                }
            }

            // ── 2. Double combinations ──
            // Note: slicing to top-50 cheapest items is a deliberate perf trade-off.
            // Increase the slice limit if budget allows more exhaustive search.
            const affordableCategoryFoods = [...categoryFoods]
                .sort((a, b) => a.calculatedCost - b.calculatedCost)
                .slice(0, 50);

            for (let i = 0; i < affordableCategoryFoods.length; i++) {
                for (let j = i + 1; j < affordableCategoryFoods.length; j++) {
                    const rawA = affordableCategoryFoods[i];
                    const rawB = affordableCategoryFoods[j];
                    if (rawA.calories <= 0 || rawB.calories <= 0) continue;

                    const itemA = this._resolveItem(rawA, substituteLookup);
                    const itemB = this._resolveItem(rawB, substituteLookup);

                    const portA = Math.max(0.5, Math.round((targetCal * 0.6 / itemA.calories) * 10) / 10);
                    const portB = Math.max(0.5, Math.round((targetCal * 0.4 / itemB.calories) * 10) / 10);

                    const combinedCals    = (itemA.calories * portA) + (itemB.calories * portB);
                    const combinedCost    = (itemA.calculatedCost * portA) + (itemB.calculatedCost * portB);
                    const combinedProtein = (itemA.protein * portA) + (itemB.protein * portB);

                    if (Math.abs(combinedCals - targetCal) <= targetCal * CALORIE_TOLERANCE) {
                        const affordabilityScore = this.calculateAffordability(combinedCost, categoryBudget);
                        const studentFriendly    =
                            itemA.food.studentFriendly &&
                            itemB.food.studentFriendly &&
                            combinedCost <= STUDENT_FRIENDLY_COST_PER_ITEM * (portA + portB);

                        const substitutions = [
                            ...(itemA.substitution ? [itemA.substitution] : []),
                            ...(itemB.substitution ? [itemB.substitution] : [])
                        ];

                        validCombos.push({
                            foods: [
                                { food: itemA.food, portions: portA },
                                { food: itemB.food, portions: portB }
                            ],
                            totalCalories:     Math.round(combinedCals),
                            totalCost:         Math.round(combinedCost * 100) / 100,
                            totalProtein:      Math.round(combinedProtein),
                            affordabilityScore,
                            studentFriendly,
                            swaps: [
                                ...this.getIngredientSwaps(itemA.food),
                                ...this.getIngredientSwaps(itemB.food)
                            ],
                            priceAlerts:   this._comboAlerts([rawA, rawB], spikeMap),
                            substitutions,
                            isSubstituted: substitutions.length > 0
                        });
                    }
                }
            }

            // ── Sorting strategy per mode ──
            if (mode === 'student') {
                result[category] = validCombos
                    .filter(c => c.studentFriendly)
                    .sort((a, b) => (b.totalProtein / b.totalCost) - (a.totalProtein / a.totalCost))
                    .slice(0, 5);
            } else if (mode === 'budget_challenge') {
                result[category] = validCombos
                    .sort((a, b) => a.totalCost - b.totalCost)
                    .slice(0, 5);
            } else {
                result[category] = validCombos
                    .sort((a, b) => a.totalCost - b.totalCost)
                    .slice(0, 5);
            }
        }

        if (mode === 'budget_challenge') {
            return {
                dailyPlans:    this.applyDailyBudgetConstrainedPlans(result, budgetLimit ?? 100),
                priceAlerts:   result.priceAlerts,
                budgetPressure: result.budgetPressure
            };
        }

        return result;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Price optimization helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * If an item is spiked and has a substitute, returns the substitute decorated
     * with a `substitution` descriptor. Otherwise returns the original unchanged.
     */
    _resolveItem(item, substituteLookup) {
        const id  = item.food._id.toString();
        const sub = substituteLookup.get(id);
        if (!sub) return item; // not spiked, or spiked but no suitable substitute

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

    /** Returns spike reports for the original (pre-substitution) foods in a combo. */
    _comboAlerts(rawItems, spikeMap) {
        return rawItems
            .map(item => spikeMap.get(item.food._id.toString()))
            .filter(Boolean);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core helpers (unchanged interface)
    // ─────────────────────────────────────────────────────────────────────────

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

    /**
     * Finds daily combinations under a budget cap across all four meal categories.
     * O(n⁴) — safe because each category array is sliced to 5 (5^4 = 625 max iterations).
     * If the upstream slice limit ever increases, switch to a DP approach.
     */
    applyDailyBudgetConstrainedPlans(categoryCombos, dailyLimit) {
        const { Breakfast: breakfast, Lunch: lunch, Dinner: dinner, Snacks: snacks } = categoryCombos;
        const dailyPlans = [];

        for (const bf of breakfast) {
            for (const lu of lunch) {
                for (const dn of dinner) {
                    for (const sn of snacks) {
                        const totalCost =
                            bf.totalCost + lu.totalCost + dn.totalCost + sn.totalCost;
                        if (totalCost <= dailyLimit) {
                            dailyPlans.push({
                                meals: { Breakfast: bf, Lunch: lu, Dinner: dn, Snacks: sn },
                                totalDailyCost: Math.round(totalCost * 100) / 100,
                                totalDailyCalories:
                                    bf.totalCalories + lu.totalCalories +
                                    dn.totalCalories + sn.totalCalories
                            });
                        }
                    }
                }
            }
        }

        return dailyPlans
            .sort((a, b) => a.totalDailyCost - b.totalDailyCost)
            .slice(0, 5);
    }
}

module.exports = MealOptimizer;
