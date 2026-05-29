const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function (req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Access denied. No token provided.' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'jwt_secret_fallback_key');
        
        // Find user by id in decoded JWT
        const user = await User.findById(decoded.id).select('-passwordHash');
        if (!user) {
            return res.status(401).json({ error: 'Invalid token. User not found.' });
        }

        req.user = user;
        next();
    } catch (err) {
        console.error('Auth verification error:', err.message);
        return res.status(401).json({ error: 'Authentication failed. Invalid or expired token.' });
    }
};
