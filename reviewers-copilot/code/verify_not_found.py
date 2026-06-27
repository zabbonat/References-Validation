import pandas as pd
import requests
import time
import unicodedata
import os
import urllib.parse
import sys

# Imposta l'encoding di stdout a utf-8 per evitare crash di Windows cp1252
sys.stdout.reconfigure(encoding='utf-8')

def clean_text(text):
    if not isinstance(text, str):
        return ""
    # Rimuove le legature unicode come "ﬁ", "ﬂ"
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('utf-8')
    # Sostituisce a capo e tab con spazi
    text = text.replace('\n', ' ').replace('\r', '').replace('\t', ' ')
    # Rimuove doppi spazi
    while '  ' in text:
        text = text.replace('  ', ' ')
    return text.strip()

def check_crossref(ref_text):
    cleaned = clean_text(ref_text)
    if not cleaned: return False, ""
    
    # Crossref usa query.bibliographic per match fuzzy
    query = urllib.parse.quote(cleaned)
    url = f"https://api.crossref.org/works?query.bibliographic={query}&select=title,author,DOI,score&rows=1"
    
    try:
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            items = data.get('message', {}).get('items', [])
            if items:
                item = items[0]
                # Se lo score è alto (> 30-40), significa che ha trovato una corrispondenza forte
                score = item.get('score', 0)
                if score > 20.0:  # Soglia conservativa
                    title = item.get('title', [''])[0]
                    return True, title
    except Exception as e:
        pass
    
    return False, ""

def main():
    file_path = r"C:\Users\Dilet\Desktop\Scientometrics_Results\FINAL_MERGED_SCIENTOMETRICS.xlsx"
    out_path = r"C:\Users\Dilet\Desktop\Scientometrics_Results\Verified_Not_Found.xlsx"
    
    df = pd.read_excel(file_path)
    
    # Filtra solo i Not Found
    not_found = df[df['Status'] == 'Not Found'].copy()
    total = len(not_found)
    print(f"Trovate {total} referenze da verificare...")
    
    verified_results = []
    
    for idx, (i, row) in enumerate(not_found.iterrows()):
        ref = row['Original Reference']
        print(f"[{idx+1}/{total}] Verifico: {str(ref)[:60]}...")
        
        found, title = check_crossref(ref)
        
        row_dict = row.to_dict()
        row_dict['Actual Status'] = "Esiste (Falso Positivo)" if found else "Allucinazione Vera"
        row_dict['Found Title via CrossRef'] = title
        
        verified_results.append(row_dict)
        time.sleep(0.5)  # Per rispettare le API (max 50 req/sec su crossref, ma stiamo sicuri)
        
    df_res = pd.DataFrame(verified_results)
    df_res.to_excel(out_path, index=False)
    
    veri_falsi = len(df_res[df_res['Actual Status'] == 'Esiste (Falso Positivo)'])
    vere_allucinazioni = len(df_res[df_res['Actual Status'] == 'Allucinazione Vera'])
    
    print("\n--- RISULTATO FINALE ---")
    print(f"Falsi Positivi (Il paper esiste ma le API precedenti hanno fallito): {veri_falsi}")
    print(f"Allucinazioni Vere (Il paper NON esiste): {vere_allucinazioni}")

if __name__ == "__main__":
    main()
