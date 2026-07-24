import pandas as pd
import json

excel_path = '/home/user/Scrivania/cluster/dashboard/uploads/1778658057856-binance.xlsx'
warnings_path = '/tmp/cluster_binance_test.warnings.txt'

# 1. Read Excel and find column names
df_initial = pd.read_excel(excel_path, sheet_name='Withdrawal History', header=None)
print("Initial rows of Excel:")
print(df_initial.head(10))

# Find the header row by searching for 'Asset' or 'UTC_Time' or 'Amount'
header_row = None
for i, row in df_initial.iterrows():
    if 'Asset' in row.values:
        header_row = i
        break

if header_row is not None:
    df_xlsx = pd.read_excel(excel_path, sheet_name='Withdrawal History', header=header_row)
else:
    # Fallback to column names if we can guess them or if it's a specific format
    print("Could not find 'Asset' in rows. Listing all values in row 0:")
    print(df_initial.iloc[0].values)
    # Based on previous output, columns seem to be indexed wrongly or missing.
    # Let's try to identify 'ADA' in any column
    df_xlsx = df_initial
    # Find which column has 'ADA'
    ada_col = None
    for col in df_xlsx.columns:
        if df_xlsx[col].astype(str).str.contains('ADA').any():
            ada_col = col
            break
    
    if ada_col is not None:
        print(f"Found ADA in column {ada_col}")
        # Assuming typical binance export structure:
        # Date, Asset, Amount, Address, TxId ...
        # Based on previous error: ['99461719', 'USDT', 184, ...]
        # Column 1 is Asset, Column 7 or 11/12 is TxId?
        # Let's re-read the first few lines to be sure.
        pass

# Final attempt to find ADA transactions
ada_rows = []
for i, row in df_initial.iterrows():
    if 'ADA' in row.values:
        ada_rows.append(row)

if not ada_rows:
    print("No 'ADA' found in any row.")
    exit(1)

ada_df = pd.DataFrame(ada_rows)
# Identify TxId column. Usually long hex/alphanumeric.
# Looking at Binance format, it's often many chars long.
def is_txid(val):
    s = str(val)
    return len(s) > 32

txid_col = None
for col in ada_df.columns:
    if ada_df[col].apply(is_txid).any():
        txid_col = col
        break

if txid_col is None:
    print("Could not identify TxId column.")
    print(ada_df.head())
    exit(1)

ada_df['TxId'] = ada_df[txid_col].astype(str).str.strip()
print(f"Total ADA withdrawals found: {len(ada_df)}")

# 2. Parse warnings
warnings_by_txid = {}
try:
    with open(warnings_path, 'r') as f:
        for line in f:
            try:
                data = json.loads(line)
                txid = str(data.get("Transaction ID", "")).strip()
                if txid and txid != "nan":
                    if txid not in warnings_by_txid:
                        warnings_by_txid[txid] = []
                    warnings_by_txid[txid].append(data)
            except:
                continue
except FileNotFoundError:
    print("Warning file not found.")

# 3. Compare
mainnet_not_supported = []
other_reasons = []
missing_from_warnings = []
excluded_reason_target = "Mainnet non supportata da reactor.chainalysis"

for _, row in ada_df.iterrows():
    txid = row['TxId']
    match_found = False
    
    if txid in warnings_by_txid:
        match_found = True
        reasons = [w.get("Motivo esclusione") for w in warnings_by_txid[txid]]
        if any(r == excluded_reason_target for r in reasons):
            mainnet_not_supported.append(txid)
        else:
            other_reasons.append((txid, reasons))
    else:
        for w_txid, w_list in warnings_by_txid.items():
            if txid in w_txid or w_txid in txid:
                match_found = True
                reasons = [w.get("Motivo esclusione") for w in w_list]
                if any(r == excluded_reason_target for r in reasons):
                    mainnet_not_supported.append(txid)
                else:
                    other_reasons.append((txid, reasons))
                break
    
    if not match_found:
        missing_from_warnings.append(row.to_dict())

print(f"\n1. ADA TxId with 'Mainnet non supportata' ({len(mainnet_not_supported)}):")
for tx in mainnet_not_supported:
    print(f"  {tx}")

print(f"\n2. ADA TxId with OTHER reasons ({len(other_reasons)}):")
for tx, reasons in other_reasons:
    print(f"  {tx}: {reasons}")

print(f"\n3. ADA TxId MISSING from warnings ({len(missing_from_warnings)}):")
for item in missing_from_warnings:
    print(f"  {item}")
