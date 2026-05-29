const priceService = require('./priceService');

class CostCalculator {
    /**
     * Calculates the price of a given food item based on its ingredient list.
     * Fallbacks to the static `cost` field if ingredients are not defined.
     */
    async calculateFoodCost(food) {
        try {
            if (!food.ingredients || food.ingredients.length === 0) {
                return food.cost || 0; // Fallback to hardcoded database approximation
            }

            let totalCost = 0;
            for (const ing of food.ingredients) {
                const normalizedPrice = await priceService.getIngredientPrice(ing.name, ing.category || 'commodity');
                totalCost += ing.qty * normalizedPrice;
            }
            return Math.round(totalCost * 100) / 100;
        } catch (error) {
            console.error(`Error calculating food cost for ${food.name}:`, error.message);
            return food.cost || 0;
        }
    }

    /**
     * Calculates the cost of a logged meal or recommended meal combination.
     * Expected parameter structure: { foods: [{ food: Food, portions: Number }] }
     */
    async calculateMealCost(meal) {
        try {
            let totalCost = 0;
            if (!meal.foods || !Array.isArray(meal.foods)) {
                return 0;
            }
            
            for (const item of meal.foods) {
                const baseCost = await this.calculateFoodCost(item.food);
                totalCost += baseCost * item.portions;
            }
            return Math.round(totalCost * 100) / 100;
        } catch (error) {
            console.error(`Error calculating meal cost:`, error.message);
            return 0;
        }
    }
}

module.exports = new CostCalculator();
