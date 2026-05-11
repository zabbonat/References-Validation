import fs from 'fs';

const files = [
    'src/App.tsx',
    'src/components/CheckResultCard.tsx',
    'src/components/ReportView.tsx'
];

for (const file of files) {
    let content = fs.readFileSync(file, 'utf-8');
    
    // Convert all "gray" to "slate"
    content = content.replace(/bg-gray-/g, 'bg-slate-');
    content = content.replace(/text-gray-/g, 'text-slate-');
    content = content.replace(/border-gray-/g, 'border-slate-');
    content = content.replace(/ring-gray-/g, 'ring-slate-');
    
    // Refine dark mode specific slate colors for higher contrast and better aesthetics
    content = content.replace(/dark:bg-slate-900/g, 'dark:bg-slate-950');
    content = content.replace(/dark:bg-slate-800/g, 'dark:bg-slate-900');
    content = content.replace(/dark:border-slate-700/g, 'dark:border-slate-800');
    content = content.replace(/dark:text-slate-200/g, 'dark:text-slate-300');
    content = content.replace(/dark:text-white/g, 'dark:text-slate-50');
    
    // Give cards a subtle border and shadow in dark mode
    // We can add "dark:shadow-none" or "dark:ring-1 dark:ring-white/10"
    content = content.replace(/shadow-sm border dark:border-slate-800/g, 'shadow-sm border border-slate-200 dark:border-slate-800/60 dark:shadow-none');
    
    fs.writeFileSync(file, content, 'utf-8');
    console.log(`Enhanced dark mode in ${file}`);
}
