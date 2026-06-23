import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { checkWithFallback } from '../src/services/SearchService';

// Importa le funzioni di parsing che già usiamo nella web app
import { parseReferences } from '../src/services/PlainTextParser';

const DATASET_DIR = path.join(process.env.USERPROFILE || '', 'Dataset_Scientometrics');
const OUTPUT_DIR = path.join(process.env.USERPROFILE || '', 'Desktop', 'Scientometrics_Results');

const VALID_FOLDERS = [
    'Arxiv_CS_2016', 'Arxiv_CS_2023',
    'Arxiv_Bio_2016', 'Arxiv_Bio_2023',
    'NeurIPS_2016', 'NeurIPS_2023'
];

// Crea la cartella di output
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Regex semplificata per trovare l'inizio della bibliografia (presa dal nostro codice)
const REFERENCE_HEADINGS = [
    'references', 'bibliography', 'literature', 'works cited', 'cited literature',
    'literature cited', 'citations', 'reference list', 'works referenced'
];
const HEADING_REGEX = new RegExp(`^\\s*(?:[0-9IVXLC]+[.\\s)]+)?\\s*(${REFERENCE_HEADINGS.join('|')})\\s*[:\\s\\d.\\-]*$`, 'im');

async function extractReferencesFromPdf(filePath: string): Promise<string[]> {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        // Usa l'import dinamico per bypassare i problemi di Vite con i moduli CommonJS
        const pdfParseModule = await import('pdf-parse');
        const parser = pdfParseModule.default || pdfParseModule;
        const data = await parser(dataBuffer);
        const text = data.text;

        // Trova dove inizia la bibliografia
        const match = HEADING_REGEX.exec(text);
        if (!match) {
            return []; // Bibliografia non trovata
        }

        const refsText = text.substring(match.index + match[0].length);
        
        // Usa il nostro parser intelligente!
        const parsed = parseReferences(refsText);
        return parsed;

    } catch (error) {
        console.error(`Errore nell'estrazione di ${filePath}:`, error);
        return [];
    }
}

async function processFolder(folderPath: string, folderName: string) {
    console.log(`\n=== Iniziando l'analisi della cartella: ${folderName} ===`);
    const files = fs.readdirSync(folderPath).filter(f => f.toLowerCase().endsWith('.pdf'));
    
    const allResults: any[] = [];
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`[${i+1}/${files.length}] Processando ${file}...`);
        
        const refs = await extractReferencesFromPdf(path.join(folderPath, file));
        console.log(`    Trovate ${refs.length} referenze in ${file}`);
        
        for (let j = 0; j < Math.min(refs.length, 50); j++) { // Limitato a 50 per sicurezza
            const refText = refs[j];
            if (refText.length < 15) continue; // Salta stringhe vuote
            
            try {
                // USA LA NOSTRA LOGICA!
                const result = await checkWithFallback(refText);
                
                allResults.push({
                    'Paper File': file,
                    'Dataset': folderName,
                    'Original Reference': refText.substring(0, 500),
                    'Status': !result.exists ? 'Not Found' : result.matchConfidence > 80 ? 'Verified' : 'Partial Match',
                    'Found Title': result.title || '',
                    'Found Journal': result.journal || '',
                    'Year': result.year || '',
                    'DOI': result.doi || '',
                    'Confidence %': result.matchConfidence || 0,
                    'Retracted': result.retracted ? 'YES' : 'NO',
                    'Predatory': result.predatory ? 'YES' : 'NO',
                    'Source': result.source || ''
                });
                
                // Pausa per rispettare i limiti API di CrossRef (1 req/sec)
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (err) {
                console.error(`    Errore API per la referenza ${j}:`, err);
            }
        }
    }
    
    // Salva l'Excel per questa cartella
    if (allResults.length > 0) {
        const worksheet = XLSX.utils.json_to_sheet(allResults);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');
        
        const outPath = path.join(OUTPUT_DIR, `${folderName}_Results.xlsx`);
        XLSX.writeFile(workbook, outPath);
        console.log(`✅ Salvato: ${outPath}`);
    }
    
    return allResults;
}

async function runAll() {
    console.log("AVVIO BATCH ANALYSIS (Scientometrics)");
    console.log(`Leggendo da: ${DATASET_DIR}`);
    
    if (!fs.existsSync(DATASET_DIR)) {
        console.error("Cartella dataset non trovata!");
        return;
    }
    
    const folders = fs.readdirSync(DATASET_DIR)
        .filter(f => fs.statSync(path.join(DATASET_DIR, f)).isDirectory() && VALID_FOLDERS.includes(f));
    
    let combinedResults: any[] = [];
    
    for (const folder of folders) {
        const results = await processFolder(path.join(DATASET_DIR, folder), folder);
        combinedResults = combinedResults.concat(results);
    }
    
    // EXCEL FINALE MERGIATO
    if (combinedResults.length > 0) {
        console.log("\n=== Salvataggio file Excel Consolidato Finale ===");
        const worksheet = XLSX.utils.json_to_sheet(combinedResults);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'All Results');
        
        const finalPath = path.join(OUTPUT_DIR, `FINAL_MERGED_SCIENTOMETRICS.xlsx`);
        XLSX.writeFile(workbook, finalPath);
        console.log(`🎯 COMPLETO! File unito salvato in: ${finalPath}`);
    }
}

// Avvia
runAll().catch(console.error);
