import io
import os
import sys

import pandas as pd

from cluster_utils import (
    MAPPATURA_ASSET_CLUSTER,
    asset_output_finale,
    decrypt_excel_if_needed,
    elimina_duplicati_depositi,
    get_col,
    is_probably_monero_address,
    postprocessa_asset,
    salva_e_avvisa,
)


def asset_okx(currency, address):
    primi = [str(t[0]).strip().upper() for t in MAPPATURA_ASSET_CLUSTER]
    currency_up = str(currency).strip().upper()
    address_str = str(address).strip()
    currency_post = postprocessa_asset(currency_up)
    if currency_post != currency_up:
        return currency_post
    if currency_up in primi:
        return postprocessa_asset(currency_up)
    _is_raw_tx_hash = len(address_str) == 64 and all(
        c in "0123456789abcdefABCDEF" for c in address_str
    )
    if not _is_raw_tx_hash:
        for t in MAPPATURA_ASSET_CLUSTER:
            if len(t) >= 4:
                prefissi = t[3]
                if isinstance(prefissi, str):
                    prefissi = [prefissi]
                for pref in prefissi:
                    if address_str.startswith(pref):
                        return postprocessa_asset(t[2])
    if not _is_raw_tx_hash and not any(
        address_str.startswith(p)
        for t in MAPPATURA_ASSET_CLUSTER
        if len(t) >= 4
        for p in (t[3] if isinstance(t[3], (tuple, list)) else [t[3]])
    ):
        if is_probably_monero_address(address_str):
            return ""
        if all(x not in address_str for x in ["0", "O", "I", "l"]):
            return postprocessa_asset("SOLANA_MAINNET")
    return ""


def _decifra_se_necessario(file_input, password=None):
    try:
        import msoffcrypto

        with open(file_input, "rb") as fh:
            office = msoffcrypto.OfficeFile(fh)
            if not office.is_encrypted():
                return None
            passwords_da_provare = [
                p for p in [password, "", "123456", "888888", "000000"] if p is not None
            ]
            for pwd in passwords_da_provare:
                try:
                    fh.seek(0)
                    office2 = msoffcrypto.OfficeFile(fh)
                    office2.load_key(password=pwd)
                    buf = io.BytesIO()
                    office2.decrypt(buf)
                    buf.seek(0)
                    return buf
                except Exception:
                    continue
            print(
                "\n[ERRORE] Il file Excel è protetto da password.\n"
                "Aprire il file e rimuovere la password, poi ricaricare.\n",
                file=sys.stderr,
            )
            raise ValueError("File Excel protetto da password sconosciuta.")
    except ImportError:
        return None
    except ValueError:
        raise
    except Exception:
        return None


def _open_excel(file_input, password=None):
    raw = _decifra_se_necessario(file_input, password)
    sorgente = raw if raw is not None else file_input
    try:
        return pd.ExcelFile(sorgente, engine="openpyxl")
    except Exception:
        if raw is not None:
            raw.seek(0)
    try:
        return pd.ExcelFile(sorgente, engine="xlrd")
    except Exception:
        if raw is not None:
            raw.seek(0)
    raise ValueError("Impossibile leggere il file Excel OKX.")


def _foglio_inizia_con(name, prefix):
    return str(name).strip().lower().startswith(str(prefix).strip().lower())


def _fogli_per_prefisso(xls, prefix):
    return [s for s in xls.sheet_names if _foglio_inizia_con(s, prefix)]


def _normalizza_df_okx(df):
    if df is None:
        return pd.DataFrame()
    out = df.copy()
    out.columns = [str(c).strip().lower() for c in out.columns]
    renames = {}
    if "currency_name" in out.columns and "currency" not in out.columns:
        renames["currency_name"] = "currency"
    if "coin" in out.columns and "currency" not in out.columns:
        renames["coin"] = "currency"
    if "currency_chain_name" in out.columns and "network" not in out.columns:
        renames["currency_chain_name"] = "network"
    if "chain name" in out.columns and "network" not in out.columns:
        renames["chain name"] = "network"
    if "hash" in out.columns and "txid" not in out.columns:
        renames["hash"] = "txid"
    if "tx_id" in out.columns and "txid" not in out.columns:
        renames["tx_id"] = "txid"
    for c in list(out.columns):
        if c not in renames and c.replace(" ", "") == "txid" and "txid" not in out.columns:
            renames[c] = "txid"
    if renames:
        out = out.rename(columns=renames)
    return out


def _ha_colonne_storico(df):
    cols = set(df.columns)
    return "currency" in cols and "address" in cols


def _leggi_foglio(xls, prefix):
    for sheet in _fogli_per_prefisso(xls, prefix):
        try:
            df = _normalizza_df_okx(xls.parse(sheet))
            if _ha_colonne_storico(df) or "address" in df.columns:
                return df
        except Exception:
            continue
    return pd.DataFrame()


def _nome_foglio_trovato(xls, prefix):
    for sheet in _fogli_per_prefisso(xls, prefix):
        try:
            df = _normalizza_df_okx(xls.parse(sheet))
            if _ha_colonne_storico(df) or "address" in df.columns:
                return sheet
        except Exception:
            continue
    fogli = _fogli_per_prefisso(xls, prefix)
    return fogli[0] if fogli else None


def _filtra_inner(df):
    if df.empty or "address" not in df.columns:
        return df
    return df[~df["address"].astype(str).str.startswith("INNER_")]


def _currency_of(row):
    return str(get_col(row, "currency", "") or get_col(row, "currency_name", "")).strip()


def _network_of(row):
    return str(get_col(row, "network", "") or get_col(row, "currency_chain_name", "")).strip()


def _val_ok(s):
    s = str(s or "").strip()
    return s and s.lower() not in ("nan", "none")


def esegui_cluster_okx(file_input, file_output):
    xls = _open_excel(file_input)
    trm_mode = os.environ.get("OUTPUT_SERVICE", "").lower() == "trm"
    avvisi = []

    dep_sheet = _nome_foglio_trovato(xls, "deposit")
    wd_sheet = _nome_foglio_trovato(xls, "withdraw")
    df_dep_raw = _filtra_inner(_leggi_foglio(xls, "deposit"))
    df_wd_raw = _filtra_inner(_leggi_foglio(xls, "withdraw"))

    print(f"OKX deposit (prefisso): foglio={dep_sheet!r}, righe={len(df_dep_raw)}")
    print(f"OKX withdraw (prefisso): foglio={wd_sheet!r}, righe={len(df_wd_raw)}")
    if wd_sheet and df_wd_raw.empty:
        avvisi.append({
            "Type": "info",
            "Deposit Address or Hash": "",
            "Output index or Counterparty Address": "",
            "Asset": "",
            "Motivo esclusione": f"Foglio {wd_sheet!r} trovato ma senza prelievi (0 righe).",
        })
    elif not wd_sheet:
        avvisi.append({
            "Type": "info",
            "Deposit Address or Hash": "",
            "Output index or Counterparty Address": "",
            "Asset": "",
            "Motivo esclusione": "Nessun foglio il cui nome inizia con 'withdraw'.",
        })

    deposit = pd.DataFrame()
    if not df_dep_raw.empty:
        rows = []
        for _, row in df_dep_raw.iterrows():
            currency = _currency_of(row)
            address = str(get_col(row, "address", "")).strip()
            txid = str(get_col(row, "txid", "")).strip()
            if not _val_ok(address):
                continue
            asset = asset_okx(currency, address) or asset_output_finale(currency, address)
            if trm_mode:
                asset = asset or "UNKNOWN"
            rows.append({
                "Type": "deposit",
                "Deposit Address or Hash": address,
                "Output index or Counterparty Address": "",
                "Asset": asset,
                "_trm_asset": currency,
                "_trm_network": _network_of(row),
                "_trm_tx_hash": txid if _val_ok(txid) else "",
            })
        deposit = pd.DataFrame(rows)
        deposit = elimina_duplicati_depositi(deposit)
        print(f"OKX depositi esportati: {len(deposit)}")

    withdraw = pd.DataFrame()
    if not df_wd_raw.empty:
        rows = []
        for _, row in df_wd_raw.iterrows():
            currency = _currency_of(row)
            address = str(get_col(row, "address", "")).strip()
            txid = str(get_col(row, "txid", "")).strip()
            if not _val_ok(address) or not _val_ok(txid):
                continue
            asset = asset_okx(currency, address) or asset_output_finale(currency, address)
            if trm_mode:
                asset = asset or "UNKNOWN"
            rows.append({
                "Type": "sent",
                "Deposit Address or Hash": txid,
                "Output index or Counterparty Address": address,
                "Asset": asset,
                "_trm_asset": currency,
                "_trm_network": _network_of(row),
            })
        withdraw = pd.DataFrame(rows)
        print(f"OKX prelievi esportati: {len(withdraw)}")

    df_finale = pd.concat([deposit, withdraw], ignore_index=True)
    if df_finale.empty:
        fogli = ", ".join(xls.sheet_names)
        raise ValueError(
            "Nessun deposito/prelievo OKX trovato. "
            f"Fogli: {fogli}."
        )
    salva_e_avvisa(df_finale, file_output, avvisi_extra=avvisi)


def main():
    if len(sys.argv) < 2:
        print("Uso: python cluster_okx.py <file.xlsx> [output.csv]")
        sys.exit(1)
    file_da_caricare = decrypt_excel_if_needed(sys.argv[1], os.environ.get("EXCEL_PASSWORD"))
    file_output = sys.argv[2] if len(sys.argv) > 2 else "cluster_okx.csv"
    esegui_cluster_okx(file_da_caricare, file_output)


if __name__ == "__main__":
    main()
