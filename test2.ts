import { checkWithFallback } from './src/services/SearchService.ts';

const test2 = "ImageNet Classification with Deep Convolutional Neural Networks. Krizhevsky, Alex and Sutskever, Ilya and Hinton, Geoffrey E.. Advances in Neural Information Processing Systems. (2012)";

async function runTests() {
    console.log("=== TEST 2 ===");
    const r2 = await checkWithFallback(test2);
    console.log(JSON.stringify(r2, null, 2));
}

runTests();
