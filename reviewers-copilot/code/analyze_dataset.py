import os
import re
import json
import time
import requests
import pandas as pd
import fitz  # PyMuPDF
from pathlib import Path
import unicodedata

# Paths
BASE_DIR = os.path.join(os.environ['USERPROFILE'], 'Dataset_Scientometrics')
OUTPUT_DIR = os.path.join(os.environ['USERPROFILE'], 'Desktop', 'Scientometrics_Results')
PREDATORY_LIST_PATH = os.path.join(os.environ['USERPROFILE'], '.gemini', 'antigravity', 'scratch', 'References-Validation', 'src', 'vendors', 'predatoryList.json')

os.makedirs(OUTPUT_DIR, exist_ok=True)

VALID_FOLDERS = [
    'Arxiv_General_Latest'
]

ILLEGAL_CHARACTERS_RE = re.compile(r'[\000-\010]|[\013-\014]|[\016-\037]')

def clean_excel(text):
    if not isinstance(text, str): return text
    return ILLEGAL_CHARACTERS_RE.sub("", text)

# Load predatory list
with open(PREDATORY_LIST_PATH, 'r', encoding='utf-8') as f:
    predatory_data = json.load(f)
    # The JSON is typically { "Journal Name": { ... } } or a list.
    # From Web App we check if normalize(journal) is in predatoryList
    # Actually, predatoryList.json in our app is an array of objects or an object?
    # I'll load it and handle it.
    
def normalize_string(s):
    if not s: return ""
    return re.sub(r'[^a-z0-9]', '', str(s).lower())

if isinstance(predatory_data, dict):
    predatory_journals = {normalize_string(k) for k in predatory_data.keys()}
elif isinstance(predatory_data, list):
    if len(predatory_data) > 0 and isinstance(predatory_data[0], dict):
        predatory_journals = {normalize_string(item.get('title', item.get('name', ''))) for item in predatory_data}
    else:
        predatory_journals = {normalize_string(item) for item in predatory_data}
else:
    predatory_journals = set()

def is_predatory(journal_name):
    if not journal_name: return False
    return normalize_string(journal_name) in predatory_journals

# Regex to find references section
REF_HEADINGS = [
    'references', 'bibliography', 'literature', 'works cited', 'cited literature',
    'literature cited', 'citations', 'reference list', 'works referenced'
]
HEADING_REGEX = re.compile(r'^\s*(?:[0-9IVXLC]+[.\s)]+)?\s*(' + '|'.join(REF_HEADINGS) + r')\s*[:\s\d.\-]*$', re.IGNORECASE | re.MULTILINE)

def extract_references_from_pdf(filepath):
    text = ""
    try:
        doc = fitz.open(filepath)
        start_page = max(0, len(doc) - 10)
        for i in range(start_page, len(doc)):
            page = doc.load_page(i)
            page_text = page.get_text()
            if page_text:
                text += page_text + "\n"
        doc.close()
    except Exception as e:
        print(f"Error reading {filepath}: {e}", flush=True)
        return []

    match = HEADING_REGEX.search(text)
    if not match:
        return []
    
    refs_text = text[match.end():]
    
    # Split references by simple heuristic: [1] or 1.
    refs_split = re.split(r'\n\s*\[\d+\]\s*|\n\s*\d+\.\s+', refs_text)
    
    clean_refs = []
    for r in refs_split:
        r = r.strip().replace('\n', ' ')
        if len(r) > 15:
            clean_refs.append(r)
    return clean_refs

def check_reference(ref_text):
    ref_text = unicodedata.normalize('NFKD', ref_text).encode('ascii', 'ignore').decode('utf-8')
    ref_text = ref_text.replace('\n', ' ').replace('\r', '').replace('\t', ' ')
    while '  ' in ref_text:
        ref_text = ref_text.replace('  ', ' ')
    ref_text = ref_text.strip()

    res = {
        'exists': False,
        'title': '',
        'journal': '',
        'year': '',
        'doi': '',
        'retracted': False,
        'predatory': False,
        'source': 'None'
    }
    
    # 1. CROSSREF
    try:
        url = "https://api.crossref.org/works"
        params = {
            "query.bibliographic": ref_text,
            "rows": 1,
            "mailto": "info@scientometrics.org"
        }
        resp = requests.get(url, params=params, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            items = data.get('message', {}).get('items', [])
            if items:
                item = items[0]
                # Check confidence? Crossref returns relevance score but it's relative.
                # Just take the first result as the app does.
                res['exists'] = True
                res['title'] = item.get('title', [''])[0] if item.get('title') else ''
                res['journal'] = item.get('container-title', [''])[0] if item.get('container-title') else ''
                
                # Extract year
                issued = item.get('issued', {}).get('date-parts', [[None]])
                if issued and issued[0][0]:
                    res['year'] = str(issued[0][0])
                
                res['doi'] = item.get('DOI', '')
                res['source'] = 'CrossRef'
                
                # Check Retraction
                title_lower = res['title'].lower()
                if "retract" in title_lower or "withdrawal" in title_lower:
                    res['retracted'] = True
                else:
                    updates = item.get('update-to', [])
                    for up in updates:
                        if up.get('type') == 'retraction':
                            res['retracted'] = True
                            break
                            
                # Check Predatory
                res['predatory'] = is_predatory(res['journal'])
                return res
    except Exception as e:
        pass
        
    # 2. SEMANTIC SCHOLAR
    try:
        url = "https://api.semanticscholar.org/graph/v1/paper/search"
        params = {
            "query": ref_text,
            "limit": 1,
            "fields": "title,year,venue,externalIds"
        }
        resp = requests.get(url, params=params, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            items = data.get('data', [])
            if items:
                item = items[0]
                res['exists'] = True
                res['title'] = item.get('title', '')
                res['journal'] = item.get('venue', '')
                res['year'] = str(item.get('year', ''))
                extIds = item.get('externalIds', {})
                res['doi'] = extIds.get('DOI', '')
                res['source'] = 'SemanticScholar'
                
                title_lower = res['title'].lower()
                if "retract" in title_lower or "withdrawal" in title_lower:
                    res['retracted'] = True
                
                res['predatory'] = is_predatory(res['journal'])
                return res
    except Exception as e:
        pass

    return res

all_combined_results = []

for folder in VALID_FOLDERS:
    folder_path = os.path.join(BASE_DIR, folder)
    if not os.path.exists(folder_path):
        continue
        
    print(f"\n=== Elaborazione cartella: {folder} ===", flush=True)
    files = [f for f in os.listdir(folder_path) if f.lower().endswith('.pdf')]
    
    out_path = os.path.join(OUTPUT_DIR, f"{folder}_Results.xlsx")
    
    # RESUME CAPABILITY
    processed_files = set()
    if os.path.exists(out_path):
        try:
            df_existing = pd.read_excel(out_path)
            if 'Paper File' in df_existing.columns:
                processed_files = set(df_existing['Paper File'].unique())
            # Load existing into memory so we don't lose them when overwriting out_path
            all_combined_results.extend(df_existing.to_dict('records'))
        except Exception as e:
            print(f"Errore caricamento risultati esistenti: {e}", flush=True)
    
    for i, filename in enumerate(files):
        if filename in processed_files:
            print(f"[{i+1}/{len(files)}] {filename} già processato (salto).", flush=True)
            continue
            
        print(f"[{i+1}/{len(files)}] Processando {filename}...", flush=True)
        filepath = os.path.join(folder_path, filename)
        
        refs = extract_references_from_pdf(filepath)
        print(f"    Trovate {len(refs)} referenze.", flush=True)
        
        # Limit to 50
        refs = refs[:50]
        
        for idx, ref_text in enumerate(refs):
            result = check_reference(ref_text)
            
            row = {
                'Paper File': filename,
                'Dataset': folder,
                'Original Reference': clean_excel(ref_text[:500]),
                'Status': 'Verified' if result['exists'] else 'Not Found',
                'Found Title': clean_excel(result['title']),
                'Found Journal': clean_excel(result['journal']),
                'Year': clean_excel(result['year']),
                'DOI': clean_excel(result['doi']),
                'Retracted': 'YES' if result['retracted'] else 'NO',
                'Predatory': 'YES' if result['predatory'] else 'NO',
                'Source': clean_excel(result['source'])
            }
            all_combined_results.append(row)
            
            time.sleep(1) # CrossRef rate limit
            
        # Salva in tempo reale!
        if all_combined_results:
            df = pd.DataFrame(all_combined_results)
            df.to_excel(out_path, index=False)
            print(f"    [OK] Progresso salvato in {out_path}", flush=True)

if all_combined_results:
    df_new = pd.DataFrame(all_combined_results)
    final_path = os.path.join(OUTPUT_DIR, "FINAL_MERGED_SCIENTOMETRICS.xlsx")
    
    if os.path.exists(final_path):
        df_existing = pd.read_excel(final_path)
        df_all = pd.concat([df_existing, df_new], ignore_index=True)
    else:
        df_all = df_new
        
    df_all.to_excel(final_path, index=False)
    print(f"[COMPLETO] File unito e AGGIORNATO salvato in: {final_path}", flush=True)
