import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Lead from '@/models/Lead';
import { OpenRouter } from '@openrouter/sdk';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min timeout for long scrapes

/**
 * Free models to try (same list used by analyze route)
 */
const FREE_MODELS = [
    'openrouter/hunter-alpha',
];

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

async function callAIWithFallback(prompt: string, openRouter: OpenRouter): Promise<string> {
    for (const model of FREE_MODELS) {
        try {
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
                return cleanJSON(fullText);
            }
        } catch (error: any) {
            console.warn(`[SCRAPE-AI] Model ${model} failed:`, error.message || error);
        }
    }
    throw new Error('All AI models failed');
}

function buildAnalysisPrompt(lead: any): string {
    return `
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

Target their specific pain points and offer immediate value. Use a friendly but professional tone.

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
}

/**
 * POST /api/scrape
 * Body: { usernames: string[] }
 * Returns SSE stream with progress updates per username
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        let { usernames } = body;

        if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
            return NextResponse.json({ error: 'Provide an array of usernames' }, { status: 400 });
        }

        // Clean & deduplicate
        usernames = [...new Set(
            usernames
                .map((u: string) => u.trim().replace(/^@/, '').toLowerCase())
                .filter((u: string) => u.length > 0)
        )];

        if (usernames.length === 0) {
            return NextResponse.json({ error: 'No valid usernames provided' }, { status: 400 });
        }

        const apifyToken = process.env.APIFY_TOKEN;
        const openRouterKey = process.env.OPENROUTER_API_KEY;

        if (!apifyToken) {
            return NextResponse.json({ error: 'APIFY_TOKEN is not configured' }, { status: 500 });
        }
        if (!openRouterKey) {
            return NextResponse.json({ error: 'OPENROUTER_API_KEY is not configured' }, { status: 500 });
        }

        await connectDB();

        const openRouter = new OpenRouter({ apiKey: openRouterKey });

        // SSE stream
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                const send = (data: any) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                };

                try {
                    // Step 1: Call Apify to scrape all usernames at once
                    send({ type: 'status', message: `Scraping ${usernames.length} profile(s) via Apify...`, phase: 'scraping' });

                    const apifyRes = await fetch(
                        `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${apifyToken}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ usernames }),
                        }
                    );

                    if (!apifyRes.ok) {
                        const errText = await apifyRes.text();
                        send({ type: 'error', message: `Apify scraping failed: ${apifyRes.status} ${errText}` });
                        controller.close();
                        return;
                    }

                    const scrapedProfiles = await apifyRes.json();
                    send({ type: 'status', message: `Scraped ${scrapedProfiles.length} profile(s). Saving & analyzing...`, phase: 'analyzing' });

                    // Step 2: Save each and run AI analysis
                    let completed = 0;
                    for (const profile of scrapedProfiles) {
                        const username = profile.username || 'unknown';
                        send({ type: 'progress', username, status: 'saving', completed, total: scrapedProfiles.length });

                        try {
                            // Upsert into MongoDB
                            const lead = await Lead.findOneAndUpdate(
                                { username: profile.username },
                                {
                                    ...profile,
                                    updatedAt: new Date(),
                                },
                                { upsert: true, new: true, setDefaultsOnInsert: true }
                            );

                            // Run AI analysis
                            send({ type: 'progress', username, status: 'analyzing', completed, total: scrapedProfiles.length });

                            try {
                                const prompt = buildAnalysisPrompt(lead);
                                const jsonText = await callAIWithFallback(prompt, openRouter);
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
                                    analyzedAt: new Date(),
                                };

                                await lead.save();
                                send({ type: 'progress', username, status: 'done', completed: ++completed, total: scrapedProfiles.length });
                            } catch (aiErr: any) {
                                console.error(`[SCRAPE] AI analysis failed for ${username}:`, aiErr.message);
                                send({ type: 'progress', username, status: 'analysis_failed', error: aiErr.message, completed: ++completed, total: scrapedProfiles.length });
                            }
                        } catch (dbErr: any) {
                            console.error(`[SCRAPE] DB error for ${username}:`, dbErr.message);
                            send({ type: 'progress', username, status: 'error', error: dbErr.message, completed: ++completed, total: scrapedProfiles.length });
                        }
                    }

                    send({ type: 'complete', message: `Finished processing ${scrapedProfiles.length} profile(s)`, completed, total: scrapedProfiles.length });
                } catch (err: any) {
                    console.error('[SCRAPE] Fatal error:', err);
                    send({ type: 'error', message: err.message || 'Unknown error' });
                } finally {
                    controller.close();
                }
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            }
        });
    } catch (error: any) {
        console.error('[SCRAPE] Top-level error:', error);
        return NextResponse.json({ error: error.message || 'Failed to scrape' }, { status: 500 });
    }
}
