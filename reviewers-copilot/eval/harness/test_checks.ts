// Offline checks of CitationChecks.ts on known cases. No network.
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const svc = (f: string) => pathToFileURL(path.resolve(here, '..', '..', '..', 'src', 'services', f)).href;
const C = await import(svc('CitationChecks.ts'));
const { foldText } = await import(svc('TextNormalize.ts'));

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) fails++;
    process.stdout.write(`${ok ? 'ok  ' : 'FAIL'} ${name}\n${ok ? '' : `     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}\n`}`);
};

// normalization
eq('ligature resolved', foldText('classiﬁcation'), 'classification');
eq('accent dropped', foldText('Marcińczuk'), 'marcinczuk');
eq('non-Latin kept', foldText('Διάδοση'), 'διαδοση');

// title surplus
eq('XGBoost extended title',
    C.titleSurplus('Chen, T., & Guestrin, C. (2024). XGBoost: A scalable tree boosting system for high-frequency financial trading. Journal of Finance, 79(3), 1455-1489.',
        'XGBoost: A Scalable Tree Boosting System'),
    ['high', 'frequency', 'financial', 'trading']);
eq('Adam extended title',
    C.titleSurplus('Kingma, D. P., & Ba, J. (2024). Adam: A method for stochastic optimization in dark energy simulations. Monthly Notices of the Royal Astronomical Society, 528(2), 1890-1902.',
        'Adam: A Method for Stochastic Optimization'),
    ['dark', 'energy', 'simulations']);
eq('genuine XGBoost',
    C.titleSurplus('Chen, T., & Guestrin, C. (2016). XGBoost: A scalable tree boosting system. In Proceedings of the 22nd ACM SIGKDD.',
        'XGBoost: A Scalable Tree Boosting System'), []);
eq('lost full stop before venue',
    C.titleSurplus('Vaswani, A. et al. Attention is all you need In Advances in Neural Information Processing Systems 30, 2017',
        'Attention Is All You Need'), []);
eq('thesis note in parentheses',
    C.titleSurplus('Smith, J. (2019). Learning sparse representations of graphs (Doctoral dissertation). MIT.',
        'Learning sparse representations of graphs'), []);
eq('comma style',
    C.titleSurplus('A. Smith, Learning sparse representations of graphs, Machine Learning 12 (2019) 1-20.',
        'Learning sparse representations of graphs'), []);

// authors
const llamaRecord = ['Hugo Touvron', 'Thibaut Lavril', 'Gautier Izacard', 'Xavier Martinet', 'Marie-Anne Lachaux',
    'Timothée Lacroix', 'Baptiste Rozière', 'Naman Goyal', 'Eric Hambro', 'Faisal Azhar', 'Aurelien Rodriguez',
    'Armand Joulin', 'Edouard Grave', 'Guillaume Lample'];
const fakeLlama = 'Hugo Touvron, Thibaut Martin, Kevin Stone, Marie-Anne Lachaux, Timothée Albert, et al. Llama: Open and efficient foundation language models. arXiv preprint arXiv:2302.13971, 2023';
const seg = C.segmentBeforeTitle(fakeLlama, 'LLaMA: Open and Efficient Foundation Language Models');
eq('Llama author segment found', typeof seg === 'string' && seg.includes('Albert'), true);
eq('Llama fabricated co-authors', C.foreignAuthorNames(seg, llamaRecord), ['martin', 'kevin', 'stone', 'albert']);
eq('genuine Llama', C.foreignAuthorNames('Hugo Touvron, Thibaut Lavril, Gautier Izacard, Xavier Martinet, et al. ', llamaRecord), []);
eq('given names against initials', C.foreignAuthorNames('Kaiming He, Xiangyu Zhang, Shaoqing Ren, and Jian Sun. ', ['K. He', 'X. Zhang', 'S. Ren', 'J. Sun']), []);
eq('APA family names', C.foreignAuthorNames('Chen, T., & Guestrin, C. (2016). ', ['Tianqi Chen', 'Carlos Guestrin']), []);
eq('author swap', C.foreignAuthorNames('Goodfellow, I., Bengio, Y., & Courville, A. (2016). ', ['Tianqi Chen', 'Carlos Guestrin']), ['goodfellow', 'bengio', 'courville']);

eq('cited count, APA', C.citedAuthorCount('Krizhevsky, A., Sutskever, I., & Hinton, G. E. (2012). '), 3);
eq('cited count, given-family with et al.', C.citedAuthorCount('Hugo Touvron, Thibaut Martin, Kevin Stone, Marie-Anne Lachaux, Timothée Albert, et al. '), 5);
eq('cited count, and', C.citedAuthorCount('Jacob Devlin, Kevin Patterson, Laura Brennan, and Kristina Toutanova. '), 4);
const inc = C.authorAgreement('Krizhevsky, A., Sutskever, I., & Hinton, G. E. (2012). ', ['Krizhevsky']);
eq('incomplete record: one match, two missing', [inc.matched, inc.foreign.length, inc.citedCount], [1, 2, 3]);

// names as PDF extraction and the sources write them
const U2010 = String.fromCharCode(0x2010), FFFD = String.fromCharCode(0xfffd);
eq('detached diaeresis', foldText('R¨ost'), 'rost');
eq('detached caron and acute', foldText('Neˇsi´c'), 'nesic');
eq('detached accent in author list', C.foreignAuthorNames('Istvan Z. Kiss, Gergely R¨ost, and Zsolt Vizi. ', ['Istvan Z. Kiss', 'Gergely Röst', 'Zsolt Vizi']), []);
eq('compound surname with U+2010 in the record', C.foreignAuthorNames('Cortes-Ciriano, I.; Bender, A. ', [`Isidro Cortés${U2010}Ciriano`, 'Andreas Bender']), []);
eq('given names before compound surnames', C.foreignAuthorNames('David Freire-Obregón, Modesto Castrillón-Santana, Enrique Ramón- Balmaseda, and Javier Lorenzo-Navarro. ',
    ['D. Freire-Obregon', 'M. Castrillon-Santana', 'E. Ramon-Balmaseda', 'J. Lorenzo-Navarro']), []);
eq('record letters lost to encoding', C.foreignAuthorNames('J. Komlós, P. Major, and G. Tusnády. ', [`J. Koml${FFFD}s`, 'P. Major', `G. Tusn${FFFD}dy`]), []);
eq('damaged record still rejects another name', C.foreignAuthorNames('J. Komlós, P. Major, and G. Smith. ', [`J. Koml${FFFD}s`, 'P. Major', `G. Tusn${FFFD}dy`]), ['smith']);
eq('compound names swapped in', C.foreignAuthorNames('Jean-Paul Sartre and Simone Beauvoir. ', [`Isidro Cortés${U2010}Ciriano`, 'Andreas Bender']),
    ['jean', 'paul', 'sartre', 'simone', 'beauvoir']);
eq('metadata match with compound first author',
    C.metadataAgreement('Cortes-Ciriano, I.; Bender, A. J. Chem. Inf. Model. 2019, 59, 3330–3339.',
        { author: [{ family: `Cortés${U2010}Ciriano` }], volume: '59', page: '3330-3339', issued: { 'date-parts': [[2019]] }, title: ['Reliable prediction errors'] }),
    true);

// years
eq('arXiv id is not a year', C.citedYears('arXiv:2006.12345, 2020'), [2020]);
eq('year gap', C.yearGap('(2024). XGBoost', 2016), 8);

// title text
eq('physics style has no title', C.hasTitleText('L. M. Pecora and T. L. Carroll, Phys. Rev. Lett. 64, 821 (1990).'), false);
eq('astronomy style has no title', C.hasTitleText('Abbott, D. C. 1982, ApJ, 259, 282'), false);
eq('title case title found', C.hasTitleText('Pecora, L. M. Quantum Gravity In Dark Matter Halos. Phys. Rev. Lett. 64, 821 (1990).'), true);
eq('lowercase title found', C.hasTitleText('Pecora, L. M., & Carroll, T. L. (1990). Synchronization in chaotic systems. Phys. Rev. Lett., 64, 821.'), true);

// entry type
eq('astronomy block', C.classifyEntry('Abbott, D. C. 1982, ApJ, 259, 282 Alkousa, T., Crowther, P. A., et al. 2025, A&A, 699, A314 Anderson, L. S. 1985, ApJ, 298, 848'), 'merged_entries');
eq('formula', C.classifyEntry('If D ∪Φ |= q and D ∪Φ |= q′ then D ∪Φ |= q ∧q′.'), 'not_a_reference');
eq('genuine reference', C.classifyEntry('Chen, T., & Guestrin, C. (2016). XGBoost: A scalable tree boosting system. KDD.'), null);

process.stdout.write(fails ? `\n${fails} FAILED\n` : '\nall passed\n');
