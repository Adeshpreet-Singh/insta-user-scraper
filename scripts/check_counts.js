const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const leadSchema = new mongoose.Schema({
    username: String,
    aiAnalysis: mongoose.Schema.Types.Mixed
});

const Lead = mongoose.models.Lead || mongoose.model('Lead', leadSchema);

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const totalLeads = await Lead.countDocuments({});
        const analyzedLeads = await Lead.countDocuments({ 
            'aiAnalysis.analyzedAt': { $exists: true } 
        });
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentlyAnalyzed = await Lead.countDocuments({ 
            'aiAnalysis.analyzedAt': { $gte: oneHourAgo } 
        });
        console.log(`Total Leads: ${totalLeads}`);
        console.log(`Analyzed Leads (Total): ${analyzedLeads}`);
        console.log(`Recently Analyzed (Last 1h): ${recentlyAnalyzed}`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
