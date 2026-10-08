import pandas as pd
import os

file_path = '/home/user/Scrivania/cluster/dashboard/uploads/1778658057856-binance.xlsx'
csv_path = '/tmp/cluster_binance_test.csv'
warnings_path = 'warnings.txt'

# Lettura di tutti i figli del file Excel
xls = pd.ExcelFile(file_path)
df_list = []
for sheet_name in xls.sheet_names:
    df_temp = pd.read_excel(xls, sheet_name=sheet_name)
    df_list.append(df_temp)

df_all = pd.concat(df_list, ignore_index=True)

# Filtro ADA
ada_rows = df_all[(df_all.get('Network') == 'ADA') | (df_all.get('Coin') == 'ADA') | (df_all.get('Currency') == 'ADA')]

print(f"Numero righe ADA: {len(ada_rows)}")
if not ada_rows.empty:
    cols = [c for c in ['Coin', 'Currency', 'Network', 'Address', 'Deposit Address', 'Amount'] if c in ada_rows.columns]
    print("\nPrime 10 righe ADA (colonne rilevanti):")
    print(ada_rows[cols].head(10).to_string(index=False))

# Controllo CSV e warnings
found_csv = False
if os.path.exists(csv_path):
    with open(csv_path, 'r') as f:
        content = f.read().upper()
        if 'ADA' in content or 'CARDANO' in content:
            found_csv = True

found_warnings = False
if os.path.exists(warnings_path):
    with open(warnings_path, 'r') as f:
        content = f.read().upper()
        if 'ADA' in content or 'CARDANO' in content:
            found_warnings = True

print(f"\nADA/Cardano nel CSV: {found_csv}")
print(f"ADA/Cardano nei warnings: {found_warnings}")

# Controllo Address condivisi
if not ada_rows.empty and ('Address' in df_all.columns or 'Deposit Address' in df_all.columns):
    addr_col = 'Address' if 'Address' in df_all.columns else 'Deposit Address'
    ada_addresses = set(ada_rows[addr_col].dropna())
    non_ada_rows = df_all[~((df_all.get('Network') == 'ADA') | (df_all.get('Coin') == 'ADA') | (df_all.get('Currency') == 'ADA'))]
    shared = non_ada_rows[non_ada_rows[addr_col].isin(ada_addresses)]
    print(f"Righe non-ADA con lo stesso indirizzo delle righe ADA: {len(shared)}")
