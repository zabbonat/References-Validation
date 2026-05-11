import fs from 'fs';

const files = [
    'src/App.tsx',
    'src/components/CheckResultCard.tsx',
    'src/components/ReportView.tsx'
];

const darkClasses = new Set<string>();

for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const matches = content.match(/dark:[a-zA-Z0-9-./]+/g);
    if (matches) {
        matches.forEach(m => darkClasses.add(m));
    }
}

console.log(Array.from(darkClasses).sort().join('\n'));
