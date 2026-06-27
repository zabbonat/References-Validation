import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from scipy.stats import chi2_contingency
import os

# Set style for plots
sns.set_theme(style="whitegrid")

def analyze_data():
    file_path = r"C:\Users\Dilet\Desktop\Scientometrics_Results\FINAL_MERGED_SCIENTOMETRICS.xlsx"
    
    if not os.path.exists(file_path):
        print(f"File non trovato: {file_path}")
        return
        
    df = pd.read_excel(file_path)
    
    # Pulizia dati base
    df = df.dropna(subset=['Status', 'Dataset'])
    
    # Estrai Parent_Year e Parent_Domain dal nome del Dataset (es. "Arxiv_CS_2016")
    df['Parent_Year'] = df['Dataset'].astype(str).apply(lambda x: x.split('_')[-1])
    df['Parent_Domain'] = df['Dataset'].astype(str).apply(lambda x: '_'.join(x.split('_')[:-1]))
    
    df['Is_Hallucinated'] = df['Status'] == 'Not Found'
    
    # 1. Hallucinations (Not Found) per Anno
    # We want the percentage of hallucinated references over total references
    hallucinations = df.groupby('Parent_Year')['Is_Hallucinated'].mean().reset_index()
    hallucinations['Is_Hallucinated'] *= 100
    hallucinations.columns = ['Parent_Year', 'Hallucination Rate (%)']
    
    print("--- Tasso di Allucinazioni per Anno ---")
    print(hallucinations)
    
    # Plot Hallucinations
    plt.figure(figsize=(8, 6))
    ax = sns.barplot(x='Parent_Year', y='Hallucination Rate (%)', data=hallucinations, hue='Parent_Year', palette='Blues_d', legend=False)
    plt.title('Incidence of Unverifiable Citations (2016 vs 2023 vs 2025)', fontsize=14)
    plt.ylabel('Percentage of Unverifiable Citations (%)', fontsize=12)
    plt.xlabel('Publication Year', fontsize=12)
    plt.savefig(r"C:\Users\Dilet\Desktop\Scientometrics_Results\hallucinations_by_year.png", dpi=300, bbox_inches='tight')
    plt.close()

    # 2. Chi-Square Test (Hallucinations)
    contingency = pd.crosstab(df['Parent_Year'], df['Is_Hallucinated'])
    chi2, p, dof, expected = chi2_contingency(contingency)
    print("\n--- Chi-Square Test for Hallucinations ---")
    print(f"Chi-square statistic: {chi2:.4f}")
    print(f"p-value: {p:.4e}")
    if p < 0.05:
        print("Il p-value è < 0.05. C'è una correlazione statisticamente significativa!")
    else:
        print("Nessuna correlazione statisticamente significativa.")
        
    # 3. Analisi per Dataset (Dominio)
    domain_hallucinations = df.groupby(['Parent_Domain', 'Parent_Year'])['Is_Hallucinated'].mean().reset_index()
    domain_hallucinations['Is_Hallucinated'] *= 100
    domain_hallucinations.columns = ['Domain', 'Year', 'Hallucination Rate (%)']
    
    plt.figure(figsize=(10, 6))
    sns.barplot(x='Domain', y='Hallucination Rate (%)', hue='Year', data=domain_hallucinations, palette='mako')
    plt.title('Unverifiable Citation Rate by Domain (2016 vs 2023 vs 2025)', fontsize=14)
    plt.ylabel('Percentage of Unverifiable Citations (%)', fontsize=12)
    plt.xlabel('Academic Domain', fontsize=12)
    plt.legend(title='Year')
    plt.savefig(r"C:\Users\Dilet\Desktop\Scientometrics_Results\hallucinations_by_domain.png", dpi=300, bbox_inches='tight')
    plt.close()

if __name__ == "__main__":
    analyze_data()
