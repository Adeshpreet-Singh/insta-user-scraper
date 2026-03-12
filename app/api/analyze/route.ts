import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Lead from '@/models/Lead';
import { GoogleGenAI } from '@google/genai';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { id } = body;

        if (!id) {
            return NextResponse.json({ error: 'Lead ID is required' }, { status: 400 });
        }

        if (!process.env.GEMINI_API_KEY) {
            console.error("ERROR: GEMINI_API_KEY is missing.");
             return NextResponse.json({ error: 'Gemini API key is not configured' }, { status: 500 });
        }
        
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        await connectDB();
        
        const lead = await Lead.findById(id);
        
        if (!lead) {
            return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        }

        console.log(`[ANALYZE] Starting analysis for @${lead.username} (${id})`);

        const prompt = `
You are an expert sales strategist and copywriter focusing on web design services for small businesses and creators.
Analyze the following Instagram profile based on its scraped data:
Username: ${lead.username}
Full Name: ${lead.fullName || 'N/A'}
Followers: ${lead.followersCount || 'Unknown'}
Category: ${lead.businessCategoryName || 'Unknown'}
URL in Bio: ${lead.url || 'None'}
External URLs: ${lead.externalUrls && lead.externalUrls.length > 0 ? lead.externalUrls.map((u: any) => u.url).join(', ') : 'None'}
Biography: ${lead.biography || 'None'}

Your goal is to prepare a comprehensive cold call strategy for pitching a website design/optimization service to this specific Indian small business. I am the web designer making the call.

Provide a JSON response with the following strictly formatted keys:
1. "category": A concise label for their business type (e.g., "Local Bakery", "Freelance Photographer", "Online Clothing Store").
2. "painPoints": An array of exactly 3 specific, data-backed pain points. Each should be ONE sentence that cites actual evidence from their profile data (e.g., "Despite 4.2k followers and beautiful product posts, there is no website or payment link — every interested buyer must DM to buy, losing most impulse purchases."). Be very specific. Do NOT be generic.
3. "coldCallOpener": A natural, warm, 2-sentence cold call opener. Use their first name if available. Reference something SPECIFIC you noticed about their business. End with an open-ended hook — do NOT pitch or mention website yet. Sound like a human who did their homework.
4. "conversationHooks": An array of exactly 4 open-ended questions to ask during the call. These should feel like genuine curiosity that keeps the prospect talking and helps you understand their situation. Focus on: how they handle inquiries/orders, what their biggest growth challenge is, how customers currently find them outside Instagram, and what their dream flow would look like.
5. "objectionHandlers": An array of exactly 3 objects with keys "objection" and "response". Cover these three scenarios:
   a) Cost objection ("It's too expensive" / "hum afford nahi kar sakte")
   b) Need objection ("Instagram is enough for us")
   c) Timing objection ("We'll think about it" / "Later")
   Responses should be empathetic, confident, and redirect back to their specific pain.

Context: This is an Indian small business. They think in ROI. Never sell "beautiful websites" — sell "more customers, less manual work, 24/7 online presence". Keep all language direct and relatable.

Respond ONLY with valid JSON. Do not include markdown \`\`\`json wrappers.
{
  "category": "...",
  "painPoints": ["...", "...", "..."],
  "coldCallOpener": "...",
  "conversationHooks": ["...", "...", "...", "..."],
  "objectionHandlers": [
    { "objection": "...", "response": "..." },
    { "objection": "...", "response": "..." },
    { "objection": "...", "response": "..." }
  ]
}
`;

        console.log(`[ANALYZE] Calling Gemini API (gemini-2.0-flash)...`);

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
            config: {
                 responseMimeType: "application/json",
            }
        });

        const jsonText = response.text;
        console.log(`[ANALYZE] Raw Gemini response (first 500 chars):`, jsonText?.substring(0, 500));

        if (!jsonText || jsonText.trim() === '' || jsonText.trim() === '{}') {
            console.error('[ANALYZE] Gemini returned empty or null response');
            return NextResponse.json({ error: 'AI returned an empty response. Please try again.' }, { status: 502 });
        }

        let analysis;
        try {
            analysis = JSON.parse(jsonText);
        } catch (parseError: any) {
            console.error('[ANALYZE] Failed to parse Gemini JSON:', parseError.message);
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
            painPoints: analysis.painPoints,
            coldCallOpener: analysis.coldCallOpener,
            conversationHooks: analysis.conversationHooks,
            objectionHandlers: analysis.objectionHandlers,
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
                error: 'Gemini API rate limit hit. Wait a minute and try again.' 
            }, { status: 429 });
        }
        
        return NextResponse.json({ error: error.message || 'Analysis failed' }, { status: 500 });
    }
}
