const ChatHistory = require('../models/ChatHistory');
const Log = require('../models/Log');
const WeightHistory = require('../models/WeightHistory');
const BudgetHistory = require('../models/BudgetHistory');
const Food = require('../models/Food');
const mealOptimizer = new (require('../services/mealOptimizer'))();

// Constants for Local Substitutions Reference
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

// Helper to get local start of today
function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

// Gather all database metrics to build context for chatbot
async function gatherUserContext(user) {
    try {
        const today = startOfToday();
        
        // 1. Today's nutrition stats
        const logsToday = await Log.find({ userId: user._id, date: { $gte: today } });
        const caloriesConsumed = logsToday.reduce((sum, l) => sum + (l.calories || 0), 0);
        const spendingToday = logsToday.reduce((sum, l) => sum + (l.cost || 0), 0);
        
        const caloriesRemaining = Math.max(0, user.calorieTarget - caloriesConsumed);
        const budgetRemaining = Math.max(0, user.budgetTarget - spendingToday);
        
        const loggedMealsList = logsToday.map(l => `${l.foodName} (x${l.portions} portion, ${l.calories} kcal, ₹${Math.round(l.cost)})`).join(', ') || 'None';

        // 2. Weight History
        const weights = await WeightHistory.find({ userId: user._id }).sort({ date: -1 }).limit(7);
        const weightHistoryStr = weights.map(w => `${w.weight}kg (${new Date(w.date).toLocaleDateString('en-IN')})`).reverse().join(' -> ') || `${user.weight}kg (current)`;

        // 3. Log history (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);
        
        const logsLast7Days = await Log.find({ userId: user._id, date: { $gte: sevenDaysAgo } });
        
        const dailyStats = {};
        logsLast7Days.forEach(log => {
            const d = new Date(log.date);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            if (!dailyStats[key]) dailyStats[key] = 0;
            dailyStats[key] += log.calories || 0;
        });
        
        let adherenceCount = 0;
        let daysLogged = Object.keys(dailyStats).length;
        Object.values(dailyStats).forEach(cal => {
            if (Math.abs(cal - user.calorieTarget) <= user.calorieTarget * 0.15) {
                adherenceCount++;
            }
        });
        const adherenceRate = daysLogged > 0 ? Math.round((adherenceCount / daysLogged) * 100) : 80;

        const calHistoryStr = Object.entries(dailyStats).map(([date, cal]) => `${date}: ${cal} kcal`).join(', ') || 'No history logged yet';

        return {
            profile: {
                name: user.name,
                age: user.age,
                gender: user.gender,
                weight: user.weight,
                targetWeight: user.targetWeight,
                activityLevel: user.activityLevel,
                goal: user.goal,
                calorieTarget: user.calorieTarget,
                dietType: user.dietType,
                budgetTarget: user.budgetTarget
            },
            state: {
                caloriesConsumed,
                caloriesRemaining,
                spendingToday,
                budgetRemaining,
                loggedMeals: loggedMealsList
            },
            progress: {
                weightHistory: weightHistoryStr,
                calorieHistory: calHistoryStr,
                adherenceRate: `${adherenceRate}%`
            }
        };
    } catch (err) {
        console.error('Error gathering context:', err);
        return null;
    }
}

// Local Intent Router
async function handleLocalIntents(message, user, context) {
    const msg = message.toLowerCase().trim();

    // 1. Stats command
    if (msg.includes('spending') || msg.includes('spent') || msg.includes('budget') || msg.includes('left') || msg.includes('remaining') || msg.includes('calories consumed') || msg.includes('calories today')) {
        return `### Recommendation: Daily Stats Check
- **Today's Budget**: ₹${user.budgetTarget}
- **Spent Today**: ₹${Math.round(context.state.spendingToday)}
- **Remaining Budget**: ₹${Math.round(context.state.budgetRemaining)}
- **Calories Consumed**: ${context.state.caloriesConsumed} kcal
- **Calories Remaining**: ${context.state.caloriesRemaining} kcal
- **Logged Meals**: ${context.state.loggedMeals}

**Reason**: This displays your live dashboard budget and calorie utilization.`;
    }

    // 2. Alternatives & Substitutions
    const swapKeys = ['paneer', 'almond', 'fish', 'tofu', 'chicken breast', 'chicken'];
    for (const key of swapKeys) {
        if (msg.includes(key) && (msg.includes('alternative') || msg.includes('substitute') || msg.includes('swap') || msg.includes('cheaper') || msg.includes('replace'))) {
            const tableKey = key === 'almond' ? 'almonds' : key;
            const swapInfo = INGREDIENT_SWAP_TABLE[tableKey];
            if (swapInfo) {
                return `### Recommendation: Substitute ${tableKey.toUpperCase()}
- **Original Ingredient**: ${tableKey}
- **Cheaper Alternative**: ${swapInfo.replacement}
- **Estimated Savings**: ₹${swapInfo.savings}
- **Protein Content**: High value equivalent replacement
- **Reason**: ${swapInfo.reason}`;
            }
        }
    }

    // 3. Progress Analysis / Coaching
    if (msg.includes('why am i not losing weight') || msg.includes('lose weight') || msg.includes('analyze') || msg.includes('coaching') || msg.includes('last 7 days')) {
        let diff = Math.abs(user.weight - user.targetWeight);
        let tip = user.goal === 'loss' 
            ? 'Ensure you track liquid calories and stay in a consistent deficit.' 
            : user.goal === 'gain' 
                ? 'Include calorie-dense foods like peanuts, butter, and seeds.' 
                : 'Maintain consistent daily logs to avoid gradual weight drift.';

        return `### Recommendation: Progress Analysis
- **Goal Status**: Current: ${user.weight}kg, Target: ${user.targetWeight}kg (${diff}kg remaining)
- **Adherence Rate**: ${context.progress.adherenceRate} (Last 7 days)
- **Calorie Tracker**: ${context.progress.calorieHistory}
- **Weight History**: ${context.progress.weightHistory}
- **Reason**: ${tip} Focus on consistent logging and hitting your daily protein target.`;
    }

    // 4. Meal Suggestions & Meal Planning
    if (msg.includes('suggest') || msg.includes('generate') || msg.includes('plan') || msg.includes('meal') || msg.includes('breakfast') || msg.includes('lunch') || msg.includes('dinner') || msg.includes('snack')) {
        let category = 'Lunch';
        if (msg.includes('breakfast')) category = 'Breakfast';
        else if (msg.includes('dinner')) category = 'Dinner';
        else if (msg.includes('snack')) category = 'Snacks';

        const isChallenge = msg.includes('challenge') || msg.includes('plan') || msg.includes('diet');
        const optMode = isChallenge ? 'budget_challenge' : 'normal';

        // Extract budget limit
        const priceMatch = msg.match(/(?:₹|rs\.?|under)?\s*(\d+)/i);
        const budgetLimit = priceMatch ? parseFloat(priceMatch[1]) : (isChallenge ? 100 : null);

        try {
            const recommendations = await mealOptimizer.buildMealCombos(user, {
                mode: optMode,
                budgetLimit: budgetLimit
            });

            if (optMode === 'budget_challenge') {
                const plans = recommendations.dailyPlans || [];
                if (plans.length === 0) {
                    return `### Recommendation: Meal Suggestions Fallback
- **Status**: No daily plan matching ₹${budgetLimit} could be constructed.
- **Reason**: The budget limit is too low for your calorie target. Consider raising budget to ₹150/day.`;
                }
                const topPlan = plans[0];
                const mealsText = Object.entries(topPlan.meals).map(([cat, combo]) => {
                    const foods = combo.foods.map(f => `${f.food.name} (x${f.portions})`).join(' + ');
                    return `- **${cat}**: ${foods} (₹${Math.round(combo.totalCost)} · ${combo.totalCalories} kcal)`;
                }).join('\n');

                return `### Recommendation: Daily Budget Challenge Plan
${mealsText}
- **Total Cost**: ₹${Math.round(topPlan.totalDailyCost)}/day
- **Total Calories**: ${topPlan.totalDailyCalories} kcal
- **Protein**: ${topPlan.totalDailyProtein}g
- **Reason**: Structured locally using the NutriSetu optimization engine to stay under ₹${budgetLimit}/day.`;
            } else {
                const combos = recommendations[category] || [];
                if (combos.length === 0) {
                    return `### Recommendation: Meal Suggestion
- **Status**: No local options found for ${category} within constraints.
- **Reason**: Try adjusting diet type preferences or target budget.`;
                }
                const topCombo = combos[0];
                const foods = topCombo.foods.map(f => `${f.food.name} (x${f.portions})`).join(' + ');

                return `### Recommendation: ${category}
- **Meal**: ${foods}
- **Calories**: ${topCombo.totalCalories} kcal
- **Protein**: ${topCombo.totalProtein}g
- **Cost**: ₹${Math.round(topCombo.totalCost)}
- **Reason**: Best matched meal suggestion from the NutriSetu database for your ${user.dietType} profile.`;
            }
        } catch (err) {
            console.error('Local suggestion error:', err);
        }
    }

    return null; // Route to Claude API
}

// Rule-based fallback replies
function getFallbackReply(msg, user, context) {
    const l = msg.toLowerCase();
    const dt = user.dietType || 'veg';
    
    if (l.includes('protein')) {
        return `### Recommendation: High Protein Sources
- **Protein**: 20-30g per serving
- **Cost**: ₹20 - ₹80
- **Reason**: For a ${dt} profile, prioritize protein to support muscle preservation.
- **Veg/Vegan protein**: Soy chunks, Tofu, sprouts, chana, dal.
- **Non-Veg protein**: Eggs, chicken breast, fish.`;
    }
    if (l.includes('snack')) {
        return `### Recommendation: Sprout Chaat or Roasted Chana
- **Calories**: 110 kcal
- **Protein**: 8g
- **Cost**: ₹10
- **Reason**: A whole food, natural option that is extremely cost-friendly and low calorie.`;
    }
    if (l.includes('lunch') || l.includes('dinner')) {
        return `### Recommendation: Dal Rice & Mixed Veg
- **Calories**: 380 kcal
- **Protein**: 14g
- **Cost**: ₹25
- **Reason**: Rich in complete plant-based proteins, natural ingredients, and high fiber.`;
    }
    if (l.includes('weight')) {
        return `### Recommendation: Progress Coaching
- **Details**: Stay within your calorie target (${user.calorieTarget} kcal) and log daily.
- **Goal**: Safe weight change is around 0.5 kg per week.
- **Reason**: Consistency is key. Your current adherence rate is ${context.progress.adherenceRate}.`;
    }
    if (l.includes('calorie')) {
        return `### Recommendation: Calorie Management
- **Details**: Daily calorie target is ${user.calorieTarget} kcal.
- **Remaining**: ${context.state.caloriesRemaining} kcal today.
- **Reason**: To reach your target weight of ${user.targetWeight} kg, stick to this threshold.`;
    }
    
    return `### Recommendation: Wellness Advice
- **Details**: Focus on hydration, getting 7-8 hours of sleep, and consistent food logging.
- **Reason**: Sustainable health depends on small, daily habits.`;
}

exports.getChatHistory = async (req, res) => {
    try {
        const history = await ChatHistory.find({
            userId: req.user.id
        }).sort({ timestamp: 1 });
        
        res.json(history);
    } catch (err) {
        console.error('Fetch chat history error:', err);
        res.status(500).json({ error: 'Server error fetching chat history' });
    }
};

exports.sendChatMessage = async (req, res) => {
    try {
        const { message } = req.body;
        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message content is required' });
        }

        const user = req.user;

        // 1. Gather all statistics for context
        const context = await gatherUserContext(user);

        // 2. Save user message to database
        const userChat = new ChatHistory({
            userId: user._id,
            role: 'user',
            message: message.trim()
        });
        await userChat.save();

        let botReply = '';

        // 3. AI Tool Router: check if request needs local processing
        const routedLocalResponse = await handleLocalIntents(message, user, context);

        if (routedLocalResponse) {
            botReply = routedLocalResponse;
        } else {
            // Forward to AI model (Claude) with context injected
            const apiKey = process.env.ANTHROPIC_API_KEY;
            
            if (apiKey) {
                try {
                    const dietLabel = user.dietType === 'vegan' ? 'vegan' : user.dietType === 'veg' ? 'vegetarian' : 'non-vegetarian';
                    
                    const systemPrompt = `You are NutriBot 2.0, an intelligent, context-aware nutrition assistant and personal diet coach for NutriSetu.
You are directly integrated with the user's account and progress metrics.

[Current User Profile]
- Name: ${context.profile.name}
- Age: ${context.profile.age}
- Gender: ${context.profile.gender}
- Current Weight: ${context.profile.weight} kg (Target: ${context.profile.targetWeight} kg)
- Goal: ${context.profile.goal}
- Calorie Target: ${context.profile.calorieTarget} kcal/day
- Diet Type: ${dietLabel}
- Budget Target: ₹${context.profile.budgetTarget}/day

[Today's Nutrition State]
- Calories Consumed Today: ${context.state.caloriesConsumed} kcal (Remaining: ${context.state.caloriesRemaining} kcal)
- Spending Today: ₹${Math.round(context.state.spendingToday)} (Remaining: ₹${Math.round(context.state.budgetRemaining)})
- Logged Meals: ${context.state.loggedMeals}

[Recent Progress & Analytics]
- Weight History (Last 7 weight logs): ${context.progress.weightHistory}
- Calorie History (Last 7 days logs): ${context.progress.calorieHistory}
- Meal Adherence Rate: ${context.progress.adherenceRate}

CRITICAL RULES:
1. Do NOT suggest any foods outside the user's dietType: ${user.dietType}.
2. Do NOT use any emojis (like 🥗, 🥑, 🍳, 🌿, etc.) anywhere in your output. Use clean text formatting.
3. Be professional, warm, and highly actionable.
4. Keep responses concise (under 120 words).
5. If the user asks for a meal suggestion or swap, use the following structure:
### Recommendation: [Name]
- Calories: [Val]
- Protein: [Val]
- Cost: [Val]
- Reason: [Short explanation]`;

                    const response = await fetch('https://api.anthropic.com/v1/messages', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': apiKey,
                            'anthropic-version': '2023-06-01'
                        },
                        body: JSON.stringify({
                            model: 'claude-3-5-sonnet-20241022',
                            max_tokens: 300,
                            system: systemPrompt,
                            messages: [{ role: 'user', content: message.trim() }]
                        })
                    });

                    if (response.ok) {
                        const data = await response.json();
                        botReply = data.content?.[0]?.text || getFallbackReply(message, user, context);
                    } else {
                        const errorText = await response.text();
                        console.warn('Claude API request failed, using fallback:', errorText);
                        botReply = getFallbackReply(message, user, context);
                    }
                } catch (apiErr) {
                    console.error('Claude API call error, using fallback:', apiErr.message);
                    botReply = getFallbackReply(message, user, context);
                }
            } else {
                botReply = getFallbackReply(message, user, context);
            }
        }

        // 4. Save bot response to database
        const botChat = new ChatHistory({
            userId: user._id,
            role: 'bot',
            message: botReply
        });
        await botChat.save();

        res.json({ userMessage: userChat, botResponse: botChat });
    } catch (err) {
        console.error('Chat controller error:', err);
        res.status(500).json({ error: 'Server error processing chat message' });
    }
};
