import fs from 'fs';
import path from 'path';

const files = [
    'src/App.tsx',
    'src/components/CheckResultCard.tsx',
    'src/components/ReportView.tsx'
];

for (const file of files) {
    let content = fs.readFileSync(file, 'utf-8');
    
    // First, let's undo the global replacement `border` -> `border dark:border-gray-700`
    // Basically, any instance of `border dark:border-gray-700` should be replaced back to `border`.
    // Wait, what if there was an intentional `border dark:border-gray-700`? 
    // Usually that would have a space, like `border dark:border-gray-700`. 
    // Yes, the replacement was exactly that: `border dark:border-gray-700`.
    
    // So if we replace `border dark:border-gray-700` with `border`, we restore the original state!
    content = content.replace(/border dark:border-gray-700/g, 'border');
    
    // Also `dark:border-gray-800` is nicer than 700 for some places, but let's just restore first.
    
    fs.writeFileSync(file, content, 'utf-8');
    console.log(`Fixed ${file}`);
}
