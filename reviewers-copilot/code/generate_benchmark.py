import pandas as pd
import random
import os

BASE_DIR = os.path.join(os.environ['USERPROFILE'], 'Desktop', 'Scientometrics_Results')
INPUT_EXCEL = os.path.join(BASE_DIR, 'FINAL_MERGED_SCIENTOMETRICS.xlsx')
OUTPUT_BENCHMARK = os.path.join(BASE_DIR, 'BENCHMARK_DATASET.xlsx')

def generate_benchmark():
    print("Caricamento dataset reale per campionamento...")
    if not os.path.exists(INPUT_EXCEL):
        print(f"Errore: {INPUT_EXCEL} non trovato!")
        return
        
    df_real = pd.read_excel(INPUT_EXCEL)
    verified = df_real[df_real['Status'] == 'Verified'].dropna(subset=['Original Reference']).copy()
    
    # 1. 100 True Negatives (Clean)
    sample_clean = verified.sample(100, random_state=42)
    clean_cases = []
    for _, row in sample_clean.iterrows():
        clean_cases.append({
            'Test_ID': f"TN_CLEAN_{len(clean_cases)+1}",
            'Category': 'True Negative (Clean)',
            'Reference_String': row['Original Reference'],
            'Ground_Truth_Exists': True,
            'Description': 'Referenza reale e intatta'
        })
        
    # 2. 100 True Negatives (Adversarial / Typo)
    sample_adv = verified.sample(100, random_state=100)
    adv_cases = []
    ligatures = [('fi', '\ufb01'), ('fl', '\ufb02'), ('ff', '\ufb00'), ('ffi', '\ufb03')]
    for _, row in sample_adv.iterrows():
        ref = str(row['Original Reference'])
        # Iniettiamo legature
        for clean_sub, lig in ligatures:
            if clean_sub in ref:
                ref = ref.replace(clean_sub, lig)
        # Se non c'era nessuna legatura da sostituire, forziamo un doppio spazio o formatting incollato
        if '\ufb01' not in ref and '\ufb02' not in ref and '\ufb00' not in ref:
            ref = ref.replace(' ', '  ').replace('.', '.\n')
            
        adv_cases.append({
            'Test_ID': f"TN_ADV_{len(adv_cases)+1}",
            'Category': 'True Negative (Adversarial)',
            'Reference_String': ref,
            'Ground_Truth_Exists': True,
            'Description': 'Referenza reale corrotta con legature Unicode e formattazione malformata'
        })
        
    # 3. 100 Ground Truth Positives (Controlled Mutation)
    sample_mut = verified.sample(100, random_state=200)
    mut_cases = []
    fake_topics = ["Quantum Gravity", "Sub-surface Thermal Anomalies", "CRISPR-Cas9 Gene Editing", "Supra-molecular Polymers", "Dark Matter Halos", "Neuro-morphic Computing", "Super-conducting Qubits", "Metagenomic Sequencing", "Zero-Knowledge Proofs", "Topological Insulators"]
    for _, row in sample_mut.iterrows():
        ref = str(row['Original Reference'])
        words = ref.split()
        if len(words) > 5:
            # Manteniamo i primi 3 token (probabilmente autori) e l'ultimo (anno/giornale), ma sostituiamo il cuore del titolo
            fake_title = random.choice(fake_topics) + f" in {random.choice(fake_topics)}"
            mutated_ref = " ".join(words[:3]) + f" {fake_title}. " + " ".join(words[-3:])
        else:
            mutated_ref = f"Smith, J. and Doe, A. {random.choice(fake_topics)}: A Comprehensive Review. Journal of Applied Physics, 2025."
            
        mut_cases.append({
            'Test_ID': f"TP_MUT_{len(mut_cases)+1}",
            'Category': 'Ground Truth Positive (Mutated)',
            'Reference_String': mutated_ref,
            'Ground_Truth_Exists': False,
            'Description': 'Autori reali combinati con titolo sintetico inesistente'
        })
        
    # 4. 100 Ground Truth Positives (Realistic LLM Fabrications)
    llm_fabrications = [
        "Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, L., & Polosukhin, I. (2024). Attention is all you need for multimodal genomic sequencing. Nature Biotechnology, 42(8), 1021-1034.",
        "Goodfellow, I., Pouget-Abadie, J., Mirza, M., Xu, B., Warde-Farley, D., Ozair, S., Courville, A., & Bengio, Y. (2023). Generative adversarial networks for automated clinical diagnosis. Medical Image Analysis, 85, 102741.",
        "He, K., Zhang, X., Ren, S., & Sun, J. (2025). Deep residual learning for quantum state tomography. Physical Review Letters, 134(2), 020401.",
        "LeCun, Y., Bengio, Y., & Hinton, G. (2024). Deep learning for climate change mitigation architectures. Nature Climate Change, 14(5), 412-425.",
        "Brown, T., Mann, B., Ryder, N., Subbiah, M., Kaplan, J. D., Dhariwal, P., Neelakantan, A., Shyam, P., Sastry, G., Askell, A., et al. (2023). Language models are few-shot diagnostic physicians. New England Journal of Medicine, 389(12), 1102-1115.",
        "Chen, T., & Guestrin, C. (2024). XGBoost: A scalable tree boosting system for high-frequency financial trading. Journal of Finance, 79(3), 1455-1489.",
        "Ronneberger, O., Fischer, P., & Brox, T. (2023). U-Net: Convolutional networks for real-time astronomical anomaly detection. Astrophysical Journal, 952(1), 84.",
        "Dosovitskiy, A., Beyer, L., Kolesnikov, A., Weissenborn, D., Zhai, X., Unterthiner, T., Dehghani, M., Minderer, M., Heigold, G., Gelly, S., Uszkoreit, J., & Houlsby, N. (2025). An image is worth 16x16 words: Transformers for sub-atomic particle tracking. Journal of High Energy Physics, 2025(4), 112.",
        "Kingma, D. P., & Ba, J. (2024). Adam: A method for stochastic optimization in dark energy simulations. Monthly Notices of the Royal Astronomical Society, 528(2), 1890-1902.",
        "Hochreiter, S., & Schmidhuber, J. (2025). Long short-term memory networks for predicting earthquakes. Earth and Planetary Science Letters, 610, 114120."
    ]
    
    llm_cases = []
    for i in range(100):
        base_fake = llm_fabrications[i % len(llm_fabrications)]
        # Variamo leggermente i numeri di pagina o anno per avere 100 stringhe uniche
        modified_fake = base_fake.replace("1021-1034", f"{1000+i}-{1015+i}").replace("412-425", f"{400+i}-{415+i}")
        llm_cases.append({
            'Test_ID': f"TP_LLM_{len(llm_cases)+1}",
            'Category': 'Ground Truth Positive (LLM Fabricated)',
            'Reference_String': modified_fake,
            'Ground_Truth_Exists': False,
            'Description': 'Fabbricazione verosimile stile ChatGPT con autori famosi e titoli inventati'
        })
        
    df_benchmark = pd.DataFrame(clean_cases + adv_cases + mut_cases + llm_cases)
    df_benchmark.to_excel(OUTPUT_BENCHMARK, index=False)
    print(f"[+] Benchmark Dataset creato con successo! 400 record salvati in: {OUTPUT_BENCHMARK}")

if __name__ == "__main__":
    generate_benchmark()
