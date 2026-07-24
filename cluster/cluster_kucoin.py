
import requests
import json
from cluster_utils import postprocessa_asset, MAPPATURA_ASSET_CLUSTER, RPC_API, chainalysis_auth_header

def normalizzatore_asset_kucoin(asset, indirizzo=None, network=None):
    asset = str(asset).strip().upper()
    indirizzo = str(indirizzo) if indirizzo is not None else ""
    # 1. Prefissi/quarto valore MAPPATURA_ASSET_CLUSTER
    # Escludi hash di transazione a 64 hex (non sono indirizzi wallet)
    _is_raw_tx_hash = len(indirizzo) == 64 and all(c in '0123456789abcdefABCDEF' for c in indirizzo)
    if not _is_raw_tx_hash:
        for tupla in MAPPATURA_ASSET_CLUSTER:
            if len(tupla) > 3:
                prefissi = tupla[3]
                if isinstance(prefissi, str):
                    prefissi = [prefissi]
                for pref in prefissi:
                    if indirizzo.startswith(pref):
                        return postprocessa_asset(tupla[2])
    # 2. Mapping diretto
    for tupla in MAPPATURA_ASSET_CLUSTER:
        if asset == tupla[0] or asset == tupla[2]:
            return postprocessa_asset(tupla[2])
    # 3. Fallback: usa RPC_API (Chainalysis)
    for tupla in MAPPATURA_ASSET_CLUSTER:
        if asset == tupla[0]:
            chain_key = tupla[2]
            break
    else:
        chain_key = None
    if not chain_key:
        return postprocessa_asset(asset)
    endpoints = RPC_API.get(chain_key, [])
    for url in endpoints:
        if "chainalysis.com" in url:
            url_test = url.replace("<address>", indirizzo)
            try:
                r = requests.get(url_test, headers=chainalysis_auth_header(), timeout=10)
                print(f"[DEBUG Chainalysis] URL: {url_test} | Status: {r.status_code}")
                try:
                    data = r.json()
                    print(f"[DEBUG Chainalysis] Response: {json.dumps(data)[:300]}")
                except Exception:
                    print(f"[DEBUG Chainalysis] Non-JSON response: {r.text[:200]}")
                if r.status_code == 200:
                    data = r.json()
                    if isinstance(data, dict) and data:
                        return postprocessa_asset(chain_key)
            except Exception as e:
                print(f"[DEBUG Chainalysis] Exception: {e}")
                continue
    # Fallback finale
    return postprocessa_asset(asset)
import pandas as pd
import os
from cluster_utils import MAPPATURA_ASSET, postprocessa_asset, trova_foglio

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
    # Leggi i fogli
    df_depositi = pd.read_excel(xls, trova_foglio(xls, "DepositHistory"))
    df_prelievi = pd.read_excel(xls, trova_foglio(xls, "WithdrawHistory"))
    df_depositi.columns = [str(c).strip().lower() for c in df_depositi.columns]
    df_prelievi.columns = [str(c).strip().lower() for c in df_prelievi.columns]

    # Helper per asset
    from cluster_utils import MAPPATURA_ASSET_CLUSTER
    from cluster_utils import asset_output_finale
    def asset_kucoin(coin, address):
        return asset_output_finale(coin, address)

    # Depositi
    depositi = pd.DataFrame()
    if not df_depositi.empty:
        depositi = pd.DataFrame({
            "Type": "deposit",
            "Deposit Address or Hash": df_depositi["address"],
            "Output index or Counterparty Address": "",
            "Asset": [asset_kucoin(row["coin"], row["address"]) for _, row in df_depositi.iterrows()],
            "_trm_asset": df_depositi["coin"].astype(str).str.strip().values,
            "_trm_network": "",
            "_trm_tx_hash": df_depositi["hash"].astype(str).str.strip().values if "hash" in df_depositi.columns else "",
        })

    # Prelievi
    prelievi = pd.DataFrame()
    if not df_prelievi.empty:
        prelievi = pd.DataFrame({
            "Type": "sent",
            "Deposit Address or Hash": df_prelievi["hash"],
            "Output index or Counterparty Address": df_prelievi["address"],
            "Asset": [asset_kucoin(row["coin"], row["address"]) for _, row in df_prelievi.iterrows()],
            "_trm_asset": df_prelievi["coin"].astype(str).str.strip().values,
            "_trm_network": "",
        })

    # Unisci e salva
    df_finale = pd.concat([depositi, prelievi], ignore_index=True)
    # Rimuovi duplicati sulla coppia (Deposit Address, Asset) per consentire lo stesso indirizzo su chain diverse
    df_finale = df_finale.drop_duplicates(subset=["Deposit Address or Hash", "Asset"], keep="first")
    from cluster_utils import salva_e_avvisa
    salva_e_avvisa(df_finale, file_output)

def main():
    import sys, os
    from cluster_utils import decrypt_excel_if_needed
    if len(sys.argv) < 2:
        print("Uso: python cluster_kucoin.py <file.xlsx> [output.csv]")
        sys.exit(1)
    file_da_caricare = sys.argv[1]
    file_output = sys.argv[2] if len(sys.argv) > 2 else 'cluster_kucoin.csv'
    file_da_caricare = decrypt_excel_if_needed(file_da_caricare, os.environ.get('EXCEL_PASSWORD'))

    esegui_cluster(
        file_input=file_da_caricare,
        file_output=file_output,
        foglio_depositi="DepositHistory",
        colonna_indirizzo_deposito="address",
        colonna_asset_deposito="coin",
        foglio_prelievi="WithdrawHistory",
        colonna_indirizzo_prelievo="hash",
        colonna_destinatario_prelievo="address",
        colonna_asset_prelievo="coin",
        normalizza_header=True,
        normalizzatore_asset_deposito=normalizzatore_asset_kucoin,
        normalizzatore_asset_prelievo=normalizzatore_asset_kucoin
    )

if __name__ == "__main__":
    main()
