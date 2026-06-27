import pandas as pd

df = pd.read_excel(r'C:\Users\Dilet\Desktop\Scientometrics_Results\FINAL_MERGED_SCIENTOMETRICS.xlsx')
not_found = df[df['Status'] == 'Not Found']
sample = not_found['Original Reference'].sample(5, random_state=42).tolist()

with open('sample.txt', 'w', encoding='utf-8') as f:
    for ref in sample:
        f.write(str(ref) + '\n\n')
