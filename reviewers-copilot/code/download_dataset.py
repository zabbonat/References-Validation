import os
import time
import requests
import urllib.request
from bs4 import BeautifulSoup
import urllib.parse
import json

# ==========================================
# CONFIGURAZIONE
# ==========================================
BASE_DIR = "Dataset_Scientometrics"
NUM_PAPERS = 150
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}

# Crea la struttura delle cartelle
folders = [
    "Arxiv_General_Latest"
]

for folder in folders:
    os.makedirs(os.path.join(BASE_DIR, folder), exist_ok=True)

# ==========================================
# 1. FUNZIONI ARXIV (CS & BIOLOGY)
# ==========================================
def download_arxiv(year, limit, folder_name, category="cs.AI"):
    print(f"\\n--- Scaricando {limit} paper da arXiv ({category}) per l'anno {year} ---")
    import xml.etree.ElementTree as ET
    
    # Costruiamo la query per l'API di arXiv
    query = f"search_query=cat:{category}+AND+submittedDate:[{year}01010000+TO+{year}12312359]&max_results={limit}"
    url = f"http://export.arxiv.org/api/query?{query}"
    
    response = requests.get(url)
    root = ET.fromstring(response.content)
    
    count = 0
    for entry in root.findall("{http://www.w3.org/2005/Atom}entry"):
        if count >= limit: break
        
        pdf_url = ""
        for link in entry.findall("{http://www.w3.org/2005/Atom}link"):
            if link.attrib.get('title') == 'pdf':
                pdf_url = link.attrib.get('href')
                break
                
        if pdf_url:
            paper_id = pdf_url.split('/')[-1]
            pdf_url = pdf_url.replace("http://", "https://") + ".pdf"
            filepath = os.path.join(BASE_DIR, folder_name, f"{paper_id}.pdf")
            
            if not os.path.exists(filepath):
                try:
                    urllib.request.urlretrieve(pdf_url, filepath)
                    print(f"[{count+1}/{limit}] Scaricato: {paper_id}.pdf")
                    time.sleep(1) # Rispetto rate limit
                    count += 1
                except Exception as e:
                    print(f"Errore download {pdf_url}: {e}")
            else:
                count += 1
                print(f"[{count}/{limit}] Già esiste: {paper_id}.pdf (salto)")

# ==========================================
# 2. FUNZIONI NEURIPS
# ==========================================
def download_neurips(year, limit, folder_name):
    print(f"\\n--- Scaricando {limit} paper da NeurIPS per l'anno {year} ---", flush=True)
    base_url = f"https://papers.nips.cc/paper_files/paper/{year}"
    
    try:
        response = requests.get(base_url, headers=HEADERS)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        paper_links = []
        # NeurIPS elenca i paper come <li><a href="...">...</a></li>
        for a_tag in soup.find_all('a', href=True):
            if 'Abstract' in a_tag.get('title', '') or '-Abstract' in a_tag['href']:
                paper_links.append(a_tag['href'])
                
        count = 0
        for link in paper_links:
            if count >= limit: break
            
            # Sostituiamo -Abstract*.html con -Paper-Conference.pdf (2023) o -Paper.pdf (2016)
            import re
            if str(year) == '2016':
                pdf_route = re.sub(r'-Abstract.*?\.html', '-Paper.pdf', link)
            elif str(year) in ['2023', '2025']:
                pdf_route = re.sub(r'-Abstract.*?\.html', '-Paper-Conference.pdf', link)
            else:
                pdf_route = re.sub(r'-Abstract.*?\.html', '-Paper.pdf', link)
            # NeurIPS usa /file/ al posto di /hash/ per i PDF
            pdf_route = pdf_route.replace('/hash/', '/file/')
                
            pdf_url = f"https://papers.nips.cc{pdf_route}"
            paper_id = pdf_route.split('/')[-1]
            
            filepath = os.path.join(BASE_DIR, folder_name, paper_id)
            
            if not os.path.exists(filepath):
                try:
                    req = urllib.request.Request(pdf_url, headers=HEADERS)
                    with urllib.request.urlopen(req, timeout=15) as response_pdf, open(filepath, 'wb') as out_file:
                        out_file.write(response_pdf.read())
                    print(f"[{count+1}/{limit}] Scaricato: {paper_id}", flush=True)
                    time.sleep(1) # Rispetto rate limit
                    count += 1
                except Exception as e:
                    print(f"Errore download {pdf_url}: {e}", flush=True)
            else:
                count += 1
                print(f"[{count}/{limit}] Già esiste: {paper_id} (salto)", flush=True)
    except Exception as e:
        print(f"Errore nel recupero indice NeurIPS {year}: {e}")

# ==========================================
# ESECUZIONE
# ==========================================
def download_arxiv_latest(limit, folder_name):
    print(f"\n--- Scaricando gli ultimi {limit} paper generici da arXiv ---")
    import xml.etree.ElementTree as ET
    
    # Query per gli ultimissimi paper sottomessi nel 2026
    query = f"search_query=all:the&sortBy=submittedDate&sortOrder=descending&max_results={limit}"
    url = f"http://export.arxiv.org/api/query?{query}"
    
    response = requests.get(url)
    root = ET.fromstring(response.content)
    
    count = 0
    for entry in root.findall("{http://www.w3.org/2005/Atom}entry"):
        if count >= limit: break
        
        pdf_url = ""
        for link in entry.findall("{http://www.w3.org/2005/Atom}link"):
            if link.attrib.get('title') == 'pdf':
                pdf_url = link.attrib.get('href')
                break
                
        if pdf_url:
            paper_id = pdf_url.split('/')[-1]
            pdf_url = pdf_url.replace("http://", "https://") + ".pdf"
            filepath = os.path.join(BASE_DIR, folder_name, f"{paper_id}.pdf")
            
            if not os.path.exists(filepath):
                try:
                    urllib.request.urlretrieve(pdf_url, filepath)
                    print(f"[{count+1}/{limit}] Scaricato: {paper_id}.pdf")
                    time.sleep(1) # Rispetto rate limit
                    count += 1
                except Exception as e:
                    print(f"Errore download {pdf_url}: {e}")
            else:
                count += 1
                print(f"[{count}/{limit}] Già esiste: {paper_id}.pdf (salto)")

if __name__ == "__main__":
    print("Inizio il download del Dataset per Scientometrics (Latest General)...")
    download_arxiv_latest(250, "Arxiv_General_Latest")
    print("\n[+] Download completo per Arxiv_General_Latest!", flush=True)
