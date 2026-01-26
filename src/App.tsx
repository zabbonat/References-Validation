import { useState, useEffect } from 'react';
import { parseBibTex } from './services/BibTexService';
import { checkWithFallback, type CheckResult } from './services/SearchService';
import { generateBibFileContent, downloadBibFile, copyBibToClipboard } from './services/BibExportService';
import { CheckResultCard } from './components/CheckResultCard';
import { Search, ClipboardList, Download, Copy, Check, Users } from 'lucide-react';

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

function App() {
  // Unified input
  const [input, setInput] = useState('');

  // Quick Check State
  const [quickResult, setQuickResult] = useState<CheckResult | null>(null);
  const [loadingQuick, setLoadingQuick] = useState(false);

  // Batch State
  const [batchResults, setBatchResults] = useState<{ ref: string, result?: CheckResult, loading: boolean }[]>([]);
  const [showBatchView, setShowBatchView] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Visitor counter
  const [visitorCount, setVisitorCount] = useState<number | null>(null);

  // Fetch and increment visitor counter
  useEffect(() => {
    const fetchVisitorCount = async () => {
      try {
        // Using CountAPI - free visitor counter service
        const response = await fetch('https://api.countapi.xyz/hit/checkifexist.zabbonat.github.io/visits');
        const data = await response.json();
        setVisitorCount(data.value);
      } catch (error) {
        console.error('Failed to fetch visitor count:', error);
      }
    };
    fetchVisitorCount();
  }, []);

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

  const handleBatchCheck = async () => {
    if (!input) return;
    const cleanedInput = cleanLatexInput(input);
    if (!cleanedInput) return;

    setQuickResult(null);
    setShowBatchView(true);

    const parsed = parseBibTex(cleanedInput);

    if (parsed.length > 0) {
      const initialResults: { ref: string; result?: CheckResult; loading: boolean }[] = parsed.map(p => ({
        ref: p.entryTags.title || p.citationKey,
        loading: true
      }));
      setBatchResults(initialResults);

      const newResults = [...initialResults];
      for (let i = 0; i < parsed.length; i++) {
        if (i > 0) await new Promise(resolve => setTimeout(resolve, 800));

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
      }
    } else {
      // Fallback: split by newlines (already cleaned)
      const refs = cleanedInput.split('\n').filter(l => l.trim().length > 10);

      const initialResults: { ref: string; result?: CheckResult; loading: boolean }[] = refs.map(r => ({ ref: r, loading: true }));
      setBatchResults(initialResults);

      const newResults = [...initialResults];
      for (let i = 0; i < refs.length; i++) {
        if (i > 0) await new Promise(resolve => setTimeout(resolve, 800));
        const res = await checkWithFallback(refs[i]);
        newResults[i] = { ...newResults[i], result: res, loading: false };
        setBatchResults([...newResults]);
      }
    }
  };

  const allBatchDone = batchResults.length > 0 && !batchResults.some(r => r.loading);

  // Check if we should show batch view (dedicated page)
  if (showBatchView) {
    return (
      <div className="bg-gray-50 min-h-screen flex flex-col font-sans">
        <header className="bg-white border-b px-4 py-3 flex items-center justify-between shadow-sm sticky top-0 z-10 w-full backdrop-blur-md bg-opacity-70">
          <div className="flex items-center space-x-2">
            <ClipboardList className="text-blue-600" size={20} />
            <h1 className="font-bold text-lg text-gray-800">Batch Check Results</h1>
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
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center space-x-2"
                >
                  <Download size={16} />
                  <span>Download .bib</span>
                </button>
                <button
                  onClick={async () => {
                    const results = batchResults.map(r => r.result).filter((r): r is CheckResult => !!r);
                    const bibContent = generateBibFileContent(results);
                    const success = await copyBibToClipboard(bibContent);
                    if (success) {
                      setCopySuccess(true);
                      setTimeout(() => setCopySuccess(false), 2000);
                    }
                  }}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors flex items-center space-x-2"
                >
                  {copySuccess ? <Check size={16} /> : <Copy size={16} />}
                  <span>{copySuccess ? 'Copied!' : 'Copy .bib'}</span>
                </button>
              </>
            )}
            <button
              onClick={() => {
                setShowBatchView(false);
                setBatchResults([]);
              }}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg transition-colors"
            >
              ← Back
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 overflow-auto">
          <div className="max-w-3xl mx-auto space-y-3">
            {batchResults.map((item, i) => (
              <CheckResultCard key={i} reference={item.ref} result={item.result} loading={item.loading} />
            ))}
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
Smith, J. (2024). Title of article. Journal Name.`}
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
                onClick={handleBatchCheck}
                disabled={!input || batchResults.some(r => r.loading)}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                <ClipboardList size={18} />
                <span>Batch Check</span>
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

      {/* Visitor Counter - bottom left */}
      {visitorCount !== null && (
        <div className="fixed bottom-4 left-4 bg-white/80 backdrop-blur-sm px-3 py-2 rounded-lg shadow-sm border text-xs text-gray-500 flex items-center space-x-2">
          <Users size={14} />
          <span>{visitorCount.toLocaleString()} visits</span>
        </div>
      )}
    </div>
  );
}

export default App;
