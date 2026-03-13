const { ApifyClient } = require('apify-client');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Load env vars
require('dotenv').config({ path: path.join(__dirname, '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '.env') }); // Fallback

// DB Connection
const MONGODB_URI = process.env.MONGODB_URI;
const LeadSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    fullName: String,
    followersCount: Number,
    followsCount: Number,
    postsCount: Number,
    biography: String,
    url: String,
    profilePicUrl: String,
    businessCategoryName: String,
    isVerified: Boolean,
    status: { type: String, default: 'new' },
    externalUrl: String,
    externalUrls: Array,
    biographyEmail: String,
    biographyPhone: String,
    updatedAt: { type: Date, default: Date.now },
    aiAnalysis: Object
});

let Lead;
try {
    Lead = mongoose.model('Lead');
} catch {
    Lead = mongoose.model('Lead', LeadSchema);
}

const client = new ApifyClient({
    token: process.env.APIFY_TOKEN,
});

/**
 * Utility to split array into chunks
 */
function chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

/**
 * Main scraper function
 */
async function runScraper() {
    let usernames = [];
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage:');
        console.log('  node index.js username1 username2 ...');
        console.log('  node index.js path/to/accounts.txt');
        return;
    }

    // Connect to DB if possible
    let useDB = false;
    if (MONGODB_URI) {
        try {
            await mongoose.connect(MONGODB_URI);
            console.log('✅ Connected to MongoDB. Results will be synced.');
            useDB = true;
        } catch (e) {
            console.warn('⚠️ MongoDB connection failed. Saving locally only.');
        }
    }

    // Check if the first argument is a text file
    if (args[0].endsWith('.txt')) {
        const filePath = path.resolve(args[0]);
        if (fs.existsSync(filePath)) {
            console.log(`📖 Reading usernames from file: ${filePath}`);
            const content = fs.readFileSync(filePath, 'utf-8');
            usernames = content.split(/\r?\n/).map(u => u.trim()).filter(u => u.length > 0);
        } else {
            console.error(`❌ File not found: ${filePath}`);
            if (useDB) await mongoose.disconnect();
            return;
        }
    } else {
        usernames = args.map(u => u.trim());
    }

    // Deduplicate
    usernames = [...new Set(usernames)];
    console.log(`🎯 Total unique usernames to process: ${usernames.length}`);

    const outputDir = path.join(__dirname, 'results');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Filter out already scraped profiles (Resume capability)
    const pendingUsernames = usernames.filter(u => !fs.existsSync(path.join(outputDir, `${u}_data.json`)));

    if (pendingUsernames.length === 0) {
        console.log('✅ All profiles have already been scraped. Nothing to do.');
        if (useDB) await mongoose.disconnect();
        return;
    }

    if (pendingUsernames.length < usernames.length) {
        console.log(`⏭️ Skipping ${usernames.length - pendingUsernames.length} already scraped profiles.`);
    }

    // Chunking to avoid massive single requests
    const CHUNK_SIZE = 50;
    const chunks = chunkArray(pendingUsernames, CHUNK_SIZE);
    let allResults = [];

    for (let i = 0; i < chunks.length; i++) {
        const currentChunk = chunks[i];
        console.log(`\n📦 Processing chunk ${i + 1}/${chunks.length} (${currentChunk.length} users)...`);

        try {
            const run = await client.actor("apify/instagram-profile-scraper").call({
                usernames: currentChunk,
            });

            console.log(`⏳ Downloading results for chunk ${i + 1}...`);
            const { items } = await client.dataset(run.defaultDatasetId).listItems();

            for (const userData of items) {
                const username = userData.username || 'unknown';

                // Print quick summary
                console.log(`✨ [${username}] - Followers: ${userData.followersCount} | Email: ${userData.biographyEmail || 'N/A'}`);

                // Save locally
                const fileName = `${username}_data.json`;
                const filePath = path.join(outputDir, fileName);
                fs.writeFileSync(filePath, JSON.stringify(userData, null, 2));
                
                // Save to DB
                if (useDB && userData.username) {
                    try {
                        await Lead.findOneAndUpdate(
                            { username: userData.username },
                            { 
                                ...userData, 
                                updatedAt: new Date(),
                                // Don't overwrite status if it exists
                                $setOnInsert: { status: 'new' } 
                            },
                            { upsert: true, new: true }
                        );
                    } catch (dbErr) {
                        console.error(`❌ DB Error for ${username}:`, dbErr.message);
                    }
                }
                
                allResults.push(userData);
            }

            console.log(`✅ Chunk ${i + 1} complete. Saved ${items.length} profiles.`);
        } catch (error) {
            console.error(`❌ Error in chunk ${i + 1}:`, error.message);
        }
    }

    // Generate/Update CSV Sheet
    if (allResults.length > 0) {
        const csvHeaders = ['Username', 'Full Name', 'Followers', 'Website', 'Email (Bio)', 'Phone (Bio)', 'Category', 'Post Count', 'Is Verified', 'URL'];
        const csvRows = allResults.map(userData => {
            return [
                userData.username || '',
                (userData.fullName || '').replace(/,/g, ' ').replace(/"/g, "'"),
                userData.followersCount || 0,
                userData.externalUrl || '',
                userData.biographyEmail || '',
                userData.biographyPhone || '',
                userData.businessCategoryName || '',
                userData.postsCount || 0,
                userData.isVerified ? 'Yes' : 'No',
                userData.url || ''
            ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
        });

        const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
        const csvPath = path.join(outputDir, `summary_sheet_${Date.now()}.csv`);
        fs.writeFileSync(csvPath, csvContent);
        console.log(`\n📊 Final CSV Summary generated: ${csvPath}`);
    }

    if (useDB) {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB.');
    }

    console.log(`\n✨ Scraping process finished! Total profiles processed: ${allResults.length}`);
}

runScraper();
