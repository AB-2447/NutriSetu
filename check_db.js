const mongoose = require('mongoose');
const Food = require('./models/Food');

async function run() {
    await mongoose.connect('mongodb://localhost:27017/nutrisetu');
    const totalCount = await Food.countDocuments();
    console.log('Total foods:', totalCount);
    
    const byCategory = await Food.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);
    console.log('Counts by category:', byCategory);
    
    mongoose.disconnect();
}
run();
