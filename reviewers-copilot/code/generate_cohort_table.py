import pandas as pd

df = pd.read_excel(r'C:\Users\Dilet\Desktop\Scientometrics_Results\FINAL_MERGED_SCIENTOMETRICS.xlsx')

# Group datasets by cohort year
def get_cohort(ds):
    if '2016' in str(ds):
        return '2016 (Pre-LLM Baseline)'
    elif '2023' in str(ds):
        return '2023 (Early ChatGPT)'
    elif '2025' in str(ds):
        return '2025 (AI-Native Era)'
    else:
        return '2026 (Latest ArXiv General)'

df['Cohort'] = df['Dataset'].apply(get_cohort)

summary = df.groupby('Cohort').agg(
    Total_Refs=('Original Reference', 'count'),
    Not_Found=('Status', lambda x: (x == 'Not Found').sum())
).reset_index()

summary['Naive_Error_Rate_%'] = (summary['Not_Found'] / summary['Total_Refs']) * 100

print(summary.to_string(index=False))

# Calculate Chi-Square test or trend
print(f"\nTotal longitudinal corpus: {summary['Total_Refs'].sum()}")
print(f"Total naive Not-Found: {summary['Not_Found'].sum()}")
