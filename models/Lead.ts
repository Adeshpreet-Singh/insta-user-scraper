import mongoose, { Schema, Document } from 'mongoose';

export interface ILead extends Document {
    username: string;
    fullName?: string;
    followersCount?: number;
    followsCount?: number;
    postsCount?: number;
    biography?: string;
    biographyEmail?: string;
    biographyPhone?: string;
    url: string;
    profilePicUrl?: string;
    businessCategoryName?: string;
    verified?: boolean;
    isVerified?: boolean;
    contacted?: boolean;
    status: 'new' | 'for design reference' | 'can contact' | 'contacted';

    externalUrl?: string;
    externalUrls?: { title?: string; url: string }[];
    aiAnalysis?: {
        category?: string;
        painPoints?: string[];
        coldMessage?: string;
        hinglishMessage?: string;
        icebreaker?: string;
        hinglishIcebreaker?: string;
        coldCallOpener?: string; // Added
        whatsappScript?: string;
        followUpStrategy?: string;
        estimatedAnnualROI? : string;
        bestTimeToCall?: string;
        indianStrategy?: string;
        projectValueINR?: number;
        estimatedProjectValue?: string;
        engagementAnalysis?: string;
        conversationHooks?: string[];
        opportunityCost?: string;
        personalityVibe?: string;
        contentStrategy?: string[];
        objectionHandlers?: { objection: string; response: string }[];
        conversionChance?: number;
        leadScore?: number;
        outreachPriority?: string;
        qualityGrade?: string;
        niche?: string;
        marketContext?: string;
        growthOpportunity?: string;
        perceivedValue?: string;
        riskFactors?: string;
        competitorEdge?: string;
        instagramStrategy?: string;
        contentIdeas?: string[];
        engagementPlan?: string;
        estimatedDealValue?: string;
        strategicRationale?: string;
        analyzedAt?: Date;
    };
    privateNotes?: string;
    updatedAt: Date;
}

const LeadSchema: Schema = new Schema({
    username: { type: String, required: true, unique: true },
    fullName: { type: String },
    followersCount: { type: Number },
    followsCount: { type: Number },
    postsCount: { type: Number },
    biography: { type: String },
    biographyEmail: { type: String },
    biographyPhone: { type: String },
    url: { type: String, required: true },
    profilePicUrl: { type: String },
    businessCategoryName: { type: String },
    verified: { type: Boolean, default: false },
    isVerified: { type: Boolean },
    contacted: { type: Boolean, default: false },
    status: {
        type: String,
        enum: ['new', 'for design reference', 'can contact', 'contacted'],
        default: 'new'
    },

    externalUrl: { type: String },

    externalUrls: [
        {
            title: { type: String },
            url: { type: String },
        },
    ],
    aiAnalysis: {
        category: { type: String },
        painPoints: [{ type: String }],
        coldMessage: { type: String },
        hinglishMessage: { type: String },
        icebreaker: { type: String },
        hinglishIcebreaker: { type: String },
        coldCallOpener: { type: String },
        conversationHooks: [{ type: String }],
        engagementAnalysis: { type: String },
        estimatedProjectValue: { type: String },
        projectValueINR: { type: Number },
        opportunityCost: { type: String },
        personalityVibe: { type: String },
        bestTimeToCall: { type: String },
        whatsappScript: { type: String },
        followUpStrategy: { type: String },
        estimatedAnnualROI: { type: String },
        indianStrategy: { type: String },
        contentStrategy: [{ type: String }],
        objectionHandlers: [{
            objection: { type: String },
            response: { type: String }
        }],
        conversionChance: { type: Number },
        leadScore: { type: Number },
        outreachPriority: { type: String },
        qualityGrade: { type: String },
        niche: { type: String },
        marketContext: { type: String },
        growthOpportunity: { type: String },
        perceivedValue: { type: String },
        riskFactors: [{ type: String }],
        competitorEdge: { type: String },
        instagramStrategy: { type: String },
        contentIdeas: [{ type: String }],
        engagementPlan: { type: String },
        estimatedDealValue: { type: String },
        strategicRationale: { type: String },
        analyzedAt: { type: Date }
    },
    privateNotes: { type: String }
}, { timestamps: true });

// Force re-registration during dev hot reloads so schema changes (like adding 'status') take effect
if (mongoose.models.Lead) {
    delete mongoose.models.Lead;
}
export default mongoose.model<ILead>('Lead', LeadSchema);

