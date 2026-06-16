import './dom-polyfill.js';
import './fetch-patch.js';
import { checkWithFallback } from '../../src/services/SearchService.js';

async function run() {
    // try the title alone as well
    const query = "Attention is all you need";
    const result = await checkWithFallback(query, undefined, query);
    console.log(JSON.stringify(result, null, 2));
}

run();
