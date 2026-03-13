import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Lead from '@/models/Lead';
// --- GEMINI (commented out) ---
// import { GoogleGenAI } from '@google/genai';
import { OpenRouter } from '@openrouter/sdk';

export const dynamic = 'force-dynamic';

/**
 * List of top free models to try for lead analysis
 */
const FREE_MODELS = [
    'openrouter/hunter-alpha',
    'openrouter/healer-alpha',
    'meta-llama/llama-3.3-70b-instruct:free',
    'google/gemma-3-27b-it:free',
    'mistralai/mistral-small-3.1-24b-instruct:free',
    'google/gemma-3-12b-it:free',
    'meta-llama/llama-3.2-3b-instruct:free',
    'stepfun/step-3.5-flash:free',
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
 * Intelligent helper to call AI with sequential fallback
 */
async function callAIWithFallback(prompt: string, openRouter: OpenRouter): Promise<string> {
    for (const model of FREE_MODELS) {
        try {
            console.log(`[AI] Attempting with model: ${model}...`);
            const stream = await openRouter.chat.send({
                chatGenerationParams: {
                    model,
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

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { id } = body;

        if (!id) {
            return NextResponse.json({ error: 'Lead ID is required' }, { status: 400 });
        }

        // --- GEMINI (commented out) ---
        // if (!process.env.GEMINI_API_KEY) {
        //     console.error("ERROR: GEMINI_API_KEY is missing.");
        //      return NextResponse.json({ error: 'Gemini API key is not configured' }, { status: 500 });
        // }
        // const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        // --- OPENROUTER ---
        if (!process.env.OPENROUTER_API_KEY) {
            console.error("ERROR: OPENROUTER_API_KEY is missing.");
            return NextResponse.json({ error: 'OpenRouter API key is not configured' }, { status: 500 });
        }

        const openRouter = new OpenRouter({
            apiKey: process.env.OPENROUTER_API_KEY,
        });
        
        await connectDB();
        
        const lead = await Lead.findById(id);
        
        if (!lead) {
            return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        }

        console.log(`[ANALYZE] Starting analysis for @${lead.username} (${id})`);

        const prompt = `
You are an expert sales strategist and high-conversion copywriter specializing in the **Indian market**. You know that Indian business owners are discerning, value-conscious, and relationship-driven.

Analyze the following Instagram profile and craft a strategy that "cracks" the Indian market:
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

Provide a JSON response with the following keys:
1. "category": Highly specific niche description.
2. "painPoints": Array of strings identifying technical/business gaps.
3. "coldMessage": A personalized, high-conversion DM/Email opener in **English**.
4. "hinglishMessage": The same message translated into **Hinglish** (a natural mix of Hindi and English as spoken in urban India). It should feel warm and "Desi".
5. "icebreaker": A 1-sentence opening line in English based on a specific detail from their profile to build trust.
6. "hinglishIcebreaker": The same icebreaker in **Hinglish**.
7. "coldCallOpener": A 2-sentence script for a voice call.
8. "conversationHooks": Minimum 3 personalized "Value-First" hooks.
9. "engagementAnalysis": Analysis of audience interaction.
10. "estimatedProjectValue": Realistic USD price range.
11. "projectValueINR": A realistic estimation of the project's worth in **Indian Rupees (INR)** based on Indian agency/freelancer market rates. (Integer only).
12. "opportunityCost": A "Burning House" stat for the Indian context (e.g., "Missing out on ~₹40,000 monthly due to lacked booking system").
13. "personalityVibe": An estimate of their business personality (e.g., "Professional & Direct", "Creative & High-Energy", "Trust-Oriented Local Traditional").
14. "bestTimeToCall": The best day and time window to call (e.g., "Tuesday between 11:30 AM - 1:00 PM").
15. "whatsappScript": A very short, punchy, and highly informal **Hinglish** WhatsApp message (max 15 words) that breaks the ice. Mention a specific detail from their bio.
16. "followUpStrategy": A 1-sentence instruction on when and how to follow up if they don't respond to the first message.
17. "estimatedAnnualROI": An estimation of how much additional revenue this business could generate annually with your services (in INR, e.g., "₹5,00,000+ yearly").
18. "indianStrategy": A specific "Wedge" to use for Indian clients (e.g., "Focus on how this beats their direct local competitor X" or "Emphasize zero-maintenance and long-term ROI").
19. "contentStrategy": Array of 3 specific content ideas.
20. "objectionHandlers": Array of objects {"objection", "response"}. Focus on Indian concerns like "Price is too high" or "I'll do it later".
21. "conversionChance": Number (0-100).
22. "leadScore": Number (0-100) - Overall quality score.
23. "outreachPriority": "High", "Medium", or "Low".
24. "qualityGrade": Letter grade (A, B, C, D).
25. "strategicRationale": Reasoning for grade/chance and why this specific lead is worth the local outreach effort.

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

        // --- GEMINI (commented out) ---
        // console.log(`[ANALYZE] Calling Gemini API (gemini-2.0-flash)...`);
        // const response = await ai.models.generateContent({
        //     model: 'gemini-2.0-flash',
        //     contents: prompt,
        //     config: {
        //          responseMimeType: "application/json",
        //     }
        // });
        // const jsonText = response.text;

        // --- OPENROUTER SDK WITH FALLBACK ---
        console.log(`[ANALYZE] Calling OpenRouter with fallback for @${lead.username}...`);
        const jsonText = await callAIWithFallback(prompt, openRouter);

        console.log(`[ANALYZE] Raw OpenRouter response (first 500 chars):`, jsonText?.substring(0, 500));

        if (!jsonText || jsonText.trim() === '' || jsonText.trim() === '{}') {
            console.error('[ANALYZE] OpenRouter returned empty or null response');
            return NextResponse.json({ error: 'AI returned an empty response. Please try again.' }, { status: 502 });
        }

        let analysis;
        try {
            analysis = JSON.parse(jsonText);
        } catch (parseError: any) {
            console.error('[ANALYZE] Failed to parse OpenRouter JSON:', parseError.message);
            console.error('[ANALYZE] Raw text was:', jsonText);
            return NextResponse.json({ error: 'AI returned invalid JSON. Please try again.' }, { status: 502 });
        }

        // Validate the response has actual content
        if (!analysis.category && !analysis.coldCallOpener && (!analysis.painPoints || analysis.painPoints.length === 0)) {
            console.error('[ANALYZE] Parsed JSON is missing required fields:', JSON.stringify(analysis));
            return NextResponse.json({ error: 'AI analysis was incomplete. Please try again.' }, { status: 502 });
        }

        console.log(`[ANALYZE] Successfully parsed. Category: "${analysis.category}", Pain points: ${analysis.painPoints?.length}, Hooks: ${analysis.conversationHooks?.length}`);

        lead.aiAnalysis = {
            category: analysis.category,
            painPoints: analysis.painPoints || [],
            coldMessage: analysis.coldMessage,
            hinglishMessage: analysis.hinglishMessage,
            icebreaker: analysis.icebreaker,
            hinglishIcebreaker: analysis.hinglishIcebreaker,
            coldCallOpener: analysis.coldCallOpener, // Added
            conversationHooks: analysis.conversationHooks || [], // Added
            engagementAnalysis: analysis.engagementAnalysis, // Added
            opportunityCost: analysis.opportunityCost, // Added
            personalityVibe: analysis.personalityVibe, // Added
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
        console.log(`[ANALYZE] Saved analysis for @${lead.username}`);

        return NextResponse.json(lead);
    } catch (error: any) {
        console.error('[ANALYZE] Error:', error.message || error);
        
        // Check for quota/rate limit errors
        if (error.message?.includes('429') || error.message?.includes('quota') || error.message?.includes('rate limit') || error.status === 429) {
            return NextResponse.json({ 
                error: 'OpenRouter API rate limit hit. Wait a minute and try again.' 
            }, { status: 429 });
        }
        
        return NextResponse.json({ error: error.message || 'Analysis failed' }, { status: 500 });
    }
}
