import { checkReference } from './src/services/SearchService';

async function test() {
    const rawQuery = "Generative Adversarial Nets Goodfellow, Ian and Pouget-Abadie, Jean and Mirza, Mehdi and Xu, Bing and Warde-Farley, David and Ozair, Sherjil and Courville, Aaron and Bengio, Yoshua";
    const expected = {
        title: "Generative Adversarial Nets",
        authors: "Goodfellow, Ian and Pouget-Abadie, Jean and Mirza, Mehdi and Xu, Bing and Warde-Farley, David and Ozair, Sherjil and Courville, Aaron and Bengio, Yoshua",
        journal: "Nature",
        year: "2016"
    };
    
    console.log("Checking CrossRef directly...");
    const crossRefResult = await checkReference(rawQuery, expected, rawQuery);
    console.log(JSON.stringify(crossRefResult, null, 2));
}

test().catch(console.error);
