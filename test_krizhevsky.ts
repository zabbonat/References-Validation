import { checkReference } from './src/services/SearchService';

async function test() {
    const rawQuery = "ImageNet Classification with Deep Convolutional Neural Networks. Krizhevsky, Alex and Sutskever, Ilya and Hinton, Geoffrey E.. Advances in Neural Information Processing Systems. (2012)";
    const expected = {
        title: "ImageNet Classification with Deep Convolutional Neural Networks",
        authors: "Krizhevsky, Alex and Sutskever, Ilya and Hinton, Geoffrey E.",
        journal: "Advances in Neural Information Processing Systems",
        year: "2012"
    };
    
    console.log("Checking CrossRef directly...");
    const crossRefResult = await checkReference(rawQuery, expected, rawQuery);
    console.log(JSON.stringify(crossRefResult, null, 2));
}

test().catch(console.error);
