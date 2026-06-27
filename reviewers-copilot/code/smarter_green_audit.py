import pandas as pd
import re
from difflib import SequenceMatcher

def windowed_sim(ref, title):
    if not ref or not title or pd.isna(ref) or pd.isna(title):
        return 0.0
    ref_l = str(ref).lower()
    tit_l = str(title).lower().strip()
    if len(tit_l) < 5:
        return 0.0
    if tit_l in ref_l:
        return 1.0
        
    # Check sliding window or token overlap
    tit_tokens = set(re.findall(r'\b\w{4,}\b', tit_l))
    ref_tokens = set(re.findall(r'\b\w{4,}\b', ref_l))
    if not tit_tokens:
        return 0.0
    overlap = len(tit_tokens.intersection(ref_tokens)) / len(tit_tokens)
    return overlap

print("Loading dataset...")
df = pd.read_excel(r'C:\Users\Dilet\Desktop\Scientometrics_Results\FINAL_MERGED_SCIENTOMETRICS.xlsx')
verified = df[df['Status'] == 'Verified'].copy()
sample = verified.sample(n=500, random_state=42).copy()

flagged = []
for idx, row in sample.iterrows():
    orig = str(row['Original Reference'])
    found_title = str(row['Found Title'])
    
    score = windowed_sim(orig, found_title)
    if score < 0.60:
        flagged.append({
            'Index': idx,
            'Dataset': row['Dataset'],
            'Orig': orig,
            'FoundTitle': found_title,
            'Score': score,
            'Source': row['Source']
        })

print(f"Audit complete across n=500 Green sample.")
print(f"Flagged under windowed token overlap (<0.60): {len(flagged)}")
if flagged:
    print("\nTop 10 flagged items for manual inspection:")
    for f in flagged[:10]:
        print(f"[{f['Dataset']}] Source={f['Source']}, TokenOverlap={f['Score']:.2f}")
        print(f"  Orig:  {f['Orig']}")
        print(f"  Found: {f['FoundTitle']}\n")
