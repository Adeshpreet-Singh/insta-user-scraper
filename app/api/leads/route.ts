import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Lead from '@/models/Lead';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const forceSeed = searchParams.get('forceSeed');
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '50');
        const search = searchParams.get('search') || '';
        const category = searchParams.get('category') || 'All';
        const range = searchParams.get('range') || 'All';
        const status = searchParams.get('status') || 'All';
        const sortKey = searchParams.get('sortKey') || 'followersCount';
        const sortDir = searchParams.get('sortDir') || 'desc';


        await connectDB();

        if (forceSeed === 'true') {
            console.log('Force seeding requested. Clearing collection...');
            await Lead.deleteMany({});
            // Note: Seeding from JSON is disabled as local data has been purged.
        }


        // Build filtering query
        const query: any = {};
        if (search) {
            query.$or = [
                { username: { $regex: search, $options: 'i' } },
                { fullName: { $regex: search, $options: 'i' } },
                { biography: { $regex: search, $options: 'i' } }
            ];
        }
        if (category !== 'All') query.businessCategoryName = category;
        if (status !== 'All') {
            if (status === 'new') {
                // Match leads explicitly marked 'new' OR leads that predate the status field
                query.$or = [...(query.$or || []), { status: 'new' }, { status: { $exists: false } }, { status: null }];
            } else {
                query.status = status;
            }
        }


        if (range !== 'All') {
            if (range === '0-1k') query.followersCount = { $lt: 1000 };
            else if (range === '1k-10k') query.followersCount = { $gte: 1000, $lt: 10000 };
            else if (range === '10k-100k') query.followersCount = { $gte: 10000, $lt: 100000 };
            else if (range === '100k+') query.followersCount = { $gte: 100000 };
        }

        const skip = (page - 1) * limit;
        const total = await Lead.countDocuments(query);
        const leads = await Lead.find(query)
            .sort({ [sortKey]: sortDir === 'asc' ? 1 : -1 })
            .skip(skip)
            .limit(limit);

        return NextResponse.json({
            leads,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            hasMore: skip + leads.length < total
        });
    } catch (error: any) {
        console.error('API GET Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { id, contacted, status, privateNotes } = body;

        console.log(`[API POST] Updating lead ${id}: status=${status}, contacted=${contacted}`);

        if (!id) {
            return NextResponse.json({ error: 'Lead ID is required' }, { status: 400 });
        }

        await connectDB();

        const update: any = {};
        if (contacted !== undefined) update.contacted = contacted;
        if (status !== undefined) update.status = status;
        if (privateNotes !== undefined) update.privateNotes = privateNotes;

        console.log('[API POST] update data:', update);

        const updatedLead = await Lead.findByIdAndUpdate(
            id,
            { $set: update },
            { new: true, runValidators: true }
        );

        if (!updatedLead) {
            console.error(`[API POST] Lead ${id} not found`);
            return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        }

        console.log(`[API POST] SUCCESS: Lead ${id} updated to status: ${updatedLead.status}`);
        return NextResponse.json(updatedLead);
    } catch (error: any) {
        console.error('[API POST] Error updating lead:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const idsString = searchParams.get('id');

        if (!idsString) {
            return NextResponse.json({ error: 'Lead ID(s) required' }, { status: 400 });
        }

        const ids = idsString.split(',').filter(id => id.trim().length > 0);

        if (ids.length === 0) {
            return NextResponse.json({ error: 'Valid Lead ID(s) required' }, { status: 400 });
        }

        await connectDB();
        console.log(`Attempting to delete ${ids.length} leads:`, ids);

        const result = await Lead.deleteMany({ _id: { $in: ids } });

        console.log(`${result.deletedCount} leads deleted successfully`);
        return NextResponse.json({
            message: 'Leads deleted successfully',
            deletedCount: result.deletedCount
        });
    } catch (error: any) {
        console.error('DELETE Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
