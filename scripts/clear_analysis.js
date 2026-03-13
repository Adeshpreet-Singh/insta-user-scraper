const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('Missing MONGODB_URI');
    process.exit(1);
}

const leadSchema = new mongoose.Schema({
    username: String,
    aiAnalysis: mongoose.Schema.Types.Mixed,
    updatedAt: { type: Date, default: Date.now }
});

const Lead = mongoose.models.Lead || mongoose.model('Lead', leadSchema);

async function run() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const result = await Lead.updateMany(
            {}, 
            { $unset: { aiAnalysis: "" } }
        );

        console.log(`Successfully cleared aiAnalysis for ${result.modifiedCount} leads.`);
        
        // Optional: Also check if any are left (though unset should do it)
        const count = await Lead.countDocuments({ aiAnalysis: { $exists: true } });
        console.log(`Leads still having aiAnalysis: ${count}`);

        process.exit(0);
    } catch (err) {
        console.error('Global Error:', err);
        process.exit(1);
    }
}

run();
