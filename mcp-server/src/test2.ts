import { checkWithFallback } from '../../src/services/SearchService.js';
import './dom-polyfill.js';
import './fetch-patch.js';

async function run() {
    const query = "Attention is all you need";
    const result = await checkWithFallback(query, undefined, query);
    console.log(JSON.stringify(result, null, 2));
}

run();
