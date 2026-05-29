const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const apiRoutes = require('./routes');
const priceService = require('./services/priceService');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files (SPA)
app.use(express.static(__dirname));

// MongoDB Connection
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/nutrisetu';
mongoose.connect(mongoUri)
    .then(() => {
        console.log('MongoDB connected successfully');
        // Trigger initial price refresh in background to populate cache
        priceService.refreshAllPrices();
    })
    .catch((err) => console.log('MongoDB connection error:', err));

// Mount Central Routes
app.use('/api', apiRoutes);

// Register 6-hour background cron refresher
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
setInterval(() => {
    console.log('Running scheduled background price refresh...');
    priceService.refreshAllPrices();
}, SIX_HOURS_MS);

// Handle listener errors (e.g. port already in use)
const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Visit NutriSetu at http://localhost:${PORT}`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Please free it or set a different PORT in .env`);
    } else {
        console.error('Server error:', err);
    }
    process.exit(1);
});

