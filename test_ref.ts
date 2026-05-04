import { checkWithFallback } from './src/services/SearchService';

async function test() {
    const searchQuery = "ImageNet Classification with Deep Convolutional Neural Networks Krizhevsky, Alex and Sutskever, Ilya and Hinton, Geoffrey E.";
    const expected = {
        title: "ImageNet Classification with Deep Convolutional Neural Networks",
        authors: "Krizhevsky, Alex and Sutskever, Ilya and Hinton, Geoffrey E.",
        journal: "Advances in Neural Information Processing Systems",
        year: "2012"
    };
    const res = await checkWithFallback(searchQuery, expected);
    console.log(JSON.stringify(res, null, 2));
}

test();
