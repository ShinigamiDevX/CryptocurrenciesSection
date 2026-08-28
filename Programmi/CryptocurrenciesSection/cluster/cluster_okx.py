import pandas as pd
import io
import sys
from cluster_utils import MAPPATURA_ASSET_CLUSTER, postprocessa_asset, asset_output_finale, trova_foglio, salva_e_avvisa, is_probably_monero_address

def asset_okx(currency, address):
    primi = [str(t[0]).strip().upper() for t in MAPPATURA_ASSET_CLUSTER]
    currency_up = str(currency).strip().upper()
    address_str = str(address).strip()
    currency_post = postprocessa_asset(currency_up)
    if currency_post != currency_up:
        return currency_post
    if currency_up in primi:
        return postprocessa_asset(currency_up)
    # Escludi hash di transazione a 64 hex dal prefix check (non sono indirizzi wallet)
    _is_raw_tx_hash = len(address_str) == 64 and all(c in '0123456789abcdefABCDEF' for c in address_str)
    if not _is_raw_tx_hash:
        for t in MAPPATURA_ASSET_CLUSTER:
            if len(t) >= 4:
                prefissi = t[3]
                if isinstance(prefissi, str):
                    prefissi = [prefissi]
                for pref in prefissi:
                    if address_str.startswith(pref):
                        return postprocessa_asset(t[2])
    if not _is_raw_tx_hash and not any(address_str.startswith(p) for t in MAPPATURA_ASSET_CLUSTER if len(t) >= 4 for p in (t[3] if isinstance(t[3], (tuple, list)) else [t[3]])):
        if is_probably_monero_address(address_str):
            return ""  # Monero: non supportato da Chainalysis, ma gestito da TRM tramite _trm_asset
        if all(x not in address_str for x in ["0", "O", "I", "l"]):
            return postprocessa_asset("SOLANA_MAINNET")
    return ""

def _decifra_se_necessario(file_input, password=None):
    """
    Se il file è cifrato (EncryptedPackage), prova a decifrarlo.
    Restituisce un BytesIO decifrato oppure None se non è cifrato o la password è sbagliata.
    """
    try:
        import msoffcrypto
        with open(file_input, 'rb') as fh:
            office = msoffcrypto.OfficeFile(fh)
            if not office.is_encrypted():
                return None
            passwords_da_provare = [p for p in [password, '', '123456', '888888', '000000'] if p is not None]
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
                "Aprire il file in Excel/LibreOffice, rimuovere la password\n"
                "(File → Proteggi cartella di lavoro → Rimuovi password)\n"
                "e ricaricare il file.\n",
                file=sys.stderr
            )
            raise ValueError("File Excel protetto da password sconosciuta. Rimuovere la password prima di caricarlo.")
    except ImportError:
        return None
    except ValueError:
        raise
    except Exception:
        return None

def _open_excel(file_input, password=None):
    """Apre un file Excel/HTML/CSV rilevando automaticamente il formato."""
    # 0. Decifra se necessario
    raw = _decifra_se_necessario(file_input, password)
    sorgente = raw if raw is not None else file_input

    # 1. xlsx reale
    try:
        return pd.ExcelFile(sorgente, engine='openpyxl')
    except Exception:
        if raw is not None:
            raw.seek(0)

    # 2. xls reale (OLE2, xlrd standard)
    try:
        return pd.ExcelFile(sorgente, engine='xlrd')
    except Exception:
        if raw is not None:
            raw.seek(0)

    # 3. OLE2 con stream workbook dal nome non standard (olefile fallback)
    try:
        import olefile, xlrd
        with olefile.OleFileIO(file_input) as ole:
            for sname in ['Workbook', 'Book']:
                if ole.exists(sname):
                    data = ole.openstream(sname).read()
                    buf = io.BytesIO(data)
                    try:
                        return pd.ExcelFile(buf, engine='xlrd')
                    except Exception:
                        pass
    except Exception:
        pass

    # 4. HTML mascherato da xls (comune con OKX), solo per file non cifrati
    for enc in ['utf-8', 'latin-1', 'utf-16', 'cp1252']:
        try:
            tables = pd.read_html(file_input, encoding=enc)
            if tables:
                class _FakeExcelFile:
                    def __init__(self, tables):
                        self._tables = tables
                        self.sheet_names = [str(i) for i in range(len(tables))]
                    def parse(self, sheet_name=0, **kwargs):
                        idx = self.sheet_names.index(str(sheet_name)) if str(sheet_name) in self.sheet_names else 0
                        return self._tables[idx]
                return _FakeExcelFile(tables)
        except Exception:
            continue

    # 5. CSV con varie codifiche
    for enc in ['utf-8', 'utf-16', 'latin-1', 'cp1252']:
        try:
            df_csv = pd.read_csv(file_input, encoding=enc)
            class _FakeSingleSheet:
                def __init__(self, df):
                    self._df = df
                    self.sheet_names = ['Sheet1']
                def parse(self, sheet_name=0, **kwargs):
                    return self._df
            return _FakeSingleSheet(df_csv)
        except Exception:
            continue

    raise ValueError(
        f"Impossibile leggere il file. "
        "Formati supportati: .xlsx, .xls, HTML-as-xls, CSV. "
        "Verificare che il file non sia corrotto o protetto da password."
    )

def _leggi_foglio(xls, nome):
    """
    Legge un foglio da un ExcelFile reale o fake.
    Se il foglio non esiste per nome, cerca tra tutti i fogli quello
    che contiene le colonne tipiche (currency, address).
    """
    sheet_name = trova_foglio(xls, nome)
    try:
        df = xls.parse(sheet_name)
        cols = [str(c).strip().lower() for c in df.columns]
        if 'currency' in cols or 'address' in cols:
            return df
    except Exception:
        pass
    # Fallback: cerca tra tutti i fogli quello con le colonne giuste
    for s in xls.sheet_names:
        try:
            df = xls.parse(s)
            cols = [str(c).strip().lower() for c in df.columns]
            if 'currency' in cols and 'address' in cols:
                nome_lower = nome.lower().replace('_', '')
                # Per deposit cerca righe con tipo deposit, per withdrawal con txid
                if 'deposit' in nome_lower and 'txid' not in cols:
                    return df
                if 'withdrawal' in nome_lower and 'txid' in cols:
                    return df
        except Exception:
            continue
    # Ultimo fallback: primo foglio disponibile
    try:
        return xls.parse(xls.sheet_names[0])
    except Exception:
        return pd.DataFrame()

def esegui_okx(file_input, file_output):
    xls = _open_excel(file_input)
    depositi = []
    prelievi = []
    # --- DEPOSIT HISTORY ---
    df_depositi = _leggi_foglio(xls, "Deposit_History")
    df_depositi.columns = [str(c).strip().lower() for c in df_depositi.columns]
    seen = set()
    for _, row in df_depositi.iterrows():
        currency = row.get("currency", "")
        address = str(row.get("address", "")).strip()
        if not address:
            continue
        asset = asset_output_finale(currency, address)
        if (address, asset) in seen:
            continue
        seen.add((address, asset))
        depositi.append({
            "Type": "deposit",
            "Deposit Address or Hash": address,
            "Output index or Counterparty Address": "",
            "Asset": asset
        })
    # --- WITHDRAWAL HISTORY ---
    df_prelievi = _leggi_foglio(xls, "Withdrawal_History")
    df_prelievi.columns = [str(c).strip().lower() for c in df_prelievi.columns]
    for _, row in df_prelievi.iterrows():
        currency = row.get("currency", "")
        address = str(row.get("address", "")).strip()
        txid = str(row.get("txid", "")).strip()
        if not address or not txid:
            continue
        asset = asset_output_finale(currency, address)
        prelievi.append({
            "Type": "sent",
            "Deposit Address or Hash": txid,
            "Output index or Counterparty Address": address,
            "Asset": asset
        })
    df_finale = pd.DataFrame(depositi + prelievi)
    salva_e_avvisa(df_finale, file_output)

if __name__ == "__main__":
    import sys, os
    from cluster_utils import decrypt_excel_if_needed
    if len(sys.argv) < 2:
        print("Uso: python cluster_okx.py <file.xlsx> [output.csv]")
        sys.exit(1)
    file_da_caricare = sys.argv[1]
    file_output = sys.argv[2] if len(sys.argv) > 2 else "cluster_okx.csv"
    file_da_caricare = decrypt_excel_if_needed(file_da_caricare, os.environ.get('EXCEL_PASSWORD'))
    esegui_okx(file_da_caricare, file_output)
import pandas as pd
from cluster_utils import MAPPATURA_ASSET_CLUSTER, postprocessa_asset, salva_e_avvisa, trova_foglio

def asset_okx(currency, address):
    # Prendi tutti i primi valori delle tuple
    primi_valori = [str(t[0]).strip().upper() for t in MAPPATURA_ASSET_CLUSTER]
    currency_up = str(currency).strip().upper()
    address_str = str(address).strip()
    currency_post = postprocessa_asset(currency_up)
    if currency_post != currency_up:
        return currency_post
    # 1. Se currency è tra i primi valori, restituisci currency
    if currency_up in primi_valori:
        return postprocessa_asset(currency_up)
    # 2. Se address inizia con uno degli elementi del quarto elemento di una tupla, restituisci il terzo elemento
    for t in MAPPATURA_ASSET_CLUSTER:
        if len(t) >= 4:
            prefissi = t[3]
            if isinstance(prefissi, str):
                prefissi = (prefissi,)
            for pref in prefissi:
                if address_str.startswith(pref):
                    return postprocessa_asset(t[2])
    # 3. Se address non inizia con nessun prefisso e NON contiene 0, O, I, l, restituisci SOLANA_MAINNET
    if not any(address_str.startswith(pref) for t in MAPPATURA_ASSET_CLUSTER if len(t) >= 4 for pref in (t[3] if isinstance(t[3], (tuple, list)) else (t[3],))):
        if is_probably_monero_address(address_str):
            return ""  # Monero: non supportato da Chainalysis, ma gestito da TRM tramite _trm_asset
        if all(x not in address_str for x in ["0", "O", "I", "l"]):
            return postprocessa_asset("SOLANA_MAINNET")
    # 4. Altrimenti vuoto
    return ""

def esegui_cluster_okx(file_input, file_output):
    xls = _open_excel(file_input)
    # Depositi
    df_dep = _leggi_foglio(xls, "Deposit_History")
    df_dep.columns = [str(c).strip().lower() for c in df_dep.columns]
    # Filtra righe dove address inizia con 'INNER_'
    if not df_dep.empty:
        df_dep = df_dep[~df_dep["address"].astype(str).str.startswith("INNER_")]
    deposit = pd.DataFrame()
    if not df_dep.empty:
        deposit = pd.DataFrame({
            "Type": "deposit",
            "Deposit Address or Hash": df_dep["address"],
            "Output index or Counterparty Address": "",
            "Asset": [asset_okx(row["currency"], row["address"]) or "UNKNOWN" for _, row in df_dep.iterrows()],
            "_trm_asset": df_dep["currency"].astype(str).str.strip().values,
            "_trm_network": "",
            "_trm_tx_hash": df_dep["txid"].astype(str).str.strip().values if "txid" in df_dep.columns else "",
        })
        # Rimuovi duplicati mantenendo solo la prima occorrenza per indirizzo deposito
        from cluster_utils import elimina_duplicati_depositi
        deposit = elimina_duplicati_depositi(deposit)
    # Prelievi
    df_wd = _leggi_foglio(xls, "Withdrawal_History")
    df_wd.columns = [str(c).strip().lower() for c in df_wd.columns]
    # Filtra righe dove address inizia con 'INNER_'
    if not df_wd.empty:
        df_wd = df_wd[~df_wd["address"].astype(str).str.startswith("INNER_")]
    withdraw = pd.DataFrame()
    if not df_wd.empty:
        withdraw = pd.DataFrame({
            "Type": "sent",
            "Deposit Address or Hash": df_wd["txid"],
            "Output index or Counterparty Address": df_wd["address"],
            "Asset": [asset_okx(row["currency"], row["address"]) or "UNKNOWN" for _, row in df_wd.iterrows()],
            "_trm_asset": df_wd["currency"].astype(str).str.strip().values,
            "_trm_network": "",
        })
    # Unisci e salva
    df_finale = pd.concat([deposit, withdraw], ignore_index=True)
    salva_e_avvisa(df_finale, file_output)

def main():
    import sys, os
    from cluster_utils import decrypt_excel_if_needed
    if len(sys.argv) < 2:
        print("Uso: python cluster_okx.py <file.xlsx> [output.csv]")
        sys.exit(1)
    file_da_caricare = sys.argv[1]
    file_output = sys.argv[2] if len(sys.argv) > 2 else 'cluster_okx.csv'
    file_da_caricare = decrypt_excel_if_needed(file_da_caricare, os.environ.get('EXCEL_PASSWORD'))
    esegui_cluster_okx(file_da_caricare, file_output)

if __name__ == "__main__":
    main()
