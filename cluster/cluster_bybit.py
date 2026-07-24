import pandas as pd
from cluster_utils import MAPPATURA_ASSET_CLUSTER, postprocessa_asset, salva_e_avvisa
from cluster_utils import asset_output_finale



import requests
from cluster_utils import RPC_API, chainalysis_auth_header, is_probably_stellar_address

CHAINALYSIS_STATS = {
    "attempts": 0,
    "hits": 0,
    "http_ok_no_data": 0,
    "errors": 0,
    "skipped_no_chain": 0,
    "skipped_no_chainalysis_endpoint": 0,
}

def get_asset_bybit(coin, address):
    primi = [t[0] for t in MAPPATURA_ASSET_CLUSTER]
    coin = str(coin).strip().upper()
    address = str(address).strip()
    coin_post = postprocessa_asset(coin)
    if coin_post != coin:
        return coin_post
    if coin in primi:
        return postprocessa_asset(coin)
    # 2. Prefissi/quarto valore
    # Escludi hash di transazione a 64 hex dal prefix check (non sono indirizzi wallet)
    _is_raw_tx_hash = len(address) == 64 and all(c in '0123456789abcdefABCDEF' for c in address)
    if not _is_raw_tx_hash:
        for t in MAPPATURA_ASSET_CLUSTER:
            if len(t) >= 4:
                prefissi = t[3]
                if isinstance(prefissi, str):
                    prefissi = [prefissi]
                for pref in prefissi:
                    if address.startswith(pref):
                        if t[2] == "STELLAR_MAINNET" and not is_probably_stellar_address(address):
                            continue
                        return postprocessa_asset(t[2])
    # 3. Fallback: usa RPC_API (Chainalysis)
    for t in MAPPATURA_ASSET_CLUSTER:
        if coin == t[0]:
            chain_key = t[2]
            break
    else:
        chain_key = None
    if not chain_key:
        CHAINALYSIS_STATS["skipped_no_chain"] += 1
        return ""
    endpoints = RPC_API.get(chain_key, [])
    chainalysis_urls = [url for url in endpoints if "chainalysis.com" in url]
    if not chainalysis_urls:
        CHAINALYSIS_STATS["skipped_no_chainalysis_endpoint"] += 1
        return ""
    for url in chainalysis_urls:
        url_test = url.replace("<address>", address)
        try:
            CHAINALYSIS_STATS["attempts"] += 1
            r = requests.get(url_test, headers=chainalysis_auth_header(), timeout=10)
            if r.status_code == 200:
                data = r.json()
                if isinstance(data, dict) and data:
                    CHAINALYSIS_STATS["hits"] += 1
                    return postprocessa_asset(chain_key)
                CHAINALYSIS_STATS["http_ok_no_data"] += 1
        except Exception:
            CHAINALYSIS_STATS["errors"] += 1
            continue
    # Fallback finale
    return ""

def _trova_foglio(xls, nome):
    """Cerca il nome del foglio in modo case-insensitive."""
    for s in xls.sheet_names:
        if s.strip().lower() == nome.strip().lower():
            return s
    return None

def _normalizza_colonne(df):
    """Rinomina le colonne in minuscolo (mantiene spazi e underscore invariati)."""
    df.columns = [str(c).strip().lower() for c in df.columns]
    return df

def esegui_bybit(file_input, file_output):
    for key in CHAINALYSIS_STATS:
        CHAINALYSIS_STATS[key] = 0

    xls = pd.ExcelFile(file_input)
    depositi = []
    prelievi = []
    # --- DEPOSIT HISTORY ---
    nome_dep = _trova_foglio(xls, "Deposit history")
    if nome_dep is None:
        print("! Attenzione: foglio 'Deposit history' non trovato.")
        df_depositi = pd.DataFrame()
    else:
        df_depositi = _normalizza_colonne(pd.read_excel(xls, nome_dep))
    seen = set()
    import os as _os
    _trm_mode = _os.environ.get('OUTPUT_SERVICE', '').lower() == 'trm'
    for _, row in df_depositi.iterrows():
        coin = str(row.get("coin", "")).strip().upper()
        to_address = str(row.get("to_address", "")).strip()
        if not to_address or to_address.lower() == 'nan':
            continue
        asset = asset_output_finale(coin, to_address)
        if not _trm_mode:
            if (to_address, asset) in seen:
                continue
            seen.add((to_address, asset))
        tx_id_dep = str(row.get("tx_id", "")).strip()
        if tx_id_dep.lower() in ('nan', 'none', ''):
            tx_id_dep = ''
        depositi.append({
            "Type": "deposit",
            "Deposit Address or Hash": to_address,
            "Output index or Counterparty Address": "",
            "Asset": asset,
            "_trm_asset": coin,
            "_trm_network": "",
            "_trm_tx_hash": tx_id_dep,
        })
    # --- WITHDRAWAL HISTORY ---
    nome_pre = _trova_foglio(xls, "Withdrawal history")
    if nome_pre is None:
        print("! Attenzione: foglio 'Withdrawal history' non trovato.")
        df_prelievi = pd.DataFrame()
    else:
        df_prelievi = _normalizza_colonne(pd.read_excel(xls, nome_pre))
    avvisi = []
    for _, row in df_prelievi.iterrows():
        coin = str(row.get("coin", "")).strip().upper()
        to_address = str(row.get("to_address", "")).strip()
        tx_id = str(row.get("tx_id", "")).strip()
        data_src_desc = str(row.get("data_src_desc", "")).strip().lower()
        if data_src_desc == "fiat":
            avvisi.append({
                "Coin": coin,
                "Indirizzo destinatario": to_address if to_address and to_address.lower() != 'nan' else "N/D",
                "Transaction ID": tx_id if tx_id and tx_id.lower() != 'nan' else "N/D",
                "Motivo esclusione": "Prelievo in fiat"
            })
            continue
        if not to_address or to_address.lower() == 'nan':
            avvisi.append({
                "Coin": coin,
                "Indirizzo destinatario": "N/D",
                "Transaction ID": tx_id if tx_id and tx_id.lower() != 'nan' else "N/D",
                "Motivo esclusione": "Probabile movimentazione interna"
            })
            continue
        if not tx_id or tx_id.lower() == 'nan':
            continue
        asset = get_asset_bybit(coin, to_address)
        prelievi.append({
            "Type": "sent",
            "Deposit Address or Hash": tx_id,
            "Output index or Counterparty Address": to_address,
            "Asset": asset,
            "_trm_asset": coin,
            "_trm_network": "",
        })
    # Unisci e salva
    df_finale = pd.DataFrame(depositi + prelievi)
    avvisi.append(
        (
            "[CHAINALYSIS] attempts={attempts}, hits={hits}, http_ok_no_data={http_ok_no_data}, "
            "errors={errors}, skipped_no_chain={skipped_no_chain}, "
            "skipped_no_chainalysis_endpoint={skipped_no_chainalysis_endpoint}"
        ).format(**CHAINALYSIS_STATS)
    )
    salva_e_avvisa(df_finale, file_output, avvisi)

if __name__ == "__main__":
    import sys, os
    from cluster_utils import decrypt_excel_if_needed
    if len(sys.argv) < 2:
        print("Uso: python cluster_bybit.py <file.xlsx> [output.csv]")
        sys.exit(1)
    file_da_caricare = sys.argv[1]
    file_output = sys.argv[2] if len(sys.argv) > 2 else "cluster_bybit.csv"
    file_da_caricare = decrypt_excel_if_needed(file_da_caricare, os.environ.get('EXCEL_PASSWORD'))
    esegui_bybit(file_da_caricare, file_output)
