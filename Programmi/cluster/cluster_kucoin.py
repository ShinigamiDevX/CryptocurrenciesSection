import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

import pandas as pd

from cluster_utils import (
    decrypt_excel_if_needed,
    is_evm_address,
    resolve_chain_with_reactor_search,
    salva_e_avvisa,
    trova_foglio,
)

# Ticker nativi: la chain è il coin, senza chiamate esterne.
KUCOIN_NATIVE = {
    "ETH": "ETHEREUM_MAINNET",
    "BNB": "BNB_SMART_CHAIN_MAINNET",
    "BTC": "BITCOIN_MAINNET",
    "LTC": "LITECOIN_MAINNET",
    "DASH": "DASH_MAINNET",
    "SOL": "SOLANA_MAINNET",
    "TRX": "TRON_MAINNET",
    "POL": "POLYGON_POS_MAINNET",
    "MATIC": "POLYGON_POS_MAINNET",
}

# Non supportati da Reactor: esclusi subito, niente RPC.
KUCOIN_UNSUPPORTED = {"XMR", "KCS", "MONERO", "KCC"}
STABLES = {"USDT", "USDC"}


def _is_inner(value):
    return str(value).strip().lower() in ("yes", "true", "1", "y")


def _is_tron(addr):
    a = str(addr).strip()
    return a.startswith("T") and 30 <= len(a) <= 36


def _wallet_of(row):
    return str(row.get("address") or "").strip()


def infer_kucoin_asset(coin, address, reactor_hits):
    coin = str(coin or "").strip().upper()
    addr = str(address or "").strip()
    if coin in KUCOIN_NATIVE:
        return KUCOIN_NATIVE[coin]
    if coin in STABLES:
        if _is_tron(addr):
            return "TRON_MAINNET"
        if is_evm_address(addr):
            return reactor_hits.get(addr) or ""
    return ""


def prefetch_reactor(addresses):
    unique = []
    seen = set()
    for addr in addresses:
        if addr and addr not in seen and is_evm_address(addr):
            seen.add(addr)
            unique.append(addr)
    hits = {}
    if not unique:
        return hits
    print(f"Reactor: {len(unique)} indirizzi EVM unici (USDT/USDC)...")
    workers = min(8, len(unique))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futs = {pool.submit(resolve_chain_with_reactor_search, addr): addr for addr in unique}
        for fut in as_completed(futs):
            addr = futs[fut]
            try:
                hits[addr] = fut.result()
            except Exception as exc:
                print(f"[Reactor] fallito {addr[:14]}...: {exc}")
                hits[addr] = None
    return hits


def esegui_cluster(file_input, file_output, **_kwargs):
    print(f"Lettura di {file_input}...")
    xls = pd.ExcelFile(file_input)
    df_depositi = pd.read_excel(xls, trova_foglio(xls, "DepositHistory"))
    df_prelievi = pd.read_excel(xls, trova_foglio(xls, "WithdrawHistory"))
    df_depositi.columns = [str(c).strip().lower() for c in df_depositi.columns]
    df_prelievi.columns = [str(c).strip().lower() for c in df_prelievi.columns]

    evm_stables = []
    for _, row in pd.concat([df_depositi, df_prelievi], ignore_index=True).iterrows():
        coin = str(row.get("coin") or "").strip().upper()
        addr = _wallet_of(row)
        if coin in STABLES and is_evm_address(addr):
            evm_stables.append(addr)
    reactor_hits = prefetch_reactor(evm_stables)

    depositi = []
    prelievi = []
    avvisi = []

    if not df_depositi.empty:
        for _, row in df_depositi.iterrows():
            if _is_inner(row.get("is_inner")):
                continue
            coin = str(row.get("coin") or "").strip().upper()
            addr = _wallet_of(row)
            tx_hash = str(row.get("hash") or "").strip()
            if coin in KUCOIN_UNSUPPORTED:
                avvisi.append({
                    "Type": "deposit",
                    "Deposit Address or Hash": addr,
                    "Output index or Counterparty Address": "",
                    "Asset": coin,
                    "Motivo esclusione": "Mainnet non supportata da reactor.chainalysis",
                })
                continue
            asset = infer_kucoin_asset(coin, addr, reactor_hits)
            depositi.append({
                "Type": "deposit",
                "Deposit Address or Hash": addr,
                "Output index or Counterparty Address": "",
                "Asset": asset or coin,
                "_trm_asset": coin,
                "_trm_network": "",
                "_trm_tx_hash": tx_hash,
            })

    if not df_prelievi.empty:
        for _, row in df_prelievi.iterrows():
            coin = str(row.get("coin") or "").strip().upper()
            addr = _wallet_of(row)
            tx_hash = str(row.get("hash") or "").strip()
            if coin in KUCOIN_UNSUPPORTED:
                avvisi.append({
                    "Type": "sent",
                    "Deposit Address or Hash": tx_hash,
                    "Output index or Counterparty Address": addr,
                    "Asset": coin,
                    "Motivo esclusione": "Mainnet non supportata da reactor.chainalysis",
                })
                continue
            asset = infer_kucoin_asset(coin, addr, reactor_hits)
            prelievi.append({
                "Type": "sent",
                "Deposit Address or Hash": tx_hash,
                "Output index or Counterparty Address": addr,
                "Asset": asset or coin,
                "_trm_asset": coin,
                "_trm_network": "",
            })

    df_finale = pd.concat(
        [pd.DataFrame(depositi), pd.DataFrame(prelievi)],
        ignore_index=True,
    )
    if df_finale.empty:
        print("Nessun dato trovato da esportare.")
        return
    df_finale = df_finale.drop_duplicates(
        subset=["Deposit Address or Hash", "Asset"], keep="first"
    )
    print(f"Righe da esportare: {len(df_finale)} (avvisi locali: {len(avvisi)})")
    salva_e_avvisa(df_finale, file_output, avvisi_extra=avvisi)


def main():
    if len(sys.argv) < 2:
        print("Uso: python cluster_kucoin.py <file.xlsx> [output.csv]")
        sys.exit(1)
    file_da_caricare = decrypt_excel_if_needed(sys.argv[1], os.environ.get("EXCEL_PASSWORD"))
    file_output = sys.argv[2] if len(sys.argv) > 2 else "cluster_kucoin.csv"
    esegui_cluster(file_da_caricare, file_output)


if __name__ == "__main__":
    main()
