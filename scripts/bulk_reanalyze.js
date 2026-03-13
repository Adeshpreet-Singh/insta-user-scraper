const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!MONGODB_URI || !OPENROUTER_API_KEY) {
    console.error('Missing MONGODB_URI or OPENROUTER_API_KEY');
    process.exit(1);
}

const leadSchema = new mongoose.Schema({
    username: String,
    fullName: String,
    biography: String,
    biographyEmail: String,
    biographyPhone: String,
    url: String,
    followersCount: Number,
    followsCount: Number,
    postsCount: Number,
    externalUrls: Array,
    businessCategoryName: String,
    aiAnalysis: mongoose.Schema.Types.Mixed,
    updatedAt: { type: Date, default: Date.now }
});

const Lead = mongoose.models.Lead || mongoose.model('Lead', leadSchema);

const FREE_MODELS = [
    'openrouter/hunter-alpha',
    'openrouter/healer-alpha',
    'google/gemma-3-27b-it:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'mistralai/mistral-small-3.1-24b-instruct:free',
    'google/gemini-2.0-flash-exp:free',
];

function cleanJSON(text) {
    let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    if (!cleaned.startsWith('[') && !cleaned.startsWith('{')) {
        const start = Math.min(
            cleaned.indexOf('[') === -1 ? Infinity : cleaned.indexOf('['),
            cleaned.indexOf('{') === -1 ? Infinity : cleaned.indexOf('{')
        );
        const end = Math.max(
            cleaned.lastIndexOf(']'),
            cleaned.lastIndexOf('}')
        );
        if (start !== Infinity && end !== -1 && end > start) {
            cleaned = cleaned.substring(start, end + 1);
        }
    }
    return cleaned;
}

async function callAIWithFallback(prompt) {
    for (const model of FREE_MODELS) {
        try {
            console.log(`    [AI] Trying ${model}...`);
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://github.com/insta-user-scraper',
                    'X-Title': 'Insta Lead Scraper'
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: prompt }],
                    response_format: { type: "json_object" }
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                console.warn(`    [AI] ${model} HTTP error ${response.status}:`, errText);
                continue;
            }

            const data = await response.json();
            
            if (data.error) {
                console.warn(`    [AI] ${model} API error:`, data.error);
                continue;
            }

            const fullText = data.choices?.[0]?.message?.content;

            if (fullText && fullText.trim()) {
                const cleaned = cleanJSON(fullText);
                return cleaned;
            }
        } catch (error) {
            console.warn(`    [AI] ${model} Network error:`, error.message);
        }
    }
    throw new Error('All free models failed.');
}

async function run() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const leads = await Lead.find({});
        console.log(`Found ${leads.length} leads for analysis/re-analysis.`);

        const BATCH_SIZE = 2; 
        for (let i = 0; i < leads.length; i += BATCH_SIZE) {
            const chunk = leads.slice(i, i + BATCH_SIZE);
            console.log(`\n[Batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(leads.length/BATCH_SIZE)}] Processing: ${chunk.map(l => '@' + l.username).join(', ')}`);

            const profiles = chunk.map(l => ({
                id: l._id,
                username: l.username,
                fullName: l.fullName,
                bio: l.biography,
                email: l.biographyEmail,
                phone: l.biographyPhone,
                url: l.url,
                externalUrls: l.externalUrls ? l.externalUrls.map(u => u.url).join(', ') : '',
                category: l.businessCategoryName,
                metrics: `${l.followersCount} followers, ${l.followsCount} following, ${l.postsCount} posts`
            }));

            const prompt = `
You are an expert sales strategist for the **Indian market**. Analyze these ${chunk.length} Instagram profiles and provide a strategic high-ticket analysis for each. 

PROFILES TO ANALYZE:
${JSON.stringify(profiles, null, 2)}

For EACH profile, return a concise but strategic analysis object. Match the profile "id" exactly.
Required JSON keys per profile:
"id", "category", "painPoints", "coldMessage", "hinglishMessage", "icebreaker", "hinglishIcebreaker", "coldCallOpener", "conversationHooks", "engagementAnalysis", "estimatedProjectValue", "projectValueINR", "opportunityCost", "personalityVibe", "bestTimeToCall", "whatsappScript", "followUpStrategy", "estimatedAnnualROI", "indianStrategy", "contentStrategy", "objectionHandlers", "conversionChance", "leadScore", "outreachPriority", "qualityGrade", "strategicRationale".

Important Notes for Indian Market:
- hinglishMessage & hinglishIcebreaker should be a natural mix of Hindi and English.
- projectValueINR should be an integer representing estimated value in Rupees.
- whatsappScript should be informal Hinglish, max 15 words.
- indianStrategy should be a specific "Wedge" to use for Indian clients.

Return a JSON object with a "results" key containing an array of these objects.
{
  "results": [
    { "id": "...", ... },
    ...
  ]
}
`;

            try {
                const jsonText = await callAIWithFallback(prompt);
                try {
                    const data = JSON.parse(jsonText);
                    const results = data.results || (Array.isArray(data) ? data : null);

                    if (Array.isArray(results)) {
                        for (const analysis of results) {
                            const leadId = analysis.id || analysis.username;
                            const lead = chunk.find(l => l._id.toString() === leadId || l.username === leadId);
                            if (lead) {
                                lead.aiAnalysis = {
                                    ...analysis,
                                    analyzedAt: new Date()
                                };
                                await lead.save();
                                console.log(`  Updated @${lead.username}`);
                            }
                        }
                    } else {
                        console.error('  AI did not return an array. Full response was:', jsonText);
                    }
                } catch (parseErr) {
                    console.error('  JSON Parse Error:', parseErr.message);
                    console.log('  Response sample:', jsonText.substring(0, 500));
                }
            } catch (err) {
                console.error(`  Batch failed:`, err.message);
            }

            await new Promise(r => setTimeout(r, 4000));
        }

        console.log('\nBulk re-analysis complete.');
        process.exit(0);
    } catch (err) {
        console.error('Global Error:', err);
        process.exit(1);
    }
}

run();
