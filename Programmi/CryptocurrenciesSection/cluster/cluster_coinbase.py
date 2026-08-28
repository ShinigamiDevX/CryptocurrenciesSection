import pandas as pd
import os
from cluster_utils import MAPPATURA_ASSET, MAPPATURA_ASSET_CLUSTER, postprocessa_asset, asset_output_finale, trova_foglio

def normalizzatore_asset_coinbase(asset, indirizzo=None, network=None, deposito=False):
    if deposito:
        # Foglio Deposit Addresses
        asset = str(asset).strip().split()[-1].upper()
        indirizzo = str(indirizzo) if indirizzo is not None else ""
        return asset_output_finale(asset, indirizzo)
    else:
        # Foglio Transaction History
        asset_up = str(asset).strip().upper()
        network_low = str(network).strip().lower() if network is not None else None
        primi_valori = [str(item[0]).strip().upper() for item in MAPPATURA_ASSET_CLUSTER]
        print(f"DEBUG asset_up: '{asset_up}' | network_low: '{network_low}' | primi_valori: {primi_valori}")

        # Se il valore della colonna Network corrisponde al secondo elemento di una tupla, restituisci il terzo elemento
        if network_low:
            for item in MAPPATURA_ASSET_CLUSTER:
                if len(item) >= 3:
                    v = item[1]
                    asset_map = item[2]
                    if network_low == str(v).strip().lower():
                        print(f"DEBUG: network_low '{network_low}' trovato in MAPPATURA_ASSET_CLUSTER, restituisco '{asset_map}' (regola network->asset)")
                        return postprocessa_asset(asset_map)

        # Altrimenti, mantieni la logica precedente
        if asset_up in primi_valori:
            print(f"DEBUG: asset_up '{asset_up}' trovato tra i primi valori, restituisco '{asset_up}' (regola 1)")
            return postprocessa_asset(asset_up)

        if network_low:
            print(f"DEBUG: fallback network_low '{network_low.upper().replace('-', '_')}' (regola 3)")
            return postprocessa_asset(network_low.upper().replace('-', '_'))
        else:
            print(f"DEBUG: fallback asset_up '{asset_up}' (regola 3)")
            return postprocessa_asset(asset_up)

def esegui_cluster(
    file_input,
    file_output,
    foglio_depositi,
    colonna_indirizzo_deposito,
    colonna_asset_deposito,
    foglio_prelievi,
    colonna_indirizzo_prelievo,
    colonna_destinatario_prelievo,
    colonna_asset_prelievo,
    colonna_network_prelievo=None,
    colonna_network_deposito=None,
    normalizzatore_asset=None,
    normalizzatore_asset_deposito=None,
    normalizzatore_asset_prelievo=None,
    normalizza_header=False,
    filtro_righe_prelievo=None
):
    print(f"Lettura di {file_input}...")
    xls = pd.ExcelFile(file_input)
    foglio_depositi = trova_foglio(xls, foglio_depositi)
    foglio_prelievi = trova_foglio(xls, foglio_prelievi)
    colonna_asset_deposito = colonna_asset_deposito.strip().lower()
    colonna_indirizzo_deposito = colonna_indirizzo_deposito.strip().lower()
    if colonna_network_deposito:
        colonna_network_deposito = colonna_network_deposito.strip().lower()
    colonna_asset_prelievo = colonna_asset_prelievo.strip().lower()
    if colonna_network_prelievo:
        colonna_network_prelievo = colonna_network_prelievo.strip().lower()
    colonna_indirizzo_prelievo = colonna_indirizzo_prelievo.strip().lower()
    colonna_destinatario_prelievo = colonna_destinatario_prelievo.strip().lower()

    # Depositi
    df_depositi = pd.read_excel(xls, foglio_depositi)
    df_depositi.columns = [c.strip().lower() for c in df_depositi.columns]
    # Normalizza asset deposito
    if normalizzatore_asset_deposito:
        df_depositi['Asset_Normalizzato'] = df_depositi.apply(
            lambda row: normalizzatore_asset_deposito(
                row[colonna_asset_deposito],
                row[colonna_indirizzo_deposito] if colonna_indirizzo_deposito in row else None,
                row[colonna_network_deposito] if colonna_network_deposito and colonna_network_deposito in row else None
            ), axis=1)

    # Prelievi
    df_prelievi = pd.read_excel(xls, foglio_prelievi)
    df_prelievi.columns = [c.strip().lower() for c in df_prelievi.columns]
    # Filtro righe prelievo
    if filtro_righe_prelievo:
        df_prelievi = df_prelievi[filtro_righe_prelievo(df_prelievi)]
    # Normalizza asset prelievo
    if normalizzatore_asset_prelievo:
        def normalizza_e_debug(row):
            asset_val = row[colonna_asset_prelievo]
            network_val = row[colonna_network_prelievo] if colonna_network_prelievo and colonna_network_prelievo in row else None
            print(f"DEBUG Transaction History - Currency: {asset_val} | Network: {network_val}")
            return normalizzatore_asset_prelievo(
                asset_val,
                row[colonna_indirizzo_prelievo] if colonna_indirizzo_prelievo in row else None,
                network_val
            )
        df_prelievi['Asset_Normalizzato'] = df_prelievi.apply(normalizza_e_debug, axis=1)

    # Forza la presenza della colonna Asset normalizzata in entrambi i DataFrame
    if 'Asset_Normalizzato' in df_depositi.columns:
        df_depositi['Asset'] = df_depositi['Asset_Normalizzato']
    elif 'Asset' not in df_depositi.columns:
        df_depositi['Asset'] = None

    if 'Asset_Normalizzato' in df_prelievi.columns:
        df_prelievi['Asset'] = df_prelievi['Asset_Normalizzato']
    elif 'Asset' not in df_prelievi.columns:
        df_prelievi['Asset'] = None

    df_depositi['Tipo'] = 'Deposito'
    df_prelievi['Tipo'] = 'Prelievo'
    # DEBUG: mostra i primi valori delle colonne chiave dei prelievi
    colonne_debug = [c for c in ['Currency', 'Network', 'Asset', 'Asset_Normalizzato'] if c in df_prelievi.columns]
    print('DEBUG df_prelievi head:')
    print(df_prelievi[colonne_debug].head(20))

    colonne_comuni = list(set(df_depositi.columns) & set(df_prelievi.columns))
    df_finale = pd.concat([
        df_depositi[colonne_comuni + ['Tipo']],
        df_prelievi[colonne_comuni + ['Tipo']]
    ], ignore_index=True)

    # DEBUG: mostra i primi valori delle colonne chiave del file finale subito dopo la concatenazione
    colonne_debug = [c for c in ['Asset', 'Asset_Normalizzato', 'Tipo'] if c in df_finale.columns]
    print('DEBUG df_finale appena concatenato:')
    print(df_finale[colonne_debug].head(20))

    # Ricrea la colonna Asset prendendo sempre quella normalizzata se esiste
    if 'Asset_Normalizzato' in df_finale.columns:
        df_finale['Asset'] = df_finale['Asset_Normalizzato']

    # DEBUG: mostra i primi valori delle colonne chiave del file finale dopo la forzatura
    colonne_debug = [c for c in ['Asset', 'Asset_Normalizzato', 'Tipo'] if c in df_finale.columns]
    print('DEBUG df_finale dopo forzatura Asset:')
    print(df_finale[colonne_debug].head(20))

    # Stampa il path del file che verrà scritto
    print(f"DEBUG: Salverò il file CSV in: {file_output}")

    # Stampa il DataFrame finale prima del salvataggio
    print('DEBUG DataFrame finale prima del salvataggio:')
    print(df_finale.head(20))

    from cluster_utils import salva_e_avvisa
    salva_e_avvisa(df_finale, file_output)

    # Stampa le prime righe del file appena scritto
    if os.path.exists(file_output):
        print('DEBUG Prime righe del file appena scritto:')
        with open(file_output) as f:
            file_lines = [f.readline().strip() for _ in range(21)]
        for line in file_lines:
            print(line)

        # Confronta riga per riga la colonna Asset tra DataFrame e file
        print('DEBUG Confronto colonna Asset tra DataFrame e file:')
        import csv
        with open(file_output, newline='') as csvfile:
            reader = csv.DictReader(csvfile)
            for i, (idx, row) in enumerate(zip(df_finale.index, reader)):
                if i >= 20:
                    break
                asset_df = df_finale.loc[idx, 'Asset'] if 'Asset' in df_finale.columns else None
                asset_file = row['Asset'] if 'Asset' in row else None
                print(f"Riga {i}: DataFrame='{asset_df}' | File='{asset_file}'")

def main():
    import sys
    import numpy as np
    if len(sys.argv) < 2:
        print("Uso: python cluster_coinbase.py <file.xlsx> [output.csv]")
        sys.exit(1)
    file_da_caricare = sys.argv[1]
    file_output = sys.argv[2] if len(sys.argv) > 2 else 'cluster_coinbase.csv'
    def filtro_coinbase_prelievi(df):
        colmap = {str(c).strip().lower(): c for c in df.columns}
        type_col = colmap.get('type')
        hash_col = colmap.get('transaction hash')
        if not type_col or not hash_col:
            return pd.Series(False, index=df.index)
        mask_type = df[type_col].astype(str).str.strip().str.lower() == 'send'
        mask_hash = df[hash_col].astype(str).str.strip().replace({'nan':'','None':''}) != ''
        mask_hash &= ~df[hash_col].isna()
        return mask_type & mask_hash
    esegui_cluster(
        file_input=file_da_caricare,
        file_output=file_output,
        foglio_depositi="Deposit Addresses",
        colonna_indirizzo_deposito="Address",
        colonna_asset_deposito="Asset Type",
        foglio_prelievi="Transaction History",
        colonna_indirizzo_prelievo="Transaction Hash",
        colonna_destinatario_prelievo="To",
        colonna_asset_prelievo="Currency",
        colonna_network_prelievo="Network",
        normalizza_header=True,
        filtro_righe_prelievo=filtro_coinbase_prelievi,
        normalizzatore_asset_deposito=lambda asset, indirizzo=None, network=None: normalizzatore_asset_coinbase(asset, indirizzo, network, deposito=True),
        normalizzatore_asset_prelievo=lambda asset, indirizzo=None, network=None: normalizzatore_asset_coinbase(asset, indirizzo, network, deposito=False)
    )

if __name__ == "__main__":
    main()
import pandas as pd
import os

from cluster_utils import esegui_cluster, normalizzatore_asset_coinbase, postprocessa_asset, decrypt_excel_if_needed

def main():
    import sys, os
    import numpy as np
    if len(sys.argv) < 2:
        print("Uso: python cluster_coinbase.py <file.xlsx> [output.csv]")
        sys.exit(1)
    file_da_caricare = sys.argv[1]
    file_output = sys.argv[2] if len(sys.argv) > 2 else 'cluster_coinbase.csv'
    file_da_caricare = decrypt_excel_if_needed(file_da_caricare, os.environ.get('EXCEL_PASSWORD'))
    def filtro_coinbase_prelievi(df):
        colmap = {str(c).strip().lower(): c for c in df.columns}
        type_col = colmap.get('type')
        hash_col = colmap.get('transaction hash')
        if not type_col or not hash_col:
            return pd.Series(False, index=df.index)
        mask_type = df[type_col].astype(str).str.strip().str.lower() == 'send'
        mask_hash = df[hash_col].astype(str).str.strip().replace({'nan':'','None':''}) != ''
        mask_hash &= ~df[hash_col].isna()
        return mask_type & mask_hash
    esegui_cluster(
        file_input=file_da_caricare,
        file_output=file_output,
        foglio_depositi="Deposit Addresses",
        colonna_indirizzo_deposito="Address",
        colonna_asset_deposito="Asset Type",
        foglio_prelievi="Transaction History",
        colonna_indirizzo_prelievo="Transaction Hash",
        colonna_destinatario_prelievo="To",
        colonna_asset_prelievo="Currency",
        colonna_network_prelievo="Network",
        normalizza_header=True,
        filtro_righe_prelievo=filtro_coinbase_prelievi,
        normalizzatore_asset_deposito=lambda asset, indirizzo=None, network=None: postprocessa_asset(normalizzatore_asset_coinbase(asset, indirizzo, network, deposito=True)),
        normalizzatore_asset_prelievo=lambda asset, indirizzo=None, network=None: postprocessa_asset(normalizzatore_asset_coinbase(asset, indirizzo, network, deposito=False))
    )

if __name__ == "__main__":
    main()