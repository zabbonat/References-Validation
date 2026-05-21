import React, { useState, useRef, useCallback, useMemo } from 'react';
import { extractReferencesFromFile, getSupportedFileType } from '../services/PdfExtractService';
import { checkWithFallback, BATCH_REQUEST_DELAY, type CheckResult } from '../services/SearchService';
import { generateBibFileContent, generateAPAFileContent, generateRISFileContent, downloadBibFile, downloadFile, copyToClipboard } from '../services/BibExportService';
import { CheckResultCard } from './CheckResultCard';
import { Upload, FileText, ArrowLeft, Search, Trash2, ChevronDown, ChevronRight, Check, Download, Copy, X, BookOpen, Filter } from 'lucide-react';

// ===== Types =====

interface PdfFile {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'pending' | 'extracting' | 'extracted' | 'error';
  referencesFound?: boolean;
  headingMatch?: string;
  references: string[];
  error?: string;
}

interface RefCheckItem {
  ref: string;
  fileId: string;
  fileName: string;
  result?: CheckResult;
  loading: boolean;
}

type ViewStep = 'upload' | 'preview' | 'checking' | 'results';
type FilterType = 'all' | 'verified' | 'partial' | 'mismatch' | 'notfound';

// ===== Component =====

interface BunchPdfViewProps {
  onBack: () => void;
  darkMode: boolean;
}

export const BunchPdfView: React.FC<BunchPdfViewProps> = ({ onBack, darkMode }) => {
  // State
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [step, setStep] = useState<ViewStep>('upload');
  const [results, setResults] = useState<RefCheckItem[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [filter, setFilter] = useState<FilterType>('all');
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [copySuccess, setCopySuccess] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);
  const dragCounter = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  
  // ===== File Management =====
  
  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const validFiles: PdfFile[] = [];
    for (const file of Array.from(newFiles)) {
      const type = getSupportedFileType(file);
      if (type) {
        validFiles.push({
          id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          name: file.name,
          size: file.size,
          status: 'pending',
          references: []
        });
      }
    }
    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);
    }
  }, []);
  
  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);
  
  // ===== Drag & Drop =====
  
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };
  
  // ===== Extraction =====
  
  const handleExtract = async () => {
    setStep('preview');
    
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      // Update status to extracting
      setFiles(prev => prev.map(p => p.id === f.id ? { ...p, status: 'extracting' } : p));
      
      const result = await extractReferencesFromFile(f.file);
      
      setFiles(prev => prev.map(p => p.id === f.id ? {
        ...p,
        status: result.error ? 'error' : 'extracted',
        referencesFound: result.referencesFound,
        headingMatch: result.headingMatch,
        references: result.references,
        error: result.error
      } : p));
      
      // Auto-expand files that have results
      if (result.references.length > 0) {
        setExpandedFiles(prev => new Set([...prev, f.id]));
      }
    }
  };
  
  // ===== Batch Check =====
  
  const totalRefs = useMemo(() => files.reduce((sum, f) => sum + f.references.length, 0), [files]);
  
  const handleCheckAll = async () => {
    cancelledRef.current = false;
    setStep('checking');
    
    // Build flat list of all references with file metadata
    const allRefs: RefCheckItem[] = [];
    for (const f of files) {
      for (const ref of f.references) {
        allRefs.push({
          ref,
          fileId: f.id,
          fileName: f.name,
          loading: true
        });
      }
    }
    
    setResults(allRefs);
    setProgress({ current: 0, total: allRefs.length });
    
    const updated = [...allRefs];
    for (let i = 0; i < allRefs.length; i++) {
      if (cancelledRef.current) {
        for (let j = i; j < allRefs.length; j++) {
          updated[j] = { ...updated[j], loading: false };
        }
        setResults([...updated]);
        setProgress({ current: i, total: allRefs.length });
        break;
      }
      
      if (i > 0) await new Promise(r => setTimeout(r, BATCH_REQUEST_DELAY));
      
      try {
        const res = await checkWithFallback(allRefs[i].ref);
        updated[i] = { ...updated[i], result: res, loading: false };
      } catch {
        updated[i] = { ...updated[i], loading: false };
      }
      
      setResults([...updated]);
      setProgress({ current: i + 1, total: allRefs.length });
    }
    
    if (!cancelledRef.current) {
      setStep('results');
    }
  };
  
  const handleCancel = () => {
    cancelledRef.current = true;
    setStep('results');
  };
  
  // ===== Stats =====
  
  const allDone = results.length > 0 && !results.some(r => r.loading);
  
  const stats = useMemo(() => {
    if (!allDone) return null;
    const withResult = results.filter(r => r.result);
    return {
      total: withResult.length,
      verified: withResult.filter(r => r.result!.exists && r.result!.matchConfidence > 80).length,
      partial: withResult.filter(r => r.result!.exists && r.result!.matchConfidence > 50 && r.result!.matchConfidence <= 80).length,
      mismatch: withResult.filter(r => r.result!.exists && r.result!.matchConfidence <= 50).length,
      notFound: withResult.filter(r => !r.result!.exists).length,
    };
  }, [allDone, results]);
  
  // Group results by file
  const groupedResults = useMemo(() => {
    const groups = new Map<string, { fileName: string; items: RefCheckItem[] }>();
    for (const r of results) {
      if (!groups.has(r.fileId)) {
        groups.set(r.fileId, { fileName: r.fileName, items: [] });
      }
      groups.get(r.fileId)!.items.push(r);
    }
    return Array.from(groups.entries());
  }, [results]);
  
  const filteredResults = useMemo(() => {
    if (filter === 'all') return groupedResults;
    return groupedResults.map(([id, group]) => {
      const filtered = group.items.filter(r => {
        if (!r.result) return true;
        switch (filter) {
          case 'verified': return r.result.exists && r.result.matchConfidence > 80;
          case 'partial': return r.result.exists && r.result.matchConfidence > 50 && r.result.matchConfidence <= 80;
          case 'mismatch': return r.result.exists && r.result.matchConfidence <= 50;
          case 'notfound': return !r.result.exists;
          default: return true;
        }
      });
      return [id, { ...group, items: filtered }] as [string, { fileName: string; items: RefCheckItem[] }];
    }).filter(([, group]) => group.items.length > 0);
  }, [groupedResults, filter]);
  
  const toggleFileExpand = (fileId: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };
  
  const progressPct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ===== Render =====
  
  return (
    <div className={`bg-slate-50 dark:bg-[#0B1120] min-h-screen flex flex-col font-sans ${darkMode ? 'dark' : ''}`}>
      {/* Header */}
      <header className="bg-white dark:bg-slate-800/80 border-b dark:border-slate-700/50 px-4 py-3 shadow-sm sticky top-0 z-10 backdrop-blur-md bg-opacity-70">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <FileText className="text-orange-500" size={20} />
            <h1 className="font-bold text-lg text-slate-800 dark:text-slate-300/90">Paper Reference Checker</h1>
            <span className="text-xs px-2 py-0.5 bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-400 rounded-full font-semibold">PDF/DOCX</span>
          </div>
          <div className="flex items-center space-x-2">
            {/* Export buttons — show when results are ready */}
            {allDone && stats && stats.total > 0 && (
              <>
                <button
                  onClick={async () => {
                    const allRes = results.map(r => r.result).filter((r): r is CheckResult => !!r);
                    const bib = generateBibFileContent(allRes);
                    const ok = await copyToClipboard(bib);
                    if (ok) { setCopySuccess(true); setTimeout(() => setCopySuccess(false), 2000); }
                  }}
                  className="px-3 py-1.5 bg-slate-600 hover:bg-slate-700 text-white dark:bg-slate-500/20 dark:text-slate-300 dark:hover:bg-slate-500/30 font-medium rounded-lg transition-colors flex items-center space-x-1.5 text-sm"
                >
                  {copySuccess ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copySuccess ? 'Copied!' : 'Copy .bib'}</span>
                </button>
                <button
                  onClick={() => {
                    const allRes = results.map(r => r.result).filter((r): r is CheckResult => !!r);
                    downloadBibFile(generateBibFileContent(allRes), 'paper_references.bib');
                  }}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20 font-medium rounded-lg transition-colors flex items-center space-x-1.5 text-sm"
                >
                  <Download size={14} />
                  <span>.bib</span>
                </button>
                <button
                  onClick={() => {
                    const allRes = results.map(r => r.result).filter((r): r is CheckResult => !!r);
                    downloadFile(generateAPAFileContent(allRes), 'paper_references_APA.txt');
                  }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 font-medium rounded-lg transition-colors flex items-center space-x-1.5 text-sm"
                >
                  <Download size={14} />
                  <span>APA</span>
                </button>
                <button
                  onClick={() => {
                    const allRes = results.map(r => r.result).filter((r): r is CheckResult => !!r);
                    downloadFile(generateRISFileContent(allRes), 'paper_references.ris');
                  }}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20 font-medium rounded-lg transition-colors flex items-center space-x-1.5 text-sm"
                  title="Download RIS (Zotero, Mendeley, EndNote)"
                >
                  <BookOpen size={14} />
                  <span>RIS</span>
                </button>
              </>
            )}
            <button
              onClick={onBack}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-300/90 font-medium rounded-lg transition-colors flex items-center space-x-1.5"
            >
              <ArrowLeft size={14} />
              <span>Back</span>
            </button>
          </div>
        </div>
      </header>
      
      <main className="flex-1 p-4 overflow-auto">
        <div className="max-w-5xl mx-auto">
          
          {/* ===== STEP 1: Upload ===== */}
          {step === 'upload' && (
            <div className="space-y-4">
              {/* Drop Zone */}
              <div
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 cursor-pointer ${
                  isDragging 
                    ? 'border-orange-400 bg-orange-50 dark:bg-orange-500/10 scale-[1.01]' 
                    : 'border-slate-300 dark:border-slate-600 hover:border-orange-400 hover:bg-orange-50/50 dark:hover:bg-orange-500/5'
                }`}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx"
                  multiple
                  className="hidden"
                  onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
                />
                <Upload size={40} className={`mx-auto mb-3 ${isDragging ? 'text-orange-500 animate-bounce' : 'text-slate-400 dark:text-slate-500'}`} />
                <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isDragging ? 'Drop your papers here! 🔥' : 'Drop PDF/DOCX papers here'}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  or click to browse • We'll extract references from the last 50 pages
                </p>
              </div>
              
              {/* File List */}
              {files.length > 0 && (
                <div className="bg-white dark:bg-slate-800/80 rounded-xl shadow-sm border p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase">
                      {files.length} file{files.length !== 1 ? 's' : ''} selected
                    </h3>
                    <button
                      onClick={() => setFiles([])}
                      className="text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="space-y-2">
                    {files.map(f => (
                      <div key={f.id} className="flex items-center justify-between py-2 px-3 bg-slate-50 dark:bg-[#0B1120] rounded-lg">
                        <div className="flex items-center space-x-3">
                          <FileText size={16} className={f.name.endsWith('.pdf') ? 'text-red-500' : 'text-blue-500'} />
                          <div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{f.name}</p>
                            <p className="text-xs text-slate-400">{formatSize(f.size)}</p>
                          </div>
                        </div>
                        <button onClick={() => removeFile(f.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  
                  <button
                    onClick={handleExtract}
                    disabled={files.length === 0}
                    className="mt-4 w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
                  >
                    <Search size={18} />
                    <span>Extract References</span>
                  </button>
                </div>
              )}
            </div>
          )}
          
          {/* ===== STEP 2: Preview ===== */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-800/80 rounded-xl shadow-sm border p-4">
                <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-3">Extracted References</h3>
                
                <div className="space-y-3">
                  {files.map(f => (
                    <div key={f.id} className="border dark:border-slate-700/50 rounded-lg overflow-hidden">
                      {/* File header */}
                      <button
                        onClick={() => toggleFileExpand(f.id)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-[#0B1120] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          {expandedFiles.has(f.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <FileText size={14} className={f.name.endsWith('.pdf') ? 'text-red-500' : 'text-blue-500'} />
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{f.name}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          {f.status === 'extracting' && (
                            <span className="text-xs text-orange-500 font-medium animate-pulse">Extracting...</span>
                          )}
                          {f.status === 'extracted' && (
                            <>
                              {f.referencesFound ? (
                                <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-emerald-500/15 text-green-700 dark:text-emerald-400 rounded-full font-semibold">
                                  ✓ {f.references.length} refs found
                                </span>
                              ) : (
                                <span className="text-xs px-2 py-0.5 bg-yellow-100 dark:bg-amber-500/15 text-yellow-700 dark:text-amber-400 rounded-full font-semibold">
                                  ⚠ No "References" heading — {f.references.length} potential refs
                                </span>
                              )}
                              {f.headingMatch && (
                                <span className="text-xs text-slate-400 italic hidden sm:inline">"{f.headingMatch}"</span>
                              )}
                            </>
                          )}
                          {f.status === 'error' && (
                            <span className="text-xs px-2 py-0.5 bg-red-100 dark:bg-rose-500/15 text-red-700 dark:text-rose-400 rounded-full font-semibold">
                              ✗ {f.error}
                            </span>
                          )}
                        </div>
                      </button>
                      
                      {/* Expanded: show references */}
                      {expandedFiles.has(f.id) && f.references.length > 0 && (
                        <div className="px-4 py-3 space-y-1.5 max-h-80 overflow-y-auto border-t dark:border-slate-700/50">
                          {f.references.map((ref, i) => (
                            <div key={i} className="flex items-start space-x-2 text-xs">
                              <span className="text-slate-400 font-mono mt-0.5 shrink-0">{i + 1}.</span>
                              <p className="text-slate-600 dark:text-slate-400 break-words leading-relaxed">{ref}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                
                {/* Summary + Check button */}
                {files.every(f => f.status !== 'extracting') && (
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        <span className="font-bold text-slate-800 dark:text-slate-300">{totalRefs}</span> references from <span className="font-bold text-slate-800 dark:text-slate-300">{files.filter(f => f.references.length > 0).length}</span> files
                      </span>
                      <button
                        onClick={() => { setStep('upload'); setFiles(prev => prev.map(f => ({ ...f, status: 'pending' as const, references: [], referencesFound: undefined }))); }}
                        className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline"
                      >
                        ← Back to upload
                      </button>
                    </div>
                    <button
                      onClick={handleCheckAll}
                      disabled={totalRefs === 0}
                      className="bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5 px-6 rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2"
                    >
                      <Search size={16} />
                      <span>Check All {totalRefs} References</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* ===== STEP 3+4: Checking / Results ===== */}
          {(step === 'checking' || step === 'results') && (
            <div className="space-y-4">
              {/* Progress bar (during checking) */}
              {step === 'checking' && (
                <div className="bg-white dark:bg-slate-800/80 rounded-xl shadow-sm border p-4">
                  <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 mb-2">
                    <span>Checking references...</span>
                    <div className="flex items-center space-x-2">
                      <span>{progress.current} / {progress.total} ({progressPct}%)</span>
                      <button
                        onClick={handleCancel}
                        className="px-2 py-0.5 bg-red-100 hover:bg-red-200 dark:bg-rose-500/15 dark:hover:bg-rose-500/25 text-red-700 dark:text-rose-400 rounded-md font-semibold transition-colors flex items-center space-x-1"
                      >
                        <X size={12} />
                        <span>Cancel</span>
                      </button>
                    </div>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2.5">
                    <div className="bg-orange-500 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
                  </div>
                </div>
              )}
              
              {/* Stats summary (when done) */}
              {allDone && stats && (
                <div className="bg-white dark:bg-slate-800/80 rounded-xl shadow-sm border p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="bg-slate-50 dark:bg-[#0B1120] rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-slate-800 dark:text-slate-300">{stats.total}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total</div>
                    </div>
                    <div className="bg-green-50 dark:bg-emerald-500/10 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-green-700 dark:text-emerald-400">{stats.verified}</div>
                      <div className="text-xs text-green-600 dark:text-emerald-400 font-medium">Verified</div>
                    </div>
                    <div className="bg-yellow-50 dark:bg-amber-500/10 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-yellow-700 dark:text-amber-400">{stats.partial}</div>
                      <div className="text-xs text-yellow-600 dark:text-amber-400 font-medium">Partial</div>
                    </div>
                    <div className="bg-orange-50 dark:bg-orange-500/10 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">{stats.mismatch}</div>
                      <div className="text-xs text-orange-600 dark:text-orange-400 font-medium">Mismatch</div>
                    </div>
                    <div className="bg-red-50 dark:bg-rose-500/10 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-red-700 dark:text-rose-400">{stats.notFound}</div>
                      <div className="text-xs text-red-600 dark:text-rose-400 font-medium">Not Found</div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Filter (when done) */}
              {allDone && (
                <div className="flex items-center space-x-2">
                  <Filter size={14} className="text-slate-400" />
                  {(['all', 'verified', 'partial', 'mismatch', 'notfound'] as FilterType[]).map(f => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
                        filter === f ? 'bg-orange-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {f === 'all' ? `All (${results.length})` :
                       f === 'verified' ? `Verified (${stats?.verified || 0})` :
                       f === 'partial' ? `Partial (${stats?.partial || 0})` :
                       f === 'mismatch' ? `Mismatch (${stats?.mismatch || 0})` :
                       `Not Found (${stats?.notFound || 0})`}
                    </button>
                  ))}
                </div>
              )}
              
              {/* Results grouped by file */}
              <div className="space-y-4">
                {filteredResults.map(([fileId, group]) => (
                  <div key={fileId} className="border dark:border-slate-700/50 rounded-xl overflow-hidden">
                    {/* File group header */}
                    <button
                      onClick={() => toggleFileExpand(fileId)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-orange-50 dark:bg-orange-500/10 hover:bg-orange-100 dark:hover:bg-orange-500/15 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        {expandedFiles.has(fileId) ? <ChevronDown size={14} className="text-orange-500" /> : <ChevronRight size={14} className="text-orange-500" />}
                        <FileText size={14} className="text-orange-500" />
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{group.fileName}</span>
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{group.items.length} references</span>
                    </button>
                    
                    {/* Expanded results */}
                    {expandedFiles.has(fileId) && (
                      <div className="p-3 space-y-3 bg-white dark:bg-slate-800/80">
                        {group.items.map((item, idx) => (
                          <CheckResultCard
                            key={`${fileId}-${idx}`}
                            reference={item.ref}
                            result={item.result}
                            loading={item.loading}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Disclaimer */}
          <div className="mt-8 text-center px-4 pb-8">
            <p className="text-xs text-slate-500 dark:text-slate-400 italic">
              *Disclaimer: Automatic reference extraction from PDF/DOCX files is experimental and might contain errors or miss citations. Always double check flagged references manually.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};
