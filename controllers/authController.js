const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Helper to calculate BMR, TDEE, and Calorie Target on the server
function calculateNutritionTargets(userParams) {
    const { age, gender, height, weight, activityLevel, goal } = userParams;
    
    // Mifflin-St Jeor Equation
    const bmr = gender === 'male'
        ? 10 * weight + 6.25 * height - 5 * age + 5
        : 10 * weight + 6.25 * height - 5 * age - 161;

    const multipliers = {
        sedentary: 1.2,
        lightly: 1.375,
        moderately: 1.55,
        very: 1.725,
        extra: 1.9
    };

    const tdee = Math.round(bmr * (multipliers[activityLevel] || 1.2));
    
    let calorieTarget = tdee;
    if (goal === 'loss') calorieTarget -= 500;
    else if (goal === 'gain') calorieTarget += 500;
    
    return {
        tdee,
        calorieTarget: Math.round(calorieTarget)
    };
}

exports.signup = async (req, res) => {
    try {
        const { name, email, password, age, gender, height, weight, targetWeight, activityLevel, goal, dietType, budgetTarget } = req.body;
        
        // Validation
        if (!name || !email || !password || !age || !gender || !height || !weight || !targetWeight || !activityLevel || !goal || !dietType) {
            return res.status(400).json({ error: 'Missing required signup fields' });
        }

        if (typeof age !== 'number' || age < 1 || age > 130) {
            return res.status(400).json({ error: 'Invalid age value' });
        }
        if (typeof height !== 'number' || height < 50 || height > 300) {
            return res.status(400).json({ error: 'Invalid height value' });
        }
        if (typeof weight !== 'number' || weight < 10 || weight > 500) {
            return res.status(400).json({ error: 'Invalid weight value' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        // Hashing password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Compute targets
        const { tdee, calorieTarget } = calculateNutritionTargets({ age, gender, height, weight, activityLevel, goal });

        // Save new user
        const newUser = new User({
            name,
            email,
            passwordHash,
            age,
            gender,
            height,
            weight,
            targetWeight,
            activityLevel,
            goal,
            dietType,
            tdee,
            calorieTarget,
            budgetTarget: budgetTarget || 300
        });

        await newUser.save();

        // Issue token
        const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET || 'jwt_secret_fallback_key', { expiresIn: '24h' });

        res.status(201).json({
            token,
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                dietType: newUser.dietType,
                calorieTarget: newUser.calorieTarget,
                budgetTarget: newUser.budgetTarget
            }
        });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ error: 'Server error during signup' });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Please enter email and password' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'jwt_secret_fallback_key', { expiresIn: '24h' });

        res.json({
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                dietType: user.dietType,
                calorieTarget: user.calorieTarget,
                budgetTarget: user.budgetTarget
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login' });
    }
};

exports.logout = (req, res) => {
    // Session state cleared on frontend by discarding JWT token.
    res.json({ success: true, message: 'Logged out successfully' });
};

exports.getMe = async (req, res) => {
    try {
        // req.user is populated by authMiddleware
        res.json(req.user);
    } catch (err) {
        console.error('Get profile error:', err);
        res.status(500).json({ error: 'Server error fetching user profile' });
    }
};
