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
1. "category": Highly specific business category.
2. "niche": Micro-niche identification (e.g., "Premium Vegan Skincare for Gen-Z in Bangalore").
3. "painPoints": Array of strings identifying technical/business gaps.
4. "marketContext": Brief 1-2 sentence overview of their specific market position in India.
5. "growthOpportunity": The #1 biggest growth lever they are missing.
6. "perceivedValue": How premium or value-driven their brand is perceived (e.g., "High-end luxury", "Mass-market budget").
7. "riskFactors": Potential pitfalls or challenges in working with them.
8. "competitorEdge": What gives them an advantage over others?
9. "coldMessage": A personalized, high-conversion DM/Email opener in **English**.
10. "hinglishMessage": The same message translated into **Hinglish**.
11. "icebreaker": A 1-sentence opening line in English.
12. "hinglishIcebreaker": The same icebreaker in **Hinglish**.
13. "coldCallOpener": A 2-sentence script for a voice call.
14. "conversationHooks": Minimum 3 "Value-First" hooks.
15. "engagementAnalysis": Analysis of audience interaction.
16. "estimatedProjectValue": Realistic USD price range.
17. "projectValueINR": Estimated project worth in INR (Integer only).
18. "opportunityCost": A "Burning House" stat for the Indian context.
19. "personalityVibe": Their business personality.
20. "bestTimeToCall": Best day and time window for India.
21. "whatsappScript": Short, punchy Hinglish message.
22. "followUpStrategy": 1-sentence instruction.
23. "estimatedAnnualROI": Estimated revenue they are missing out on (in INR).
24. "indianStrategy": A specific "Wedge".
25. "instagramStrategy": Long-term Instagram growth/monetization strategy.
26. "contentStrategy": Array of 3 specific content ideas.
27. "engagementPlan": Specifically how to interact with their followers to generate leads.
28. "estimatedDealValue": How much this deal could be worth to YOUR agency/business.
29. "objectionHandlers": Array of objects {"objection", "response"}.
30. "conversionChance": Number (0-100).
31. "leadScore": Number (0-100).
32. "outreachPriority": "High", "Medium", or "Low".
33. "qualityGrade": Letter grade (A, B, C, D).
34. "strategicRationale": Reasoning for the grade and outreach fit.

Respond ONLY with valid JSON.
{
  "category": "...",
  "niche": "...",
  "painPoints": ["...", "..."],
  "marketContext": "...",
  "growthOpportunity": "...",
  "perceivedValue": "...",
  "riskFactors": "...",
  "competitorEdge": "...",
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
  "instagramStrategy": "...",
  "contentStrategy": ["...", "..."],
  "engagementPlan": "...",
  "estimatedDealValue": "...",
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
            niche: analysis.niche,
            painPoints: analysis.painPoints || [],
            marketContext: analysis.marketContext,
            growthOpportunity: analysis.growthOpportunity,
            perceivedValue: analysis.perceivedValue,
            riskFactors: analysis.riskFactors,
            competitorEdge: analysis.competitorEdge,
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
            instagramStrategy: analysis.instagramStrategy,
            contentStrategy: analysis.contentStrategy || [],
            engagementPlan: analysis.engagementPlan,
            estimatedDealValue: analysis.estimatedDealValue,
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
