import { useState, useEffect } from 'react';
import { parseBibTex } from './services/BibTexService';
import { checkWithFallback, type CheckResult } from './services/SearchService';
import { generateBibFileContent, downloadBibFile, copyBibToClipboard } from './services/BibExportService';
import { CheckResultCard } from './components/CheckResultCard';
import { Search, ClipboardList, Download, Copy, Check } from 'lucide-react';

// Electron IPC (mocked for web if not present)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ipcRenderer = (window as any).require ? (window as any).require('electron').ipcRenderer : null;

function App() {
  const [activeTab, setActiveTab] = useState<'quick' | 'batch'>('quick');

  // Quick Check State
  const [quickInput, setQuickInput] = useState('');
  const [quickResult, setQuickResult] = useState<CheckResult | null>(null);
  const [loadingQuick, setLoadingQuick] = useState(false);

  // Batch State
  const [batchInput, setBatchInput] = useState('');
  const [batchResults, setBatchResults] = useState<{ ref: string, result?: CheckResult, loading: boolean }[]>([]);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    if (ipcRenderer) {
      ipcRenderer.on('trigger-check', () => {
        // In the future: read clipboard here.
        // For now, focus the window and maybe checking clipboard manually
        navigator.clipboard.readText().then(text => {
          if (text) {
            setQuickInput(text);
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
    setLoadingQuick(true);
    setQuickResult(null);
    const result = await checkWithFallback(text);
    setQuickResult(result);
    setLoadingQuick(false);
  };

  const handleBatchCheck = async () => {
    const parsed = parseBibTex(batchInput);
    // If parsing is successful, use structured data
    if (parsed.length > 0) {
      // Initialize results
      // Initialize results

      const initialResults: { ref: string; result?: CheckResult; loading: boolean }[] = parsed.map(p => ({
        ref: p.entryTags.title || p.citationKey,
        loading: true
      }));
      setBatchResults(initialResults);

      const newResults = [...initialResults];
      for (let i = 0; i < parsed.length; i++) {
        // ADDED: Rate limiting to be polite to CrossRef
        if (i > 0) await new Promise(resolve => setTimeout(resolve, 800));

        // QUERY IMPROVEMENT: Search for "Title Author" to avoid finding wrong paper
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
      // Fallback: split by newlines
      const refs = batchInput.split('\n').filter(l => l.trim().length > 10);

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

  return (
    <div className="bg-gray-50 h-screen flex flex-col font-sans transition-colors">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between shadow-sm sticky top-0 z-10 w-full backdrop-blur-md bg-opacity-70">
        <div className="flex items-center space-x-2">
          <Search className="text-blue-600" size={20} />
          <h1 className="font-bold text-lg text-gray-800">CheckIfExist</h1>
        </div>
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('quick')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${activeTab === 'quick' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Quick Check
          </button>
          <button
            onClick={() => setActiveTab('batch')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${activeTab === 'batch' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Batch Check
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 overflow-auto">
        {activeTab === 'quick' ? (
          <div className="max-w-xl mx-auto space-y-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border">
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Reference Text</label>
              <textarea
                className="w-full h-32 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none text-sm"
                placeholder="Paste citation here..."
                value={quickInput}
                onChange={(e) => setQuickInput(e.target.value)}
              />
              <button
                onClick={() => handleQuickCheck(quickInput)}
                disabled={loadingQuick || !quickInput}
                className="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {loadingQuick ? <span>Verifying...</span> : <><span>Verify</span><Search size={16} /></>}
              </button>
            </div>

            {(quickResult || loadingQuick) && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                <CheckResultCard reference={quickInput} result={quickResult || undefined} loading={loadingQuick} />
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-4 h-full flex flex-col">
            <div className="bg-white p-4 rounded-xl shadow-sm border flex flex-col flex-1 min-h-[50%]">
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">
                Paste Multiple References (BibTeX or One per Line)
              </label>
              <textarea
                className="w-full flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none resize-y font-mono text-sm min-h-[300px]"
                placeholder={`Example 1 (BibTeX):
@article{key, title={...}, author={...}}

Example 2 (List):
Paper Title 1. Author Name. 2024.
Paper Title 2. Author Name. 2023.`}
                value={batchInput}
                onChange={(e) => setBatchInput(e.target.value)}
              />
              <button
                onClick={handleBatchCheck}
                disabled={batchResults.some(r => r.loading) && batchResults.length > 0}
                className="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                <ClipboardList size={16} />
                <span>Batch Verify</span>
              </button>

              {/* Download/Copy .bib buttons - show when results are ready */}
              {batchResults.length > 0 && !batchResults.some(r => r.loading) && (
                <div className="mt-3 flex space-x-2">
                  <button
                    onClick={() => {
                      const results = batchResults.map(r => r.result).filter((r): r is CheckResult => !!r);
                      const bibContent = generateBibFileContent(results);
                      downloadBibFile(bibContent, 'corrected_references.bib');
                    }}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center space-x-2"
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
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center space-x-2"
                  >
                    {copySuccess ? <Check size={16} /> : <Copy size={16} />}
                    <span>{copySuccess ? 'Copied!' : 'Copy .bib'}</span>
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2 pb-10">
              {batchResults.map((item, i) => (
                <CheckResultCard key={i} reference={item.ref} result={item.result} loading={item.loading} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
