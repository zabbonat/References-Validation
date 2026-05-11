import fs from 'fs';

const files = [
    'src/App.tsx',
    'src/components/CheckResultCard.tsx',
    'src/components/ReportView.tsx'
];

for (const file of files) {
    let content = fs.readFileSync(file, 'utf-8');
    
    // 1. "Search on Google Scholar" buttons
    // Currently: "bg-blue-600 hover:bg-blue-700 text-white"
    content = content.replace(/bg-blue-600 hover:bg-blue-700 text-white/g, 'bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20');
    content = content.replace(/bg-indigo-600 hover:bg-indigo-700 text-white/g, 'bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20');

    // 2. "Copy APA" and "Copy BibTeX" buttons inside CheckResultCard (which might be just `bg-slate-100 hover:bg-slate-200`)
    // Let's add dark mode backgrounds to them
    content = content.replace(/bg-slate-100 hover:bg-slate-200 text-slate-700(?! dark:)/g, 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300');
    // Also other buttons:
    content = content.replace(/bg-white hover:bg-slate-50 text-slate-700 border border-slate-300(?! dark:)/g, 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-700');
    content = content.replace(/bg-white hover:bg-red-50 text-red-600 border border-red-200(?! dark:)/g, 'bg-white hover:bg-red-50 text-red-600 border border-red-200 dark:bg-slate-800 dark:hover:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900/30');

    // 3. Status pills in App.tsx: e.g. "bg-emerald-100 text-emerald-800"
    content = content.replace(/bg-emerald-100 text-emerald-800(?! dark:)/g, 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400');
    content = content.replace(/bg-yellow-100 text-yellow-800(?! dark:)/g, 'bg-yellow-100 text-yellow-800 dark:bg-amber-500/10 dark:text-amber-400');
    content = content.replace(/bg-red-100 text-red-800(?! dark:)/g, 'bg-red-100 text-red-800 dark:bg-rose-500/10 dark:text-rose-400');
    content = content.replace(/bg-slate-100 text-slate-800(?! dark:)/g, 'bg-slate-100 text-slate-800 dark:bg-slate-500/10 dark:text-slate-400');

    // 4. Source pills (SemanticScholar, CrossRef) in CheckResultCard: "bg-slate-100 text-slate-600"
    content = content.replace(/bg-slate-100 text-slate-600(?! dark:)/g, 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300');
    content = content.replace(/bg-slate-100 dark:bg-slate-700/g, 'bg-slate-100 dark:bg-slate-800/80'); // Adjust generic badge backgrounds

    // 5. Mismatch issues red text: "text-red-700" / "text-orange-600"
    content = content.replace(/text-red-700(?! dark:)/g, 'text-red-700 dark:text-rose-400');
    content = content.replace(/text-orange-600(?! dark:)/g, 'text-orange-600 dark:text-amber-400');
    content = content.replace(/text-red-600(?! dark:)/g, 'text-red-600 dark:text-rose-400');
    
    // Check specific UI elements from the subagent feedback
    // "Report", "Download .bib", "Download APA" buttons in App.tsx:
    content = content.replace(/bg-purple-600 hover:bg-purple-700 text-white/g, 'bg-purple-600 hover:bg-purple-700 text-white dark:bg-purple-500/10 dark:text-purple-400 dark:hover:bg-purple-500/20');
    content = content.replace(/bg-emerald-600 hover:bg-emerald-700 text-white/g, 'bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20');
    
    // Clear session button
    content = content.replace(/text-slate-500 hover:text-red-600 hover:bg-red-50/g, 'text-slate-500 hover:text-red-600 hover:bg-red-50 dark:text-slate-400 dark:hover:text-rose-400 dark:hover:bg-rose-500/10');

    // The dark border red 400 around retracted items
    content = content.replace(/border-red-400 border-2(?! dark:)/g, 'border-red-400 border-2 dark:border-rose-500/30');

    fs.writeFileSync(file, content, 'utf-8');
    console.log(`Refined dark mode UI elements in ${file}`);
}
