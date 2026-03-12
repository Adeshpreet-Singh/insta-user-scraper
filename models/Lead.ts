import mongoose, { Schema, Document } from 'mongoose';

export interface ILead extends Document {
    username: string;
    fullName?: string;
    followersCount?: number;
    followsCount?: number;
    postsCount?: number;
    biography?: string;
    url: string;
    profilePicUrl?: string;
    businessCategoryName?: string;
    verified?: boolean;
    contacted?: boolean;
    status: 'new' | 'for design reference' | 'can contact' | 'contacted';

    externalUrl?: string;
    externalUrls?: { title?: string; url: string }[];
    aiAnalysis?: {
        category?: string;
        painPoints?: string[];
        coldCallOpener?: string;
        conversationHooks?: string[];
        objectionHandlers?: { objection: string; response: string }[];
        analyzedAt?: Date;
    };
    updatedAt: Date;
}

const LeadSchema: Schema = new Schema({
    username: { type: String, required: true, unique: true },
    fullName: { type: String },
    followersCount: { type: Number },
    followsCount: { type: Number },
    postsCount: { type: Number },
    biography: { type: String },
    url: { type: String, required: true },
    profilePicUrl: { type: String },
    businessCategoryName: { type: String },
    verified: { type: Boolean, default: false },
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
        coldCallOpener: { type: String },
        conversationHooks: [{ type: String }],
        objectionHandlers: [{
            objection: { type: String },
            response: { type: String }
        }],
        analyzedAt: { type: Date }
    }
}, { timestamps: true });

// Force re-registration during dev hot reloads so schema changes (like adding 'status') take effect
if (mongoose.models.Lead) {
    delete mongoose.models.Lead;
}
export default mongoose.model<ILead>('Lead', LeadSchema);

