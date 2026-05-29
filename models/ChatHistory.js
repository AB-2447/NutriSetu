const mongoose = require('mongoose');

const chatHistorySchema = new mongoose.Schema({
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role:      { type: String, enum: ['user', 'bot'], required: true },
    message:   { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ChatHistory', chatHistorySchema);
