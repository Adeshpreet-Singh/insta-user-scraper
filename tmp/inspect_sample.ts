import mongoose from 'mongoose';
import Lead from '../models/Lead';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function inspectSample() {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        // Use the raw collection to see fields not in the Mongoose schema
        const sampleRaw = await mongoose.connection.db.collection('leads').findOne({});
        if (sampleRaw) {
            console.log('--- RAW SAMPLE FROM DB ---');
            // Log keys only to see what's there
            console.log('Available keys:', Object.keys(sampleRaw));
            
            // Log specific interesting fields if they exist
            const interestingFields = ['biographyEmail', 'biographyPhone', 'latestPosts', 'hashtags', 'city', 'publicEmail'];
            interestingFields.forEach(field => {
                if (sampleRaw[field]) {
                    console.log(`\nField [${field}]:`, JSON.stringify(sampleRaw[field], null, 2).substring(0, 1000));
                }
            });
            
            console.log('\n--- FULL BIOGRAPHY ---');
            console.log(sampleRaw.biography);
        } else {
            console.log('No leads found in DB');
        }
    } catch (error) {
        console.error(error);
    } finally {
        await mongoose.disconnect();
    }
}

inspectSample();
