const Food = require('../models/Food');
const costCalculator = require('./costCalculator');

class MealOptimizer {
    /**
     * Generates optimal meals matching calorie, diet, and budget constraints.
     * Options:
     * - mode: 'normal' | 'student' | 'budget_challenge'
     * - budgetLimit: maximum daily budget for the challenge (₹100/day)
     */
    async buildMealCombos(user, options = {}) {
        const { mode = 'normal', budgetLimit = null } = options;
        const allFoods = await Food.find({});
        
        // Filter foods matching user's diet
        const allowedTypes = this.getAllowedFoodTypes(user.dietType);
        let dietFoods = allFoods.filter(f => allowedTypes.includes(f.type));

        // Inject dynamic costs into food list
        const foodsWithCosts = [];
        for (const food of dietFoods) {
            const calculatedCost = await costCalculator.calculateFoodCost(food);
            foodsWithCosts.push({
                food,
                calculatedCost,
                calories: food.calories,
                protein: food.protein
            });
        }

        const calorieTarget = user.calorieTarget;
        const splits = {
            Breakfast: 0.25,
            Lunch: 0.35,
            Dinner: 0.30,
            Snacks: 0.10
        };

        const result = {
            Breakfast: [],
            Lunch: [],
            Dinner: [],
            Snacks: []
        };

        for (const [category, fraction] of Object.entries(splits)) {
            const targetCal = calorieTarget * fraction;
            const categoryFoods = foodsWithCosts.filter(f => f.food.category === category);
            
            const validCombos = [];

            // 1. Evaluate single items
            for (const item of categoryFoods) {
                if (item.calories > 0) {
                    const optimalPortions = Math.max(1, Math.round((targetCal / item.calories) * 10) / 10);
                    const adjustedCals = item.calories * optimalPortions;
                    
                    if (Math.abs(adjustedCals - targetCal) <= targetCal * 0.25) {
                        const adjustedCost = item.calculatedCost * optimalPortions;
                        const affordabilityScore = this.calculateAffordability(adjustedCost, user.budgetTarget * fraction);
                        validCombos.push({
                            foods: [{ food: item.food, portions: optimalPortions }],
                            totalCalories: Math.round(adjustedCals),
                            totalCost: Math.round(adjustedCost * 100) / 100,
                            totalProtein: Math.round(item.protein * optimalPortions),
                            affordabilityScore,
                            studentFriendly: item.food.studentFriendly && adjustedCost <= 40,
                            swaps: this.getIngredientSwaps(item.food)
                        });
                    }
                }
            }

            // 2. Evaluate double combinations (Limit loop to top 50 cheapest items to prevent memory overload with 30k+ combos)
            const affordableCategoryFoods = [...categoryFoods].sort((a, b) => a.calculatedCost - b.calculatedCost).slice(0, 50);
            for (let i = 0; i < affordableCategoryFoods.length; i++) {
                for (let j = i + 1; j < affordableCategoryFoods.length; j++) {
                    const itemA = affordableCategoryFoods[i];
                    const itemB = affordableCategoryFoods[j];
                    if (itemA.calories > 0 && itemB.calories > 0) {
                        const targetA = targetCal * 0.6; // 60/40 split is usually better for main/side
                        const targetB = targetCal * 0.4;
                        
                        const portA = Math.max(0.5, Math.round((targetA / itemA.calories) * 10) / 10);
                        const portB = Math.max(0.5, Math.round((targetB / itemB.calories) * 10) / 10);
                        
                        const combinedCals = (itemA.calories * portA) + (itemB.calories * portB);
                        const combinedCost = (itemA.calculatedCost * portA) + (itemB.calculatedCost * portB);
                        const combinedProtein = (itemA.protein * portA) + (itemB.protein * portB);

                        if (Math.abs(combinedCals - targetCal) <= targetCal * 0.20) {
                            const affordabilityScore = this.calculateAffordability(combinedCost, user.budgetTarget * fraction);
                            validCombos.push({
                                foods: [
                                    { food: itemA.food, portions: portA },
                                    { food: itemB.food, portions: portB }
                                ],
                                totalCalories: Math.round(combinedCals),
                                totalCost: Math.round(combinedCost * 100) / 100,
                                totalProtein: Math.round(combinedProtein),
                                affordabilityScore,
                                studentFriendly: itemA.food.studentFriendly && itemB.food.studentFriendly && combinedCost <= 60,
                                swaps: [...this.getIngredientSwaps(itemA.food), ...this.getIngredientSwaps(itemB.food)]
                            });
                        }
                    }
                }
            }

            // Apply special mode filtering and sorting
            if (mode === 'student') {
                // Student Mode: Filter for student friendly, sort by high protein + low cost
                result[category] = validCombos
                    .filter(c => c.studentFriendly)
                    .sort((a, b) => (b.totalProtein / b.totalCost) - (a.totalProtein / a.totalCost))
                    .slice(0, 5);
            } else {
                // Normal or Budget mode: Sort by lowest cost
                result[category] = validCombos
                    .sort((a, b) => a.totalCost - b.totalCost)
                    .slice(0, 5);
            }
        }

        // If ₹100/day Challenge: run backtrack daily combination filter
        if (mode === 'budget_challenge' || budgetLimit === 100) {
            return this.applyDailyBudgetConstrainedPlans(result, budgetLimit || 100);
        }

        return result;
    }

    getAllowedFoodTypes(dietType) {
        if (dietType === 'vegan') return ['vegan'];
        if (dietType === 'veg') return ['vegan', 'vegetarian'];
        return ['vegan', 'vegetarian', 'non-vegetarian'];
    }

    calculateAffordability(cost, targetBudget) {
        if (cost <= 0) return 100;
        // Higher score indicates better affordability relative to category budget allocation
        return Math.round(Math.max(1, (targetBudget / cost) * 50));
    }

    getIngredientSwaps(food) {
        const swaps = [];
        if (!food.ingredients) return swaps;
        
        for (const ing of food.ingredients) {
            if (ing.name.toLowerCase() === 'paneer') {
                swaps.push({ 
                    original: 'Paneer', 
                    replacement: 'Soy Chunks', 
                    savings: 25, 
                    reason: 'Soy chunks are a high-protein, budget-friendly vegan substitute.' 
                });
            }
            if (ing.name.toLowerCase() === 'almonds') {
                swaps.push({ 
                    original: 'Almonds', 
                    replacement: 'Peanuts', 
                    savings: 40, 
                    reason: 'Peanuts offer similar healthy fats and protein at 1/5th the cost.' 
                });
            }
        }
        return swaps;
    }

    /**
     * Resolves a daily meal combination that stays under the budget limit (e.g. ₹100/day)
     * by finding path selections across categories that sum to <= limit.
     */
    applyDailyBudgetConstrainedPlans(categoryCombos, dailyLimit) {
        const breakfast = categoryCombos.Breakfast;
        const lunch = categoryCombos.Lunch;
        const dinner = categoryCombos.Dinner;
        const snacks = categoryCombos.Snacks;

        const dailyPlans = [];
        
        // Find daily combinations satisfying totalCost <= dailyLimit
        for (const bf of breakfast) {
            for (const lu of lunch) {
                for (const dn of dinner) {
                    for (const sn of snacks) {
                        const totalCost = bf.totalCost + lu.totalCost + dn.totalCost + sn.totalCost;
                        if (totalCost <= dailyLimit) {
                            dailyPlans.push({
                                meals: { Breakfast: bf, Lunch: lu, Dinner: dn, Snacks: sn },
                                totalDailyCost: Math.round(totalCost * 100) / 100,
                                totalDailyCalories: bf.totalCalories + lu.totalCalories + dn.totalCalories + sn.totalCalories
                            });
                        }
                    }
                }
            }
        }

        // Return sorted by lowest cost daily plan
        return dailyPlans.sort((a, b) => a.totalDailyCost - b.totalDailyCost).slice(0, 5);
    }
}

module.exports = new MealOptimizer();
