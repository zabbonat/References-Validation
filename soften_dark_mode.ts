import fs from 'fs';

const files = [
    'src/App.tsx',
    'src/components/CheckResultCard.tsx',
    'src/components/ReportView.tsx'
];

for (const file of files) {
    let content = fs.readFileSync(file, 'utf-8');
    
    // Soften the base dark mode backgrounds
    content = content.replace(/dark:bg-slate-950/g, 'dark:bg-[#0B1120]'); // Very dark slate/blue (Tailwind docs style)
    content = content.replace(/dark:bg-slate-900/g, 'dark:bg-slate-800/80'); // Translucent card background
    content = content.replace(/dark:border-slate-800/g, 'dark:border-slate-700/50'); // Softer borders
    
    // Alerts and Badges - Use standard 500-level colors with low opacity for modern look
    // Emerald (Green)
    content = content.replace(/dark:bg-emerald-900\/20/g, 'dark:bg-emerald-500/10');
    content = content.replace(/dark:bg-emerald-900\/10/g, 'dark:bg-emerald-500/5');
    content = content.replace(/dark:border-emerald-800\/50/g, 'dark:border-emerald-500/20');
    content = content.replace(/dark:border-emerald-800\/30/g, 'dark:border-emerald-500/10');
    content = content.replace(/dark:text-emerald-500/g, 'dark:text-emerald-400');
    
    // Rose (Red)
    content = content.replace(/dark:bg-rose-900\/30/g, 'dark:bg-rose-500/15');
    content = content.replace(/dark:bg-rose-900\/20/g, 'dark:bg-rose-500/10');
    content = content.replace(/dark:bg-rose-900\/10/g, 'dark:bg-rose-500/5');
    content = content.replace(/dark:border-rose-800\/50/g, 'dark:border-rose-500/20');
    content = content.replace(/dark:border-rose-800\/30/g, 'dark:border-rose-500/10');
    content = content.replace(/dark:text-rose-500/g, 'dark:text-rose-400');
    
    // Amber (Yellow)
    content = content.replace(/dark:bg-amber-900\/20/g, 'dark:bg-amber-500/10');
    content = content.replace(/dark:border-amber-800\/50/g, 'dark:border-amber-500/20');
    content = content.replace(/dark:border-amber-800\/30/g, 'dark:border-amber-500/10');
    content = content.replace(/dark:text-amber-500/g, 'dark:text-amber-400');
    
    // Blue
    content = content.replace(/dark:bg-blue-900\/20/g, 'dark:bg-blue-500/10');

    // Make text slightly softer
    content = content.replace(/dark:text-slate-300/g, 'dark:text-slate-300/90');
    
    // Soften primary buttons in dark mode if they use standard bg-blue-600
    // Actually, primary buttons can just use a slightly less saturated blue or hover effect
    
    fs.writeFileSync(file, content, 'utf-8');
    console.log(`Softened dark mode in ${file}`);
}
