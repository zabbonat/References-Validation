import fs from 'fs';

const files = [
    'src/App.tsx',
    'src/components/CheckResultCard.tsx',
    'src/components/ReportView.tsx'
];

for (const file of files) {
    let content = fs.readFileSync(file, 'utf-8');
    
    // Backgrounds
    content = content.replace(/bg-green-50\/50(?! dark:)/g, 'bg-green-50/50 dark:bg-emerald-900/10');
    content = content.replace(/bg-red-50\/50(?! dark:)/g, 'bg-red-50/50 dark:bg-rose-900/10');
    content = content.replace(/bg-red-50\/30(?! dark:)/g, 'bg-red-50/30 dark:bg-rose-900/10');
    
    content = content.replace(/bg-green-50(?! dark:|\/)/g, 'bg-green-50 dark:bg-emerald-900/20');
    content = content.replace(/bg-red-50(?! dark:|\/)/g, 'bg-red-50 dark:bg-rose-900/20');
    content = content.replace(/bg-yellow-50(?! dark:|\/)/g, 'bg-yellow-50 dark:bg-amber-900/20');
    content = content.replace(/bg-blue-50(?! dark:|\/)/g, 'bg-blue-50 dark:bg-blue-900/20');
    content = content.replace(/bg-red-100(?! dark:|\/)/g, 'bg-red-100 dark:bg-rose-900/30');
    content = content.replace(/bg-red-50 (?!dark:)/g, 'bg-red-50 dark:bg-rose-900/20 ');
    content = content.replace(/bg-yellow-50 (?!dark:)/g, 'bg-yellow-50 dark:bg-amber-900/20 ');

    // Borders
    content = content.replace(/border-green-200(?! dark:)/g, 'border-green-200 dark:border-emerald-800/50');
    content = content.replace(/border-red-200(?! dark:)/g, 'border-red-200 dark:border-rose-800/50');
    content = content.replace(/border-yellow-200(?! dark:)/g, 'border-yellow-200 dark:border-amber-800/50');
    
    content = content.replace(/border-green-100(?! dark:)/g, 'border-green-100 dark:border-emerald-800/30');
    content = content.replace(/border-red-100(?! dark:)/g, 'border-red-100 dark:border-rose-800/30');
    content = content.replace(/border-yellow-100(?! dark:)/g, 'border-yellow-100 dark:border-amber-800/30');

    // Text colors (if they exist without dark variant)
    content = content.replace(/text-green-800(?! dark:)/g, 'text-green-800 dark:text-emerald-400');
    content = content.replace(/text-red-800(?! dark:)/g, 'text-red-800 dark:text-rose-400');
    content = content.replace(/text-yellow-800(?! dark:)/g, 'text-yellow-800 dark:text-amber-400');
    content = content.replace(/text-blue-800(?! dark:)/g, 'text-blue-800 dark:text-blue-400');
    
    content = content.replace(/text-green-600(?! dark:)/g, 'text-green-600 dark:text-emerald-500');
    content = content.replace(/text-red-600(?! dark:)/g, 'text-red-600 dark:text-rose-500');
    content = content.replace(/text-yellow-600(?! dark:)/g, 'text-yellow-600 dark:text-amber-500');

    fs.writeFileSync(file, content, 'utf-8');
    console.log(`Enhanced semantic dark mode colors in ${file}`);
}
