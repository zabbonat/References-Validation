import pandas as pd
from googlesearch import search
import time
import unicodedata
import sys

sys.stdout.reconfigure(encoding='utf-8')

def clean_text(text):
    if not isinstance(text, str):
        return ""
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('utf-8')
    text = text.replace('\n', ' ').replace('\r', '').replace('\t', ' ')
    while '  ' in text:
        text = text.replace('  ', ' ')
    return text.strip()

def check_google(ref_text):
    cleaned = clean_text(ref_text)
    if not cleaned: return False, ""
    
    # Prendi solo i primi 100 caratteri per la ricerca Google per evitare query troppo lunghe
    query = cleaned[:100]
    
    try:
        # Cerchiamo 1 solo risultato con una pausa di 3 secondi per non farsi bloccare
        results = list(search(query, num_results=1, sleep_interval=3))
        if len(results) > 0:
            return True, results[0]
    except Exception as e:
        err_msg = str(e)
        if "429" in err_msg:
            print("    [!] Blocco da Google (HTTP 429). Pausa di 60 secondi...")
            time.sleep(60)
            # Riprova una volta
            try:
                results = list(search(query, num_results=1, sleep_interval=5))
                if len(results) > 0:
                    return True, results[0]
            except:
                pass
        return False, f"Errore Google: {err_msg}"
    
    return False, ""

def main():
    file_path = r"C:\Users\Dilet\Desktop\Scientometrics_Results\FINAL_MERGED_SCIENTOMETRICS.xlsx"
    out_path = r"C:\Users\Dilet\Desktop\Scientometrics_Results\Verified_Google_Not_Found.xlsx"
    
    df = pd.read_excel(file_path)
    not_found = df[df['Status'] == 'Not Found'].copy()
    total = len(not_found)
    print(f"Trovate {total} referenze da verificare direttamente su Google...")
    
    verified_results = []
    
    for idx, (i, row) in enumerate(not_found.iterrows()):
        ref = row['Original Reference']
        print(f"[{idx+1}/{total}] Verifico su Google: {str(ref)[:60]}...")
        
        found, first_url = check_google(ref)
        
        row_dict = row.to_dict()
        row_dict['Actual Status'] = "Esiste (Google l'ha trovato)" if found else "Allucinazione Vera"
        row_dict['Google First Result'] = first_url
        
        verified_results.append(row_dict)
        
        # Salvataggio incrementale
        if (idx + 1) % 10 == 0:
            pd.DataFrame(verified_results).to_excel(out_path, index=False)
            print(f"    -> Salvataggio intermedio completato.")
            
    df_res = pd.DataFrame(verified_results)
    df_res.to_excel(out_path, index=False)
    
    veri_falsi = len(df_res[df_res['Actual Status'] == "Esiste (Google l'ha trovato)"])
    vere_allucinazioni = len(df_res[df_res['Actual Status'] == 'Allucinazione Vera'])
    
    print("\n--- RISULTATO FINALE GOOGLE ---")
    print(f"Esistono (Google le ha trovate): {veri_falsi}")
    print(f"Allucinazioni Vere (Google NON le ha trovate): {vere_allucinazioni}")

if __name__ == "__main__":
    main()
