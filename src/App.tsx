import { useState, useEffect, useMemo } from 'react';
import { parseBibTex } from './services/BibTexService';
import { parsePlainTextRefs, detectDuplicates } from './services/PlainTextParser';
import { checkWithFallback, BATCH_REQUEST_DELAY, type CheckResult } from './services/SearchService';
import { generateBibFileContent, generateAPAFileContent, downloadFile, downloadBibFile, copyToClipboard } from './services/BibExportService';
import { CheckResultCard } from './components/CheckResultCard';
import { Search, ClipboardList, Download, Copy, Check, Quote, Lightbulb, Filter } from 'lucide-react';

const QUICK_CHECK_EXAMPLE = `Silver, D., Huang, A., Maddison, C. J., Guez, A., Sifre, L., Van Den Driessche, G., ... & Hassabis, D. (2016). Mastering the game of Go with deep neural networks and tree search. Nature, 529(7587), 484-489.`;

const BATCH_CHECK_EXAMPLE = `@article{lecun2015deep,
  title={Deep Learning},
  author={LeCun, Yann and Bengio, Yoshua and Hinton, Geoffrey},
  journal={Nature},
  year={2015}
}

% NOTE: This entry is intentionally wrong (wrong year and journal) to demonstrate error detection
@article{goodfellow2014generative,
  title={Generative Adversarial Nets},
  author={Goodfellow, Ian and Pouget-Abadie, Jean and Mirza, Mehdi and Xu, Bing and Warde-Farley, David and Ozair, Sherjil and Courville, Aaron and Bengio, Yoshua},
  journal={Nature},
  year={2016}
}

@article{krizhevsky2012imagenet,
  title={ImageNet Classification with Deep Convolutional Neural Networks},
  author={Krizhevsky, Alex and Sutskever, Ilya and Hinton, Geoffrey E.},
  journal={Advances in Neural Information Processing Systems},
  year={2012}
}

@article{he2016deep,
  title={Deep Residual Learning for Image Recognition},
  author={He, Kaiming and Zhang, Xiangyu and Ren, Shaoqing and Sun, Jian},
  journal={Proceedings of the IEEE Conference on Computer Vision and Pattern Recognition},
  year={2016}
}`;

// Electron IPC (mocked for web if not present)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ipcRenderer = (window as any).require ? (window as any).require('electron').ipcRenderer : null;

/**
 * Clean LaTeX commands from input text
 * Removes lines containing common LaTeX formatting commands that users might accidentally paste
 */
const cleanLatexInput = (text: string): string => {
  // Common LaTeX commands to filter out (lines containing these will be removed)
  const latexCommands = [
    '\\vspace', '\\hspace', '\\newpage', '\\pagebreak', '\\clearpage',
    '\\noindent', '\\indent', '\\bigskip', '\\medskip', '\\smallskip',
    '\\vfill', '\\hfill', '\\linebreak', '\\newline', '\\par',
    '\\begin{', '\\end{', '\\setlength', '\\addtolength',
    '\\documentclass', '\\usepackage', '\\input', '\\include'
  ];

  return text
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      // Skip empty lines
      if (!trimmed) return false;
      // Skip lines that are just LaTeX commands
      return !latexCommands.some(cmd => trimmed.startsWith(cmd));
    })
    .join('\n');
};

type FilterType = 'all' | 'verified' | 'partial' | 'notfound' | 'issues';

interface BatchItem {
  ref: string;
  result?: CheckResult;
  loading: boolean;
  duplicateOf?: number;
}

function App() {
  // Unified input
  const [input, setInput] = useState('');

  // Quick Check State
  const [quickResult, setQuickResult] = useState<CheckResult | null>(null);
  const [loadingQuick, setLoadingQuick] = useState(false);

  // Batch State
  const [batchResults, setBatchResults] = useState<BatchItem[]>([]);
  const [showBatchView, setShowBatchView] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    if (ipcRenderer) {
      ipcRenderer.on('trigger-check', () => {
        navigator.clipboard.readText().then(text => {
          if (text) {
            setInput(text);
            handleQuickCheck(text);
          }
        });
      });
    }
    return () => {
      if (ipcRenderer) {
        ipcRenderer.removeAllListeners('trigger-check');
      }
    }
  }, []);

  const handleQuickCheck = async (text: string) => {
    if (!text) return;
    const cleanedText = cleanLatexInput(text);
    if (!cleanedText) return;

    setShowBatchView(false);
    setBatchResults([]);
    setLoadingQuick(true);
    setQuickResult(null);
    const result = await checkWithFallback(cleanedText);
    setQuickResult(result);
    setLoadingQuick(false);
  };

  const handleBatchCheck = async (text?: string) => {
    const source = text || input;
    if (!source) return;
    const cleanedInput = cleanLatexInput(source);
    if (!cleanedInput) return;

    setQuickResult(null);
    setShowBatchView(true);
    setFilter('all');

    const parsed = parseBibTex(cleanedInput);

    if (parsed.length > 0) {
      // BibTeX input
      const initialResults: BatchItem[] = parsed.map(p => {
        const title = p.entryTags.title || p.citationKey;
        const author = p.entryTags.author ? ` ${p.entryTags.author}.` : '';
        const journal = p.entryTags.journal ? ` ${p.entryTags.journal}.` : '';
        const year = p.entryTags.year ? ` (${p.entryTags.year})` : '';

        return {
          ref: `${title}.${author}${journal}${year}`,
          loading: true
        };
      });
      setBatchResults(initialResults);
      setBatchProgress({ current: 0, total: parsed.length });

      const newResults = [...initialResults];
      for (let i = 0; i < parsed.length; i++) {
        if (i > 0) await new Promise(resolve => setTimeout(resolve, BATCH_REQUEST_DELAY));

        const p = parsed[i];
        const searchQuery = `${p.entryTags.title} ${p.entryTags.author || ""}`;

        const res = await checkWithFallback(searchQuery, {
          title: p.entryTags.title,
          authors: p.entryTags.author,
          journal: p.entryTags.journal,
          year: p.entryTags.year
        });

        newResults[i] = { ...newResults[i], result: res, loading: false };
        setBatchResults([...newResults]);
        setBatchProgress({ current: i + 1, total: parsed.length });
      }
    } else {
      // Plain-text input — use smart parser
      const plainRefs = parsePlainTextRefs(cleanedInput);
      
      // Detect duplicates
      const duplicateMap = detectDuplicates(plainRefs);
      // Build a reverse map: duplicateIdx -> originalIdx+1 (for display)
      const duplicateOfMap = new Map<number, number>();
      for (const [origIdx, dupIndices] of duplicateMap.entries()) {
        for (const dupIdx of dupIndices) {
          duplicateOfMap.set(dupIdx, (plainRefs[origIdx].refNumber || origIdx + 1));
        }
      }

      const initialResults: BatchItem[] = plainRefs.map((r, i) => ({
        ref: r.raw,
        loading: true,
        duplicateOf: duplicateOfMap.get(i)
      }));
      setBatchResults(initialResults);
      setBatchProgress({ current: 0, total: plainRefs.length });

      const newResults = [...initialResults];
      for (let i = 0; i < plainRefs.length; i++) {
        if (i > 0) await new Promise(resolve => setTimeout(resolve, BATCH_REQUEST_DELAY));
        
        const pRef = plainRefs[i];
        
        // Use parsed metadata if available, otherwise fall back to raw text
        const hasStructured = pRef.title && pRef.title.length > 5;
        
        let res: CheckResult;
        if (hasStructured) {
          const searchQuery = `${pRef.title} ${pRef.authors || ''}`;
          res = await checkWithFallback(searchQuery, {
            title: pRef.title,
            authors: pRef.authors,
            journal: pRef.journal,
            year: pRef.year
          }, pRef.raw);
        } else {
          res = await checkWithFallback(pRef.raw);
        }

        newResults[i] = { ...newResults[i], result: res, loading: false };
        setBatchResults([...newResults]);
        setBatchProgress({ current: i + 1, total: plainRefs.length });
      }
    }
  };

  const allBatchDone = batchResults.length > 0 && !batchResults.some(r => r.loading);
  
  // Compute summary stats
  const stats = useMemo(() => {
    if (!allBatchDone) return null;
    const results = batchResults.filter(r => r.result);
    const verified = results.filter(r => r.result!.exists && r.result!.matchConfidence > 80).length;
    const partial = results.filter(r => r.result!.exists && r.result!.matchConfidence <= 80).length;
    const notFound = results.filter(r => !r.result!.exists).length;
    const withIssues = results.filter(r => r.result!.issues.length > 0).length;
    const retracted = results.filter(r => r.result!.retracted).length;
    return { verified, partial, notFound, withIssues, retracted, total: results.length };
  }, [allBatchDone, batchResults]);

  // Filter batch results
  const filteredBatchResults = useMemo(() => {
    if (filter === 'all') return batchResults;
    return batchResults.filter(r => {
      if (!r.result) return true; // show loading items
      switch (filter) {
        case 'verified': return r.result.exists && r.result.matchConfidence > 80;
        case 'partial': return r.result.exists && r.result.matchConfidence <= 80;
        case 'notfound': return !r.result.exists;
        case 'issues': return r.result.issues.length > 0;
        default: return true;
      }
    });
  }, [batchResults, filter]);

  // Check if we should show batch view (dedicated page)
  if (showBatchView) {
    const progressPct = batchProgress.total > 0 ? Math.round((batchProgress.current / batchProgress.total) * 100) : 0;

    return (
      <div className="bg-gray-50 min-h-screen flex flex-col font-sans">
        <header className="bg-white border-b px-4 py-3 shadow-sm sticky top-0 z-10 w-full backdrop-blur-md bg-opacity-70">
          {/* Top row: title + buttons */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-3">
              <ClipboardList className="text-blue-600" size={20} />
              <h1 className="font-bold text-lg text-gray-800">Batch Check Results</h1>
              {allBatchDone && (
                <button
                  onClick={async () => {
                    const results = batchResults.map(r => r.result).filter((r): r is CheckResult => !!r);
                    const bibContent = generateBibFileContent(results);
                    const success = await copyToClipboard(bibContent);
                    if (success) {
                      setCopySuccess(true);
                      setTimeout(() => setCopySuccess(false), 2000);
                    }
                  }}
                  className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors flex items-center space-x-1.5 text-sm"
                >
                  {copySuccess ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copySuccess ? 'Copied!' : 'Copy .bib'}</span>
                </button>
              )}
            </div>
            <div className="flex items-center space-x-2">
              {allBatchDone && (
                <>
                  <button
                    onClick={() => {
                      const results = batchResults.map(r => r.result).filter((r): r is CheckResult => !!r);
                      const bibContent = generateBibFileContent(results);
                      downloadBibFile(bibContent, 'corrected_references.bib');
                    }}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center space-x-1.5 text-sm"
                  >
                    <Download size={14} />
                    <span>Download .bib</span>
                  </button>
                  <button
                    onClick={() => {
                      const results = batchResults.map(r => r.result).filter((r): r is CheckResult => !!r);
                      const apaContent = generateAPAFileContent(results);
                      downloadFile(apaContent, 'corrected_references_APA.txt');
                    }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center space-x-1.5 text-sm"
                  >
                    <Download size={14} />
                    <span>Download APA</span>
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  setShowBatchView(false);
                  setBatchResults([]);
                  setBatchProgress({ current: 0, total: 0 });
                }}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg transition-colors"
              >
                ← Back
              </button>
            </div>
          </div>

          {/* Progress bar */}
          {!allBatchDone && batchProgress.total > 0 && (
            <div className="mb-2">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Checking references...</span>
                <span>{batchProgress.current} / {batchProgress.total} ({progressPct}%)</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Summary stats (shown when done) */}
          {allBatchDone && stats && (
            <div className="flex items-center space-x-4 text-xs mb-2">
              <span className="flex items-center space-x-1 px-2.5 py-1 bg-green-100 text-green-700 rounded-full font-semibold">
                <span>✓ {stats.verified} Verified</span>
              </span>
              {stats.partial > 0 && (
                <span className="flex items-center space-x-1 px-2.5 py-1 bg-yellow-100 text-yellow-700 rounded-full font-semibold">
                  <span>⚠ {stats.partial} Partial</span>
                </span>
              )}
              {stats.notFound > 0 && (
                <span className="flex items-center space-x-1 px-2.5 py-1 bg-red-100 text-red-700 rounded-full font-semibold">
                  <span>✗ {stats.notFound} Not Found</span>
                </span>
              )}
              {stats.withIssues > 0 && (
                <span className="flex items-center space-x-1 px-2.5 py-1 bg-orange-100 text-orange-700 rounded-full font-semibold">
                  <span>! {stats.withIssues} With Issues</span>
                </span>
              )}
              {stats.retracted > 0 && (
                <span className="flex items-center space-x-1 px-2.5 py-1 bg-red-200 text-red-800 rounded-full font-bold">
                  <span>⚠ {stats.retracted} Retracted</span>
                </span>
              )}
              <span className="text-gray-400">Total: {stats.total}</span>
            </div>
          )}

          {/* Filter bar (shown when done) */}
          {allBatchDone && (
            <div className="flex items-center space-x-2">
              <Filter size={14} className="text-gray-400" />
              {(['all', 'verified', 'partial', 'notfound', 'issues'] as FilterType[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
                    filter === f 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {f === 'all' ? `All (${batchResults.length})` :
                   f === 'verified' ? `Verified (${stats?.verified || 0})` :
                   f === 'partial' ? `Partial (${stats?.partial || 0})` :
                   f === 'notfound' ? `Not Found (${stats?.notFound || 0})` :
                   `Issues (${stats?.withIssues || 0})`}
                </button>
              ))}
            </div>
          )}
        </header>

        <main className="flex-1 p-4 overflow-auto">
          <div className="max-w-5xl mx-auto space-y-3">
            {filteredBatchResults.map((item, i) => (
              <CheckResultCard 
                key={i} 
                reference={item.ref} 
                result={item.result} 
                loading={item.loading}
                duplicateOf={item.duplicateOf}
              />
            ))}
            {filteredBatchResults.length === 0 && allBatchDone && (
              <div className="text-center text-gray-400 py-12">
                No results match the selected filter.
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // Main unified view
  return (
    <div className="bg-gray-50 min-h-screen flex flex-col font-sans">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-center shadow-sm sticky top-0 z-10 w-full backdrop-blur-md bg-opacity-70">
        <div className="flex items-center space-x-2">
          <Search className="text-blue-600" size={20} />
          <h1 className="font-bold text-lg text-gray-800">CheckIfExist</h1>
        </div>
      </header>

      <main className="flex-1 p-4 overflow-auto">
        <div className="max-w-2xl mx-auto space-y-4">
          {/* Unified Input Card */}
          <div className="bg-white p-5 rounded-xl shadow-sm border">
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">
              Paste Reference(s)
            </label>
            <textarea
              className="w-full h-64 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none text-sm font-mono"
              placeholder={`Single reference for Quick Check, or multiple BibTeX entries for Batch Check...

Example BibTeX:
@article{key, title={...}, author={...}, year={2024}}

Or APA/plain text:
Smith, J. (2024). Title of article. Journal Name.

Or Chinese-style:
[1]Author. Title[J]. Journal, 2024, 10(2): 123-456.`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />

            {/* Two buttons side by side */}
            <div className="mt-4 flex space-x-3">
              <button
                onClick={() => handleQuickCheck(input)}
                disabled={loadingQuick || !input}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                <Search size={18} />
                <span>{loadingQuick ? 'Verifying...' : 'Quick Check'}</span>
              </button>
              <button
                onClick={() => handleBatchCheck()}
                disabled={!input || batchResults.some(r => r.loading)}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                <ClipboardList size={18} />
                <span>Batch Check</span>
              </button>
            </div>

            {/* Try an Example links */}
            <div className="mt-3 flex justify-center space-x-6">
              <button
                onClick={() => {
                  setInput(QUICK_CHECK_EXAMPLE);
                  handleQuickCheck(QUICK_CHECK_EXAMPLE);
                }}
                disabled={loadingQuick}
                className="text-xs text-blue-500 hover:text-blue-700 transition-colors flex items-center space-x-1 disabled:opacity-50"
              >
                <Lightbulb size={12} />
                <span>Try Quick Check example</span>
              </button>
              <button
                onClick={() => {
                  setInput(BATCH_CHECK_EXAMPLE);
                  handleBatchCheck(BATCH_CHECK_EXAMPLE);
                }}
                disabled={batchResults.some(r => r.loading)}
                className="text-xs text-purple-500 hover:text-purple-700 transition-colors flex items-center space-x-1 disabled:opacity-50"
              >
                <Lightbulb size={12} />
                <span>Try Batch Check example</span>
              </button>
            </div>
          </div>

          {/* Quick Check Result - stays on same page */}
          {(quickResult || loadingQuick) && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <CheckResultCard reference={input} result={quickResult || undefined} loading={loadingQuick} />
            </div>
          )}
        </div>
      </main>

      {/* Visitor Counter & Cite - bottom left */}
      <div className="fixed bottom-4 left-4 flex items-center space-x-2">
        <img
          src="https://visitor-badge.laobi.icu/badge?page_id=zabbonat.checkifexist"
          alt="Visitors"
          className="h-6"
        />
        <a
          href="https://scholar.google.com/citations?view_op=view_citation&hl=en&user=no8pRaUAAAAJ&citation_for_view=no8pRaUAAAAJ:kNdYIx-mwKoC"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center space-x-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-full transition-colors shadow-sm"
        >
          <Quote size={12} />
          <span>Cite</span>
        </a>
      </div>
      {/* License Footer - bottom right */}
      <div className="fixed bottom-4 right-4 text-xs text-gray-400">
        <a
          href="https://github.com/zabbonat/References-Validation/blob/main/LICENSE"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-600 transition-colors"
        >
          MIT License © 2026 Diletta Abbonato
        </a>
      </div>
    </div>
  );
}

export default App;
