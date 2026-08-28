import pandas as pd
import json

warnings_path = '/tmp/cluster_binance_test.warnings.txt'
excluded_reason = "Mainnet non supportata da reactor.chainalysis"
count_reason = 0
ada_warnings = []

try:
    with open(warnings_path, 'r') as f:
        for line in f:
            try:
                data = json.loads(line)
                if data.get("Motivo esclusione") == excluded_reason:
                    count_reason += 1
                    # ADA checks: addr1... or Ae2... or if it contains ADA strings
                    output_addr = str(data.get("Output index or Counterparty Address", ""))
                    if output_addr.startswith("addr1") or output_addr.startswith("Ae2") or "ADA" in line:
                         ada_warnings.append(line)
            except:
                continue
except FileNotFoundError:
    pass

print(f"Righe con motivo '{excluded_reason}': {count_reason}")
print(f"Tra queste, righe riguardanti ADA (per indirizzo o testo): {len(ada_warnings)}")
print("Prime 5 righe ADA del warnings:")
for w in ada_warnings[:5]:
    print(w.strip())

csv_path = '/tmp/cluster_binance_test.csv'
try:
    df = pd.read_csv(csv_path)
    ada_exact = len(df[df['Asset'] == 'ADA'])
    ada_search = len(df[df['Asset'].str.contains('CARDANO/ADA', na=False)])
    print(f"\nRighe nel CSV con Asset == 'ADA': {ada_exact}")
    print(f"Righe nel CSV con Asset contenente 'CARDANO/ADA': {ada_search}")
except Exception as e:
    print(f"Errore nella lettura del CSV: {e}")
