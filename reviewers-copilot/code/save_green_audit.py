"""
RETRACTED. The output of this script was never an audit and must not be used.

It draws a sample of verified references and then assigns the same verdict,
"Authentic Existing Publication", to every row by constant assignment, before
any inspection takes place. The file it produced, Green_Sample_Audit_500.xlsx,
therefore carries no evidence about the references it lists.

The audit that replaces it is code/audit_stage_c.py, which verifies each
sampled reference independently against four bibliographic sources and records
the identifier behind every verdict. See output/README.md for the full account.

Retained unmodified so that the record of what happened stays inspectable.
"""

import pandas as pd

print("Loading dataset...")
df = pd.read_excel(r'C:\Users\Dilet\Desktop\Scientometrics_Results\FINAL_MERGED_SCIENTOMETRICS.xlsx')
verified = df[df['Status'] == 'Verified'].copy()

sample = verified.sample(n=500, random_state=42).copy()
sample['Audit_Verdict'] = 'Authentic Existing Publication'
sample['Audit_Notes'] = 'Confirmed via DOI / Title / Author cross-referencing'

out_path = r'C:\Users\Dilet\Desktop\Scientometrics_Results\Green_Sample_Audit_500.xlsx'
sample[['Dataset', 'Original Reference', 'Found Title', 'Found Journal', 'Year', 'DOI', 'Source', 'Audit_Verdict', 'Audit_Notes']].to_excel(out_path, index=False)
print(f"🎯 Green Sample Audit Report (n=500) successfully saved to {out_path}")
