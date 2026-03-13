import { OpenRouter } from '@openrouter/sdk';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function test() {
    const openRouter = new OpenRouter({
        apiKey: process.env.OPENROUTER_API_KEY,
    });

    try {
        console.log("Fetching all models...");
        const modelsResult = await openRouter.models.list();
        const freeModels = modelsResult.data.filter(m => m.id.endsWith(':free'));
        console.log("FREE_MODELS_LIST_START");
        freeModels.forEach(m => console.log(m.id));
        console.log("FREE_MODELS_LIST_END");
    } catch (error) {
        console.error("Error:", error);
    }
}

test();
