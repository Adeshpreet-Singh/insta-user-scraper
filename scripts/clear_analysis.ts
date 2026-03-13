import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import Lead from '../models/Lead';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function clearAnalysis() {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('Connected to MongoDB');

        const totalLeads = await Lead.countDocuments({});
        const analyzedLeads = await Lead.countDocuments({ 'aiAnalysis.analyzedAt': { $exists: true } });
        
        console.log(`Total leads in DB: ${totalLeads}`);
        console.log(`Leads with analyzedAt: ${analyzedLeads}`);

        if (analyzedLeads > 0) {
            const result = await Lead.updateMany(
                {}, 
                { $unset: { aiAnalysis: "" } }
            );
            console.log(`Successfully cleared aiAnalysis for ${result.modifiedCount} leads.`);
        } else {
            console.log('No leads with analyzedAt found. Checking for partial aiAnalysis objects...');
            const partials = await Lead.countDocuments({ aiAnalysis: { $exists: true } });
            console.log(`Leads with ANY aiAnalysis data: ${partials}`);
            if (partials > 0) {
                const result = await Lead.updateMany({}, { $unset: { aiAnalysis: "" } });
                console.log(`Cleared ${result.modifiedCount} partial aiAnalysis objects.`);
            }
        }

        const remaining = await Lead.countDocuments({ 'aiAnalysis.analyzedAt': { $exists: true } });
        console.log(`Remaining analyzed leads: ${remaining}`);

    } catch (e) {
        console.error("Error clearing analysis:", e);
    } finally {
        await mongoose.disconnect();
    }
}

clearAnalysis();
