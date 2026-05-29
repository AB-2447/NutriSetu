const ChatHistory = require('../models/ChatHistory');

// Rule-based fallback replies from the original NutriSetu app
function getFallbackReply(msg, dietType) {
    const l = msg.toLowerCase();
    const dt = dietType || 'veg';
    if (l.includes('protein')) {
        return dt === 'vegan' 
            ? 'Top vegan proteins: dal, soya chunks, tofu, moong chilla, roasted chana. Combine grains + legumes for complete protein!' 
            : dt === 'veg' 
                ? 'Best veg proteins: paneer, eggs, Greek yogurt, dal, moong chilla.' 
                : 'Great protein sources: chicken, eggs, fish, paneer, dal — aim for 0.8–1g per kg bodyweight.';
    }
    if (l.includes('snack')) {
        return dt === 'nonveg' 
            ? 'Healthy snacks: boiled eggs, egg chaat, chicken soup, fruit chaat, roasted chana.' 
            : 'Great snacks: makhana, sprout chaat, fruit chaat, roasted chana, curd with honey.';
    }
    if (l.includes('lunch')) {
        return dt === 'nonveg' 
            ? 'Ideal lunch: dal rice + sabzi, chicken curry, egg curry, or biryani.' 
            : dt === 'vegan' 
                ? 'Great vegan lunch: rajma chawal, dal rice, soya curry, or khichdi.' 
                : 'Solid vegetarian lunch: palak paneer + roti, dal rice, methi thepla, or chole.';
    }
    if (l.includes('weight')) {
        return 'Sustainable progress is ~0.5 kg/week. Stay in your calorie target, log daily, and update your weight each morning.';
    }
    if (l.includes('calorie')) {
        return 'Your daily target is on the Dashboard. Log every meal — even small ones — to stay accurate.';
    }
    return 'Focus on whole foods, adequate protein, and staying hydrated. Small consistent habits beat intense short efforts every time. 🌿';
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
        const dietLabel = user.dietType === 'vegan' ? 'vegan' : user.dietType === 'veg' ? 'vegetarian' : 'non-vegetarian';
        const dietContext = `The user follows a ${dietLabel} diet.`;

        // 1. Save user message to database
        const userChat = new ChatHistory({
            userId: user._id,
            role: 'user',
            message: message.trim()
        });
        await userChat.save();

        let botReply = '';
        const apiKey = process.env.ANTHROPIC_API_KEY;

        if (apiKey) {
            try {
                // Secure server-side fetch to Anthropic Claude API
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
                        system: `You are NutriBot, a friendly AI nutrition assistant for NutriSetu, an Indian diet tracker. ${dietContext} Give short, practical advice about food, calories, exercise, and healthy habits. Keep responses under 80 words. Respect the user's diet type — never suggest foods outside it. Be warm and encouraging.`,
                        messages: [{ role: 'user', content: message.trim() }]
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    botReply = data.content?.[0]?.text || getFallbackReply(message, user.dietType);
                } else {
                    const errorText = await response.text();
                    console.warn('Claude API request failed, using fallback:', errorText);
                    botReply = getFallbackReply(message, user.dietType);
                }
            } catch (apiErr) {
                console.error('Claude API call error, using fallback:', apiErr.message);
                botReply = getFallbackReply(message, user.dietType);
            }
        } else {
            // Graceful fallback to static rule-based replies if API key is not configured
            botReply = getFallbackReply(message, user.dietType);
        }

        // 2. Save bot response to database
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
