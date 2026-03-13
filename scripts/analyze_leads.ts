import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { OpenRouter } from '@openrouter/sdk';
import { createObjectCsvWriter } from 'csv-writer';
import Lead from '../models/Lead';
import path from 'path';
import fs from 'fs';

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env.local') });
dotenv.config({ path: path.join(__dirname, '../.env') }); // Fallback

// OPENROUTER SDK
if (!process.env.OPENROUTER_API_KEY) {
    console.error("ERROR: OPENROUTER_API_KEY is missing from your .env or .env.local file.");
    process.exit(1);
}

const openRouter = new OpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
});

/**
 * List of free models to try in order of preference
 */
const FREE_MODELS = [
    'openrouter/hunter-alpha',
    'openrouter/healer-alpha',
    'meta-llama/llama-3.3-70b-instruct:free',
    'nousresearch/hermes-3-llama-3.1-405b:free',
    'google/gemma-3-27b-it:free',
    'mistralai/mistral-small-3.1-24b-instruct:free',
    'google/gemma-3-12b-it:free',
    'meta-llama/llama-3.2-3b-instruct:free',
    'qwen/qwen-2.5-72b-instruct:free',
    'stepfun/step-3.5-flash:free'
];

/**
 * Helper to clean and extract JSON from AI text
 */
function cleanJSON(text: string): string {
    let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    if (!cleaned.startsWith('{')) {
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
            cleaned = cleaned.substring(start, end + 1);
        }
    }
    return cleaned;
}

/**
 * Helper to call AI with automatic fallback if a model is unavailable
 */
async function callAIWithFallback(prompt: string): Promise<string> {
    for (const model of FREE_MODELS) {
        try {
            console.log(`[AI] Attempting with model: ${model}...`);
            const stream = await openRouter.chat.send({
                chatGenerationParams: {
                    model: model,
                    messages: [{ role: 'user', content: prompt }],
                    stream: true,
                }
            });

            let fullText = '';
            for await (const chunk of stream) {
                const content = (chunk as any).choices?.[0]?.delta?.content;
                if (content) fullText += content;
            }

            if (fullText.trim()) {
                const cleaned = cleanJSON(fullText);
                console.log(`[AI] Success with ${model}`);
                return cleaned;
            }
        } catch (error: any) {
            console.warn(`[AI] Model ${model} failed:`, error.message || error);
        }
    }
    throw new Error('All attempts to call free AI models failed on OpenRouter.');
}

async function analyzeLead(lead: any, csvRecords: any[]) {
    const prompt = `
You are an expert sales strategist and high-conversion copywriter specializing in the **Indian market**. You know that Indian business owners are discerning, value-conscious, and relationship-driven.

Analyze the following Instagram profile based on its scraped data:
- Username: ${lead.username}
- Full Name: ${lead.fullName || 'N/A'}
- Followers: ${lead.followersCount || 'Unknown'}
- Following: ${lead.followsCount || 'Unknown'}
- Posts: ${lead.postsCount || 'Unknown'}
- Category: ${lead.businessCategoryName || 'Unknown'}
- Email: ${lead.biographyEmail || 'Not explicitly provided'}
- Phone: ${lead.biographyPhone || 'Not explicitly provided'}
- URL in Bio: ${lead.url || 'None'}
- External URLs: ${lead.externalUrls && lead.externalUrls.length > 0 ? lead.externalUrls.map((u: any) => u.url).join(', ') : 'None'}
- Biography: ${lead.biography || 'None'}

Provide a JSON response with the following strictly formatted keys:
1. "category": Highly specific niche description.
2. "painPoints": Array of strings identifying technical/business gaps.
3. "coldMessage": A personalized, high-conversion DM/Email opener in **English**.
4. "hinglishMessage": The same message translated into **Hinglish** (natural mix of Hindi and English).
5. "icebreaker": A 1-sentence opening line in English based on a specific detail.
6. "hinglishIcebreaker": The same icebreaker in **Hinglish**.
7. "coldCallOpener": A 2-sentence script for a voice call.
8. "conversationHooks": Minimum 3 personalized "Value-First" hooks.
9. "engagementAnalysis": Analysis of audience interaction.
10. "estimatedProjectValue": Realistic USD price range.
11. "projectValueINR": Estimated project worth in **Indian Rupees (INR)**. (Integer only).
12. "opportunityCost": A "Burning House" stat for the Indian context (e.g., "Missing out on ~₹40,000 monthly").
13. "personalityVibe": Estimate of their business personality.
14. "bestTimeToCall": Best day and time window to call.
15. "whatsappScript": Short, punchy, informal **Hinglish** WhatsApp message (max 15 words).
16. "followUpStrategy": 1-sentence instruction on when and how to follow up.
17. "estimatedAnnualROI": Estimation of additional revenue annually (in INR).
18. "indianStrategy": A specific "Wedge" to use for Indian clients.
19. "contentStrategy": Array of 3 specific content ideas.
20. "objectionHandlers": Array of objects {"objection", "response"}. Focus on Indian concerns.
21. "conversionChance": Number (0-100).
22. "leadScore": Number (0-100) - Overall quality score.
23. "outreachPriority": "High", "Medium", or "Low".
24. "qualityGrade": Letter grade (A, B, C, D).
25. "strategicRationale": Reasoning for the grade and chance.

Respond ONLY with valid JSON.
{
  "category": "...",
  "painPoints": ["...", "..."],
  "coldMessage": "...",
  "hinglishMessage": "...",
  "icebreaker": "...",
  "hinglishIcebreaker": "...",
  "coldCallOpener": "...",
  "conversationHooks": ["...", "..."],
  "engagementAnalysis": "...",
  "estimatedProjectValue": "...",
  "projectValueINR": 45000,
  "opportunityCost": "...",
  "personalityVibe": "...",
  "bestTimeToCall": "...",
  "whatsappScript": "...",
  "followUpStrategy": "...",
  "estimatedAnnualROI": "...",
  "indianStrategy": "...",
  "contentStrategy": ["...", "..."],
  "objectionHandlers": [{"objection": "...", "response": "..."}],
  "conversionChance": 85,
  "leadScore": 92,
  "outreachPriority": "High",
  "qualityGrade": "A",
  "strategicRationale": "..."
}
`;

    try {
        const jsonText = await callAIWithFallback(prompt);
        const analysis = JSON.parse(jsonText);

        lead.aiAnalysis = {
            category: analysis.category,
            painPoints: analysis.painPoints || [],
            coldMessage: analysis.coldMessage,
            hinglishMessage: analysis.hinglishMessage,
            icebreaker: analysis.icebreaker,
            hinglishIcebreaker: analysis.hinglishIcebreaker,
            coldCallOpener: analysis.coldCallOpener,
            conversationHooks: analysis.conversationHooks || [],
            engagementAnalysis: analysis.engagementAnalysis,
            opportunityCost: analysis.opportunityCost,
            personalityVibe: analysis.personalityVibe,
            whatsappScript: analysis.whatsappScript,
            followUpStrategy: analysis.followUpStrategy,
            estimatedAnnualROI: analysis.estimatedAnnualROI,
            estimatedProjectValue: analysis.estimatedProjectValue,
            projectValueINR: analysis.projectValueINR,
            bestTimeToCall: analysis.bestTimeToCall,
            indianStrategy: analysis.indianStrategy,
            contentStrategy: analysis.contentStrategy || [],
            objectionHandlers: analysis.objectionHandlers || [],
            conversionChance: analysis.conversionChance,
            leadScore: analysis.leadScore,
            outreachPriority: analysis.outreachPriority,
            qualityGrade: analysis.qualityGrade,
            strategicRationale: analysis.strategicRationale,
            analyzedAt: new Date()
        };

        await lead.save();

        csvRecords.push({
            username: lead.username,
            category: analysis.category,
            painPoints: (analysis.painPoints || []).join(' | '),
            coldMessage: analysis.coldMessage,
            hinglishMessage: analysis.hinglishMessage,
            icebreaker: analysis.icebreaker,
            hinglishIcebreaker: analysis.hinglishIcebreaker,
            coldCallOpener: analysis.coldCallOpener,
            conversationHooks: (analysis.conversationHooks || []).join(' | '),
            engagementAnalysis: analysis.engagementAnalysis,
            estimatedProjectValue: analysis.estimatedProjectValue,
            projectValueINR: analysis.projectValueINR,
            opportunityCost: analysis.opportunityCost,
            personalityVibe: analysis.personalityVibe,
            bestTimeToCall: analysis.bestTimeToCall,
            whatsappScript: analysis.whatsappScript,
            followUpStrategy: analysis.followUpStrategy,
            estimatedAnnualROI: analysis.estimatedAnnualROI,
            indianStrategy: analysis.indianStrategy,
            contentStrategy: (analysis.contentStrategy || []).join(' | '),
            objectionHandlers: (analysis.objectionHandlers || []).map((o: any) => `${o.objection}: ${o.response}`).join(' | '),
            conversionChance: analysis.conversionChance,
            leadScore: analysis.leadScore,
            outreachPriority: analysis.outreachPriority,
            qualityGrade: analysis.qualityGrade,
            strategicRationale: analysis.strategicRationale
        });

        console.log(`✅ Successfully analyzed ${lead.username}`);
    } catch (innerError) {
        console.error(`❌ Error analyzing ${lead.username}:`, innerError);
    }
}

async function analyzeLeads() {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('Connected to MongoDB');

        const resultsDir = path.join(__dirname, '../results');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir);
        }

        // Fetch leads that haven't been analyzed yet
        // Increased limit for better efficiency
        const leads = await Lead.find({ 'aiAnalysis.analyzedAt': { $exists: false } });
        console.log(`Found ${leads.length} unanalyzed leads to process.`);

        const csvRecords: any[] = [];
        const CONCURRENCY = 5; // Process 5 leads at a time

        for (let i = 0; i < leads.length; i += CONCURRENCY) {
            const batch = leads.slice(i, i + CONCURRENCY);
            console.log(`\n🚀 Processing batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(leads.length / CONCURRENCY)}...`);
            
            await Promise.all(batch.map(lead => analyzeLead(lead, csvRecords)));
            
            // Short delay between batches for ratelimits
            if (i + CONCURRENCY < leads.length) {
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }

        if (csvRecords.length > 0) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const csvWriter = createObjectCsvWriter({
                path: path.join(resultsDir, `ai_analysis_${timestamp}.csv`),
                header: [
                    { id: 'username', title: 'Username' },
                    { id: 'category', title: 'Category' },
                    { id: 'painPoints', title: 'Pain Points' },
                    { id: 'coldMessage', title: 'Cold Message' },
                    { id: 'hinglishMessage', title: 'Hinglish Message' },
                    { id: 'icebreaker', title: 'Icebreaker' },
                    { id: 'hinglishIcebreaker', title: 'Hinglish Icebreaker' },
                    { id: 'coldCallOpener', title: 'Cold Call Opener' },
                    { id: 'conversationHooks', title: 'Conversation Hooks' },
                    { id: 'engagementAnalysis', title: 'Engagement Analysis' },
                    { id: 'estimatedProjectValue', title: 'Estimated Project Value' },
                    { id: 'projectValueINR', title: 'Project Value INR' },
                    { id: 'opportunityCost', title: 'Opportunity Cost' },
                    { id: 'personalityVibe', title: 'Personality Vibe' },
                    { id: 'bestTimeToCall', title: 'Best Time to Call' },
                    { id: 'whatsappScript', title: 'WhatsApp Script' },
                    { id: 'followUpStrategy', title: 'Follow Up Strategy' },
                    { id: 'estimatedAnnualROI', title: 'Estimated Annual ROI' },
                    { id: 'indianStrategy', title: 'Indian Strategy' },
                    { id: 'contentStrategy', title: 'Content Strategy' },
                    { id: 'objectionHandlers', title: 'Objection Handlers' },
                    { id: 'conversionChance', title: 'Conversion Chance' },
                    { id: 'leadScore', title: 'Lead Score' },
                    { id: 'outreachPriority', title: 'Outreach Priority' },
                    { id: 'qualityGrade', title: 'Quality Grade' },
                    { id: 'strategicRationale', title: 'Strategic Rationale' }
                ]
            });
            await csvWriter.writeRecords(csvRecords);
            console.log(`\nWrote ${csvRecords.length} records to results/ai_analysis_${timestamp}.csv`);
        }

        console.log('Finished analyzing leads.');
    } catch (e) {
        console.error("Error connecting or processing:", e);
    } finally {
        await mongoose.disconnect();
    }
}

analyzeLeads();
