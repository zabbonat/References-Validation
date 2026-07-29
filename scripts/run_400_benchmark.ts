import fs from 'fs';
import path from 'path';
import { checkWithFallback } from '../src/services/SearchService.ts';

async function run() {
    const jsonPath = 'c:/Users/Dilet/Desktop/Scientometrics_Results/benchmark_temp.json';
    const rawData = fs.readFileSync(jsonPath, 'utf-8');
    const rows: { Reference_String: string }[] = JSON.parse(rawData);

    console.log(`Starting real CheckIfExist verification engine on ${rows.length} cases...`);
    const results: { Reference_String: string; Status: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
        const ref = rows[i].Reference_String;
        try {
            const res = await checkWithFallback(ref);
            let status = 'Not Found';
            if (res.exists) {
                if (res.matchConfidence >= 80) status = 'Verified';
                else status = 'Typo / fuzzy';
            }
            results.push({ Reference_String: ref, Status: status });
            if ((i + 1) % 20 === 0 || i === rows.length - 1) {
                console.log(`Processed ${i + 1}/${rows.length} cases...`);
            }
        } catch (err) {
            results.push({ Reference_String: ref, Status: 'Not Found' });
        }
        await new Promise(r => setTimeout(r, 600));
    }

    const csvLines = ['Reference_String,Status'];
    for (const r of results) {
        const escapedRef = `"${r.Reference_String.replace(/"/g, '""')}"`;
        csvLines.push(`${escapedRef},${r.Status}`);
    }
    fs.writeFileSync('c:/Users/Dilet/Desktop/Scientometrics_Results/checkifexist_predictions.csv', csvLines.join('\n'), 'utf-8');
    console.log('Saved genuine checkifexist_predictions.csv!');
}

run();
