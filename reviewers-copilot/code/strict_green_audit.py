import pandas as pd
import re
from difflib import SequenceMatcher

def fuzzy_sim(a, b):
    if not a or not b or pd.isna(a) or pd.isna(b):
        return 0.0
    return SequenceMatcher(None, str(a).lower(), str(b).lower()).ratio()

def extract_years(text):
    if pd.isna(text):
        return []
    matches = re.findall(r'\b(19\d\d|20[0-2]\d)\b', str(text))
    return [int(m) for m in matches]

print("Loading dataset...")
df = pd.read_excel(r'C:\Users\Dilet\Desktop\Scientometrics_Results\FINAL_MERGED_SCIENTOMETRICS.xlsx')
verified = df[df['Status'] == 'Verified'].copy()
print(f"Total verified references: {len(verified)}")

# Take random sample of n=500
sample = verified.sample(n=500, random_state=42).copy()

mismatches = []
for idx, row in sample.iterrows():
    orig = str(row['Original Reference'])
    found_title = str(row['Found Title'])
    found_year = row['Year']
    
    # Check Title similarity
    sim = fuzzy_sim(orig, found_title)
    
    # Check Year consistency
    orig_years = extract_years(orig)
    year_ok = True
    if pd.notna(found_year) and orig_years:
        # Check if found_year is within +-1 of any year in orig
        try:
            fy = int(float(found_year))
            if not any(abs(fy - oy) <= 1 for oy in orig_years):
                year_ok = False
        except:
            pass
            
    if sim < 0.25 or not year_ok:
        mismatches.append({
            'Index': idx,
            'Dataset': row['Dataset'],
            'Orig': orig,
            'FoundTitle': found_title,
            'FoundYear': found_year,
            'Sim': sim,
            'YearOK': year_ok
        })

print(f"\nAudit complete across n=500 Green sample.")
print(f"Flagged strict mismatches: {len(mismatches)}")
if mismatches:
    print("\nSample mismatches found:")
    for m in mismatches[:5]:
        print(f"[{m['Dataset']}] Sim={m['Sim']:.2f}, YearOK={m['YearOK']}")
        print(f"  Orig:  {m['Orig'][:100]}")
        print(f"  Found: {m['FoundTitle'][:100]} ({m['FoundYear']})\n")
else:
    print("🎯 100% PERFECT STRICT CONSISTENCY ACROSS GREEN SAMPLE! Zero near-misses found.")
