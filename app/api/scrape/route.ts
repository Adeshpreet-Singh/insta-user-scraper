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
    'openrouter/healer-alpha',
    'meta-llama/llama-3.3-70b-instruct:free',
    'google/gemma-3-27b-it:free',
    'mistralai/mistral-small-3.1-24b-instruct:free',
    'google/gemma-3-12b-it:free',
    'meta-llama/llama-3.2-3b-instruct:free',
    'stepfun/step-3.5-flash:free',
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
- Category: ${lead.businessCategoryName || 'Unknown'}
- URL in Bio: ${lead.url || 'None'}
- External URLs: ${lead.externalUrls ? lead.externalUrls.map((u: any) => u.url).join(', ') : 'None'}
- Biography: ${lead.biography || 'None'}

Target their specific pain points and offer immediate value. Use a friendly but professional tone.

Provide a JSON response with the following strictly formatted keys:
1. "category": A highly specific description of their niche.
2. "painPoints": A detailed array of strings identifying technical and business optimization needs.
3. "coldMessage": A personalized, high-conversion DM/Email opener in **English**.
4. "hinglishMessage": The same message translated into **Hinglish** (warm and "Desi").
5. "icebreaker": A 1-sentence opening line in English to build trust.
6. "hinglishIcebreaker": The same icebreaker in **Hinglish**.
7. "whatsappScript": A very short, punchy **Hinglish** WhatsApp message (max 15 words) that breaks the ice.
8. "followUpStrategy": A 1-sentence instruction on when and how to follow up.
9. "estimatedAnnualROI": Estimation of additional revenue annually (in INR, e.g., "₹5,00,000+ yearly").
10. "engagementAnalysis": A brief analysis of their current audience interaction.
11. "estimatedProjectValue": A realistic USD price range for services.
12. "projectValueINR": Estimated project worth in **INR** (Integer only).
13. "bestTimeToCall": Best day and time window to call (e.g., "Tuesday 11:30 AM").
14. "indianStrategy": A specific "Wedge" to use for Indian clients.
15. "contentStrategy": An array of 3 specific content ideas.
16. "objectionHandlers": Array of objects {"objection", "response"}. Focus on Indian concerns.
17. "conversionChance": Number (0-100).
18. "qualityGrade": Letter grade (A-D).
19. "strategicRationale": Reasoning for grade/chance.

Respond ONLY with valid JSON.
{
  "category": "...",
  "painPoints": ["...", "..."],
  "coldMessage": "...",
  "hinglishMessage": "...",
  "icebreaker": "...",
  "hinglishIcebreaker": "...",
  "whatsappScript": "...",
  "followUpStrategy": "...",
  "estimatedAnnualROI": "...",
  "engagementAnalysis": "...",
  "estimatedProjectValue": "...",
  "projectValueINR": 50000,
  "bestTimeToCall": "...",
  "indianStrategy": "...",
  "contentStrategy": ["...", "..."],
  "objectionHandlers": [{"objection": "...", "response": "..."}],
  "conversionChance": 85,
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
                                    whatsappScript: analysis.whatsappScript,
                                    followUpStrategy: analysis.followUpStrategy,
                                    estimatedAnnualROI: analysis.estimatedAnnualROI,
                                    engagementAnalysis: analysis.engagementAnalysis,
                                    estimatedProjectValue: analysis.estimatedProjectValue,
                                    projectValueINR: analysis.projectValueINR,
                                    bestTimeToCall: analysis.bestTimeToCall,
                                    indianStrategy: analysis.indianStrategy,
                                    contentStrategy: analysis.contentStrategy || [],
                                    objectionHandlers: analysis.objectionHandlers || [],
                                    conversionChance: analysis.conversionChance,
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
