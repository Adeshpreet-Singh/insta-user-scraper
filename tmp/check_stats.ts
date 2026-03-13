import mongoose from 'mongoose';
import Lead from '../models/Lead';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkStats() {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        const analyzedCount = await Lead.countDocuments({ 'aiAnalysis.analyzedAt': { $exists: true } });
        const totalCount = await Lead.countDocuments({});
        console.log(`Analyzed: ${analyzedCount}`);
        console.log(`Total: ${totalCount}`);
    } catch (error) {
        console.error(error);
    } finally {
        await mongoose.disconnect();
    }
}

checkStats();
