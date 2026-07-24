import pandas as pd
import warnings
warnings.filterwarnings("ignore", category=UserWarning)

file_path = 'dashboard/uploads/1778658057856-binance.xlsx'
target_address = '0x68c1e1797780397485be915690b084840832b61c'

try:
    xl = pd.ExcelFile(file_path)
    
    # Deposit History
    if 'Deposit History' in xl.sheet_names:
        df = pd.read_excel(file_path, sheet_name='Deposit History')
        mask = df['Deposit Address'].astype(str).str.contains(target_address, case=False, na=False)
        res = df[mask]
        if not res.empty:
            print("--- Deposit History ---")
            cols = ['Currency', 'Network', 'Deposit Address', 'TXID', 'CounterParty ID']
            print(res[[c for c in cols if c in res.columns]].to_string(index=False))

    # Withdrawal History
    if 'Withdrawal History' in xl.sheet_names:
        df = pd.read_excel(file_path, sheet_name='Withdrawal History')
        # Note the trailing space in 'Destination Address ' found in previous output
        addr_col = 'Destination Address ' if 'Destination Address ' in df.columns else 'Destination Address'
        mask = df[addr_col].astype(str).str.contains(target_address, case=False, na=False)
        res = df[mask]
        if not res.empty:
            print("\n--- Withdrawal History ---")
            cols = ['Currency', 'Network', addr_col, 'txId', 'CounterParty ID']
            print(res[[c for c in cols if c in res.columns]].to_string(index=False))

except Exception as e:
    print(f"Error: {e}")
