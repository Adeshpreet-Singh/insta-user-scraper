import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import Lead from '../models/Lead';
import path from 'path';
import fs from 'fs';

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env.local') });
dotenv.config({ path: path.join(__dirname, '../.env') });

/**
 * Simple CSV parser that handles quoted fields with commas inside them
 */
function parseCSVLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                current += '"';
                i++; // skip escaped quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            fields.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    fields.push(current.trim());
    return fields;
}

function parseCSV(filePath: string): Record<string, string>[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    
    if (lines.length < 2) return [];
    
    const headers = parseCSVLine(lines[0]);
    const records: Record<string, string>[] = [];

    // Handle multi-line quoted fields by joining lines until all quotes are closed
    let i = 1;
    while (i < lines.length) {
        let line = lines[i];
        // Count quotes - if odd, the field spans multiple lines
        while ((line.match(/"/g) || []).length % 2 !== 0 && i + 1 < lines.length) {
            i++;
            line += '\n' + lines[i];
        }
        
        const values = parseCSVLine(line);
        const record: Record<string, string> = {};
        headers.forEach((header, idx) => {
            record[header] = values[idx] || '';
        });
        records.push(record);
        i++;
    }

    return records;
}

async function backfill() {
    const csvPath = process.argv[2];
    if (!csvPath) {
        console.error('Usage: npx ts-node scripts/backfill_from_csv.ts <path-to-csv>');
        process.exit(1);
    }

    const fullPath = path.resolve(csvPath);
    if (!fs.existsSync(fullPath)) {
        console.error(`File not found: ${fullPath}`);
        process.exit(1);
    }

    console.log(`📄 Reading CSV: ${fullPath}`);
    const records = parseCSV(fullPath);
    console.log(`Found ${records.length} records in CSV\n`);

    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('Connected to MongoDB\n');

    let updated = 0;
    let skipped = 0;
    let notFound = 0;

    for (const record of records) {
        const username = record['Username'];
        if (!username) {
            skipped++;
            continue;
        }

        const lead = await Lead.findOne({ username });
        if (!lead) {
            console.log(`⚠️  Not found in DB: ${username}`);
            notFound++;
            continue;
        }

        // Initialize aiAnalysis if it doesn't exist
        if (!lead.aiAnalysis) {
            lead.aiAnalysis = {} as any;
        }

        let changed = false;

        // Backfill engagementAnalysis
        if (record['Engagement Analysis'] && !lead.aiAnalysis.engagementAnalysis) {
            lead.aiAnalysis.engagementAnalysis = record['Engagement Analysis'];
            changed = true;
        }

        // Backfill estimatedProjectValue
        if (record['Estimated Project Value'] && !lead.aiAnalysis.estimatedProjectValue) {
            lead.aiAnalysis.estimatedProjectValue = record['Estimated Project Value'];
            changed = true;
        }

        // Backfill contentStrategy
        if (record['Content Strategy'] && (!lead.aiAnalysis.contentStrategy || lead.aiAnalysis.contentStrategy.length === 0)) {
            lead.aiAnalysis.contentStrategy = record['Content Strategy']
                .split(' | ')
                .map(s => s.trim())
                .filter(s => s.length > 0);
            changed = true;
        }

        if (changed) {
            await lead.save();
            console.log(`✅ Updated: ${username}`);
            updated++;
        } else {
            console.log(`⏭️  Already has data: ${username}`);
            skipped++;
        }
    }

    console.log(`\n--- Summary ---`);
    console.log(`✅ Updated: ${updated}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log(`⚠️  Not found: ${notFound}`);
    console.log(`📊 Total CSV records: ${records.length}`);

    await mongoose.disconnect();
}

backfill();
