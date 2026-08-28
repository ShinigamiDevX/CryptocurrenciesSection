import pandas as pd
from cluster_utils import MAPPATURA_ASSET, MAPPATURA_ASSET_CLUSTER, postprocessa_asset, salva_e_avvisa
from cluster_utils import asset_output_finale, trova_foglio, get_col


def is_bnb_beacon_address(value):
    return str(value).strip().lower().startswith("bnb")

def asset_binance(currency, network):
    currency = str(currency).strip().upper()
    network = str(network).strip().upper()
    currency_post = postprocessa_asset(currency)
    network_post = postprocessa_asset(network)

    # Binance Beacon (bnb...) non e supportato da reactor.chainalysis.
    if network == "BNB":
        return ''

    # Su Binance la network deve avere precedenza sul ticker (es. BTC su BSC non e BITCOIN_MAINNET).
    if network_post != network:
        return network_post

    if network in MAPPATURA_ASSET:
        return postprocessa_asset(MAPPATURA_ASSET[network])

    if currency_post != currency:
        return currency_post

    if currency in MAPPATURA_ASSET:
        return postprocessa_asset(currency)

    primi = [str(t[0]).strip().upper() for t in MAPPATURA_ASSET_CLUSTER]
    network_map = {str(t[0]).strip().upper(): t[2] for t in MAPPATURA_ASSET_CLUSTER if len(t) >= 3}
    if currency in primi:
        return postprocessa_asset(currency)
    elif network in primi:
        return postprocessa_asset(network_map.get(network, ''))
    return ''

def asset_binance_raw(currency, network):
    currency = postprocessa_asset(str(currency).strip().upper())
    network = postprocessa_asset(str(network).strip().upper())
    if currency:
        return currency
    return network

def esegui_binance(file_input, file_output):
    xls = pd.ExcelFile(file_input)
    depositi = []
    prelievi = []
    avvisi = []
    # --- DEPOSIT HISTORY ---
    df_depositi = pd.read_excel(xls, trova_foglio(xls, "Deposit History"))
    df_depositi.columns = [str(c).strip().lower() for c in df_depositi.columns]
    seen = set()
    for _, row in df_depositi.iterrows():
        currency = get_col(row, "Currency", "")
        network = get_col(row, "Network", "")
        deposit_address = str(get_col(row, "Deposit Address", "")).strip()
        if not deposit_address:
            continue
        if is_bnb_beacon_address(deposit_address) or str(network).strip().upper() == "BNB":
            avvisi.append({
                "Type": "deposit",
                "Deposit Address or Hash": deposit_address,
                "Output index or Counterparty Address": "",
                "Asset": asset_binance_raw(currency, network),
                "Motivo esclusione": "Indirizzo/network Binance Beacon (bnb) non supportato"
            })
            continue
        asset = asset_binance(currency, network)
        if not asset:
            depositi.append({
                "Type": "deposit",
                "Deposit Address or Hash": deposit_address,
                "Output index or Counterparty Address": "",
                "Asset": asset_binance_raw(currency, network)
            })
            continue
        # Unicità su (Deposit Address, Asset) per consentire lo stesso indirizzo su chain diverse
        if (deposit_address, asset) in seen:
            continue
        seen.add((deposit_address, asset))
        depositi.append({
            "Type": "deposit",
            "Deposit Address or Hash": deposit_address,
            "Output index or Counterparty Address": "",
            "Asset": asset
        })
    # --- WITHDRAWAL HISTORY ---
    df_prelievi = pd.read_excel(xls, trova_foglio(xls, "Withdrawal History"))
    df_prelievi.columns = [str(c).strip().lower() for c in df_prelievi.columns]
    for _, row in df_prelievi.iterrows():
        currency = get_col(row, "Currency", "")
        network = get_col(row, "Network", "")
        deposit_address = str(get_col(row, "Deposit Address", "")).strip()
        if not deposit_address or not currency or not network:
            continue
        if is_bnb_beacon_address(deposit_address) or str(network).strip().upper() == "BNB":
            avvisi.append({
                "Type": "sent",
                "Deposit Address or Hash": deposit_address,
                "Output index or Counterparty Address": "",
                "Asset": asset_binance_raw(currency, network),
                "Motivo esclusione": "Indirizzo/network Binance Beacon (bnb) non supportato"
            })
            continue
        asset = asset_binance(currency, network)
        if not asset:
            prelievi.append({
                "Type": "deposit",
                "Deposit Address or Hash": deposit_address,
                "Output index or Counterparty Address": "",
                "Asset": asset_binance_raw(currency, network)
            })
            continue
        prelievi.append({
            "Type": "deposit",
            "Deposit Address or Hash": deposit_address,
            "Output index or Counterparty Address": "",
            "Asset": asset
        })
    df_finale = pd.DataFrame(depositi + prelievi)
    salva_e_avvisa(df_finale, file_output, avvisi)

if __name__ == "__main__":
    import sys, os
    from cluster_utils import decrypt_excel_if_needed
    if len(sys.argv) < 2:
        print("Uso: python cluster_binance.py <file.xlsx> [output.csv]")
        sys.exit(1)
    file_da_caricare = sys.argv[1]
    file_output = sys.argv[2] if len(sys.argv) > 2 else "cluster_binance.csv"
    file_da_caricare = decrypt_excel_if_needed(file_da_caricare, os.environ.get('EXCEL_PASSWORD'))
    esegui_binance(file_da_caricare, file_output)
import pandas as pd
import os


# Normalizzatore per DEPOSITI
def normalizzatore_asset_deposito_binance(asset, indirizzo=None, network=None):
    asset = str(asset).strip().upper()
    network = str(network).strip().upper() if network is not None else None
    indirizzo = str(indirizzo) if indirizzo is not None else ""
    if is_bnb_beacon_address(indirizzo) or network == "BNB":
        return ""
    # Se asset == network, restituisci asset
    if asset == network:
        return postprocessa_asset(asset)
    # Altrimenti, restituisci il mapping dal network
    return postprocessa_asset(MAPPATURA_ASSET.get(network, network))

# Normalizzatore per PRELIEVI
def normalizzatore_asset_binance(asset, indirizzo=None, network=None):
    asset = str(asset).strip().upper()
    network = str(network).strip().upper() if network is not None else None
    indirizzo = str(indirizzo) if indirizzo is not None else ""
    if is_bnb_beacon_address(indirizzo) or network == "BNB":
        return ""
    # Se asset == network, restituisci asset
    if asset == network:
        return postprocessa_asset(asset)
    # Altrimenti, restituisci il mapping dal network
    return postprocessa_asset(MAPPATURA_ASSET.get(network, network))

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
    df_depositi = pd.read_excel(xls, trova_foglio(xls, foglio_depositi))
    df_prelievi = pd.read_excel(xls, trova_foglio(xls, foglio_prelievi))
    if normalizza_header:
        df_depositi.columns = [str(c).strip().lower() for c in df_depositi.columns]
        df_prelievi.columns = [str(c).strip().lower() for c in df_prelievi.columns]

    # --- DEPOSIT HISTORY ---
    depositi = []
    avvisi_counterparty = []

    for _, row in df_depositi.iterrows():
        currency = str(get_col(row, 'Currency', '')).strip().upper()
        network = str(get_col(row, 'Network', '')).strip().upper()
        deposit_address = str(get_col(row, 'Deposit Address', '')).strip()
        txid_deposit = str(get_col(row, 'txId', '')).strip()
        if txid_deposit.lower() in ('nan', 'none', ''):
            txid_deposit = ''
        if not deposit_address:
            continue  # Salta righe senza indirizzo
        if is_bnb_beacon_address(deposit_address) or network == "BNB":
            avvisi_counterparty.append({
                'Type': 'deposit',
                'Deposit Address or Hash': deposit_address,
                'Output index or Counterparty Address': '',
                'Asset': asset_binance_raw(currency, network),
                'Motivo esclusione': "Indirizzo/network Binance Beacon (bnb) non supportato"
            })
            continue
        asset = asset_binance(currency, network)
        if not asset:
            asset = asset_binance_raw(currency, network)
        depositi.append({
            'Type': 'deposit',
            'Deposit Address or Hash': deposit_address,
            'Output index or Counterparty Address': '',
            'Asset': asset,
            '_trm_asset': currency,
            '_trm_network': network,
            '_trm_tx_hash': txid_deposit,
        })

    # Unicità su (Deposit Address, Asset) solo per modalità Chainalysis
    if os.environ.get('OUTPUT_SERVICE', '').lower() == 'trm':
        depositi_unici = depositi
    else:
        seen = set()
        depositi_unici = []
        for d in depositi:
            key = (d['Deposit Address or Hash'], d['Asset'])
            if key not in seen:
                seen.add(key)
                depositi_unici.append(d)

    # --- WITHDRAWAL HISTORY ---
    prelievi = []
    for idx, row in df_prelievi.iterrows():
        currency = str(get_col(row, 'Currency', '')).strip().upper()
        network = str(get_col(row, 'Network', '')).strip().upper()
        txid = str(get_col(row, 'txId', '')).strip()
        destination_address = str(get_col(row, 'Destination Address', '')).strip()
        counterparty_id = str(get_col(row, 'CounterParty ID', '')).strip()
        # Se CounterParty ID non è vuoto (e non è 'nan'/'none' da cella Excel vuota),
        # aggiungi la riga come avviso e salta
        if counterparty_id and counterparty_id.lower() not in ('nan', 'none'):
            avvisi_counterparty.append({
                'Type': 'sent',
                'Deposit Address or Hash': txid if txid else float('nan'),
                'Output index or Counterparty Address': destination_address,
                'Asset': asset_binance_raw(currency, network),
                'Motivo esclusione': f"CounterParty ID valorizzato: '{counterparty_id}'"
            })
            continue
        # Tutti i campi devono essere valorizzati
        if not txid or not destination_address or not currency or not network:
            continue
        if is_bnb_beacon_address(destination_address) or network == "BNB":
            avvisi_counterparty.append({
                'Type': 'sent',
                'Deposit Address or Hash': txid,
                'Output index or Counterparty Address': destination_address,
                'Asset': asset_binance_raw(currency, network),
                'Motivo esclusione': "Indirizzo/network Binance Beacon (bnb) non supportato"
            })
            continue
        asset = asset_binance(currency, network)
        if not asset:
            asset = asset_binance_raw(currency, network)
        prelievi.append({
            'Type': 'sent',
            'Deposit Address or Hash': txid,
            'Output index or Counterparty Address': destination_address,
            'Asset': asset,
            '_trm_asset': currency,
            '_trm_network': network,
        })

    # Unisci e crea DataFrame finale
    df_finale = pd.DataFrame(depositi_unici + prelievi)

    from cluster_utils import salva_e_avvisa
    # Passa anche gli avvisi sulle righe escluse
    salva_e_avvisa(df_finale, file_output, avvisi_counterparty)

def main():
    import sys
    if len(sys.argv) < 2:
        print("Uso: python cluster_binance.py <file.xlsx> [output.csv]")
        sys.exit(1)
    file_da_caricare = sys.argv[1]
    file_output = sys.argv[2] if len(sys.argv) > 2 else 'cluster_binance.csv'

    esegui_cluster(
        file_input=file_da_caricare,
        file_output=file_output,
        foglio_depositi="Deposit History",
        colonna_indirizzo_deposito="Deposit Address",
        colonna_asset_deposito="Currency",
        foglio_prelievi="Withdrawal History",
        colonna_indirizzo_prelievo="txId",
        colonna_destinatario_prelievo="Destination Address",
        colonna_asset_prelievo="Currency",
        colonna_network_deposito="Network",
        colonna_network_prelievo="Network",
        normalizza_header=True,
        normalizzatore_asset_deposito=normalizzatore_asset_deposito_binance,
        normalizzatore_asset_prelievo=normalizzatore_asset_binance
    )

if __name__ == "__main__":
    main()