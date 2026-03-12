import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createObjectCsvWriter } from 'csv-writer';
import Lead from '../models/Lead';
import path from 'path';
import fs from 'fs';

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env.local') });
dotenv.config({ path: path.join(__dirname, '../.env') }); // Fallback

if (!process.env.GEMINI_API_KEY) {
    console.error("ERROR: GEMINI_API_KEY is missing from your .env or .env.local file.");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function analyzeLeads() {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('Connected to MongoDB');

        // Ensure results directory exists
        const resultsDir = path.join(__dirname, '../results');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir);
        }

        // Fetch up to 109 leads that haven't been analyzed yet
        const leads = await Lead.find({ 'aiAnalysis.analyzedAt': { $exists: false } }).limit(109);
        console.log(`Found ${leads.length} unanalyzed leads to process.`);

        const csvRecords = [];

        for (const lead of leads) {
            console.log(`Analyzing ${lead.username}...`);

            const prompt = `
You are an expert sales strategist and copywriter focusing on web design services for small businesses and creators.
Analyze the following Instagram profile based on its scraped data:
Username: ${lead.username}
Full Name: ${lead.fullName || 'N/A'}
Followers: ${lead.followersCount || 'Unknown'}
Category: ${lead.businessCategoryName || 'Unknown'}
URL in Bio: ${lead.url || 'None'}
External URLs: ${lead.externalUrls ? lead.externalUrls.map(u => u.url).join(', ') : 'None'}
Biography: ${lead.biography || 'None'}

Your goal is to pitch a website design or optimization service to this specific business. I have already built a free tool for them that can act as a lead magnet.

Provide a JSON response with the following strictly formatted keys:
1. "category": A short description of their business type (e.g., "E-commerce Jewelry", "Local Gym").
2. "painPoint": The primary reason they need a website or better website, based on the data (e.g., "No custom domain, using linktree", "High followers but forcing DMs for orders", "Only an Instagram page").
3. "coldCallScript": A natural, 2-sentence opening line for a cold call addressing them by name and identifying their specific pain point.
4. "dmPitch": A short, friendly, hyper-personalized Instagram DM. Start by complementing something specific from their bio/category, offer the free tool as an icebreaker, and gently mention how a website could help their specific pain point. DO NOT sound like a bot.

Respond ONLY with valid JSON. Do not include markdown \`\`\`json wrappers.
{
  "category": "...",
  "painPoint": "...",
  "coldCallScript": "...",
  "dmPitch": "..."
}
`;

            try {
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: prompt,
                    config: {
                         responseMimeType: "application/json",
                    }
                });

                const jsonText = response.text || "{}";
                const analysis = JSON.parse(jsonText);

                lead.aiAnalysis = {
                    category: analysis.category,
                    painPoints: analysis.painPoints,
                    coldCallOpener: analysis.coldCallOpener,
                    conversationHooks: analysis.conversationHooks,
                    objectionHandlers: analysis.objectionHandlers,
                    analyzedAt: new Date()
                };

                await lead.save();

                csvRecords.push({
                    username: lead.username,
                    category: analysis.category,
                    painPoints: (analysis.painPoints || []).join(' | '),
                    coldCallOpener: analysis.coldCallOpener,
                    conversationHooks: (analysis.conversationHooks || []).join(' | ')
                });

                console.log(`Successfully analyzed ${lead.username}`);
            } catch (innerError) {
                console.error(`Error analyzing ${lead.username}:`, innerError);
            }
        }

        if (csvRecords.length > 0) {
            const csvWriter = createObjectCsvWriter({
                path: path.join(resultsDir, 'ai_analysis.csv'),
                header: [
                    { id: 'username', title: 'Username' },
                    { id: 'category', title: 'Category' },
                    { id: 'painPoint', title: 'Pain Point' },
                    { id: 'coldCallScript', title: 'Cold Call Script' },
                    { id: 'dmPitch', title: 'DM Pitch' }
                ]
            });
            await csvWriter.writeRecords(csvRecords);
            console.log(`\\nWrote ${csvRecords.length} records to results/ai_analysis.csv`);
        }

        console.log('Finished analyzing leads.');
    } catch (e) {
        console.error("Error connecting or processing:", e);
    } finally {
        await mongoose.disconnect();
    }
}

analyzeLeads();
