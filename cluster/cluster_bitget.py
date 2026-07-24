import sys
import pandas as pd
from cluster_utils import (
    MAPPATURA_ASSET_CLUSTER, MAPPATURA_ASSET, postprocessa_asset, salva_e_avvisa,
    normalizza_asset, is_probably_stellar_address,
    resolve_chain_with_chainalysis_by_address, is_evm_address
)

# Mapping dei nomi network/protocollo usati da Bitget → mainnet Chainalysis
# Copre sia i ticker standard (già gestiti da postprocessa_asset) sia i nomi
# di tipo rete (ERC20, BEP20, TRC20, ecc.) che postprocessa_asset non riconosce
BITGET_NETWORK_MAP = {
    'erc20':    'ETHEREUM_MAINNET',
    'eth':      'ETHEREUM_MAINNET',
    'ethereum': 'ETHEREUM_MAINNET',
    'bep20':    'BNB_SMART_CHAIN_MAINNET',
    'bsc':      'BNB_SMART_CHAIN_MAINNET',
    'bnb':      'BNB_SMART_CHAIN_MAINNET',
    'trc20':    'TRON_MAINNET',
    'trx':      'TRON_MAINNET',
    'tron':     'TRON_MAINNET',
    'polygon':  'POLYGON_POS_MAINNET',
    'matic':    'POLYGON_POS_MAINNET',
    'pol':      'POLYGON_POS_MAINNET',
    'arbone':   'ARBITRUM_ONE_MAINNET',
    'arb':      'ARBITRUM_ONE_MAINNET',
    'arbitrum': 'ARBITRUM_ONE_MAINNET',
    'op':       'OPTIMISM_MAINNET',
    'optimism': 'OPTIMISM_MAINNET',
    'base':     'BASE_MAINNET',
    'avaxc':    'AVALANCHE_C_CHAIN_MAINNET',
    'avax':     'AVALANCHE_C_CHAIN_MAINNET',
    'avalanche':'AVALANCHE_C_CHAIN_MAINNET',
    'sol':      'SOLANA_MAINNET',
    'solana':   'SOLANA_MAINNET',
    'btc':      'BITCOIN_MAINNET',
    'bitcoin':  'BITCOIN_MAINNET',
    'ltc':      'LITECOIN_MAINNET',
    'xrp':      'XRP_MAINNET',
    'ripple':   'XRP_MAINNET',
    'xlm':      'STELLAR_MAINNET',
    'stellar':  'STELLAR_MAINNET',
    'doge':     'DOGECOIN_MAINNET',
    'dogecoin': 'DOGECOIN_MAINNET',
    'ton':      'TON_MAINNET',
    'sui':      'SUI_MAINNET',
    'linea':    'LINEA_MAINNET',
    'zksync':   'ZK_SYNC_MAINNET',
}


def _norm(s):
    """Normalizza un nome colonna: lowercase + solo caratteri alfanumerici.
    Es: 'Transaction Hash (TxID)' → 'transactionhashtxid'
        'Sub category'            → 'subcategory'
        'To address'              → 'toaddress'
    """
    return ''.join(c for c in str(s).strip().lower() if c.isalnum())


def _get(row, *keys):
    """Restituisce il primo valore non vuoto tra le chiavi normalizzate fornite."""
    for k in keys:
        v = row.get(k, None)
        if v is not None:
            s = str(v).strip()
            if s.lower() not in ('nan', 'none', ''):
                return s
    return ''


def asset_da_valore(coin_val, address_val, network_val=None):
    """
    1. Network dal file (colonna network/chain) → risoluzione diretta
    2. Ticker in MAPPATURA_ASSET_CLUSTER → postprocessa_asset
    3. Prefisso address nel 4° elemento  → 3° elemento (mainnet name)
    4. Fallback Chainalysis via normalizza_asset
    """
    coin_up      = str(coin_val).strip().upper()    if coin_val    else ""
    address_str  = str(address_val).strip()         if address_val  else ""
    network_norm = _norm(str(network_val))           if network_val  else ""

    # 1. Usa la colonna network se disponibile (es. ERC20, BEP20, TRC20, BSC…)
    if network_norm:
        mapped = BITGET_NETWORK_MAP.get(network_norm)
        if mapped:
            return mapped
        # Prova anche postprocessa_asset per ticker standard (ETH, SOL, ecc.)
        pp = postprocessa_asset(network_norm.upper())
        if pp and pp in {t[2] for t in MAPPATURA_ASSET_CLUSTER}:
            return pp

    # 2. Mapping diretto dal ticker (primo elemento della tupla)
    for tupla in MAPPATURA_ASSET_CLUSTER:
        if coin_up == str(tupla[0]).strip().upper():
            return postprocessa_asset(coin_up)

    # Escludi hash di transazione a 64 hex dal prefix check (non sono indirizzi wallet)
    _is_raw_tx_hash = len(address_str) == 64 and all(c in '0123456789abcdefABCDEF' for c in address_str)
    if address_str and not _is_raw_tx_hash:
        for tupla in MAPPATURA_ASSET_CLUSTER:
            if len(tupla) > 3:
                prefissi = tupla[3]
                if isinstance(prefissi, str):
                    prefissi = [prefissi]
                for pref in prefissi:
                    if address_str.startswith(pref):
                        if tupla[2] == "STELLAR_MAINNET" and not is_probably_stellar_address(address_str):
                            continue
                        return tupla[2]

    # Se l'indirizzo è EVM e non siamo riusciti a determinare la chain,
    # interroga Chainalysis per identificarla
    if not network_norm and is_evm_address(address_str):
        chain = resolve_chain_with_chainalysis_by_address(address_str)
        if chain:
            return chain

    return normalizza_asset(coin_up, address_str)


def find_data_header_row(xls, sheet_name):
    """
    Legge il foglio senza header e cerca la riga che contiene le intestazioni
    della tabella transazioni. Accetta diverse varianti di nomi colonna:
    - 'type' o 'category' o 'ordertype'
    - 'coin' o 'currency' o 'asset' o 'token'
    Come fallback cerca la prima riga con almeno 4 celle non vuote.
    """
    df_raw = pd.read_excel(xls, sheet_name=sheet_name, header=None)

    TYPE_KEYS  = {'type', 'category', 'ordertype', 'transactiontype', 'txtype'}
    COIN_KEYS  = {'coin', 'currency', 'asset', 'token', 'cryptoasset'}

    first_multicolumn = None  # prima riga con ≥4 celle non vuote

    for i, row in df_raw.iterrows():
        non_empty = [str(v) for v in row.values if str(v).strip().lower() not in ('nan', 'none', '')]
        if first_multicolumn is None and len(non_empty) >= 4:
            first_multicolumn = i
        row_norms = set(_norm(v) for v in non_empty)
        has_type = bool(TYPE_KEYS & row_norms)
        has_coin = bool(COIN_KEYS & row_norms)
        if has_type and has_coin:
            return i

    # Fallback: prima riga con abbastanza colonne (probabilmente la header)
    if first_multicolumn is not None:
        return first_multicolumn
    return 0


def esegui_bitget(file_input, file_output):
    print(f"Lettura di {file_input}...")
    xls = pd.ExcelFile(file_input)
    sheet_name = xls.sheet_names[0]

    # Il file Bitget ha righe di intestazione (account info, ecc.) prima dei dati:
    # trova la riga con le intestazioni reali della tabella
    skip = find_data_header_row(xls, sheet_name)
    print(f"  Header tabella trovato alla riga: {skip}")

    # skiprows=skip salta le righe di intestazione, header=0 usa la prima riga rimasta
    df = pd.read_excel(xls, sheet_name=sheet_name, skiprows=skip, header=0)

    # Normalizza header: rimuove spazi/punteggiatura e mette in lowercase
    # Es: "Transaction Hash (TxID)" → "transactionhashtxid"
    df.columns = [_norm(c) for c in df.columns]
    print(f"  Colonne rilevate: {list(df.columns)}")

    depositi = []
    sent_list = []

    for _, row in df.iterrows():
        # Salta le righe con Sub category == "internal transfer"
        sub_cat = _get(row, 'subcategory', 'subcat').lower().replace(' ', '')
        if sub_cat == 'internaltransfer':
            continue

        type_val = _get(row, 'type').lower()
        coin_val = _get(row, 'coin', 'currency', 'asset')
        # Legge la colonna network/chain (risolutiva per USDT e altri token multi-chain)
        network_val = _get(row, 'network', 'chain', 'networktype', 'chainname',
                           'blockchainnetwork', 'chaintype', 'networkprotocol')
        # "To address" → "toaddress"; prova anche varianti comuni
        to_address = _get(row, 'toaddress', 'address', 'destinationaddress', 'walletaddress', 'toaddr')
        print(f"  [DEBUG] type={type_val} coin={coin_val} network={network_val} addr={str(to_address)[:12]}...") if network_val else None

        if type_val == 'deposit':
            if not to_address:
                continue
            asset = asset_da_valore(coin_val, to_address, network_val)
            depositi.append({
                'Type': 'deposit',
                'Deposit Address or Hash': to_address,
                'Output index or Counterparty Address': '',
                'Asset': asset,
                '_trm_asset': coin_val,
                '_trm_network': network_val,
                '_trm_tx_hash': _get(row, 'transactionhashtxid', 'txid', 'txhash', 'id', 'hash'),
            })
        elif type_val == 'withdrawal':
            # "Transaction hash(txid)" → "transactionhashtxid"; prova anche varianti comuni
            tx_hash = _get(row, 'transactionhashtxid', 'txid', 'txhash',
                           'transactionid', 'transactionhash', 'hash', 'id')
            if not tx_hash:
                continue
            asset = asset_da_valore(coin_val, to_address, network_val)
            sent_list.append({
                'Type': 'sent',
                'Deposit Address or Hash': tx_hash,
                'Output index or Counterparty Address': to_address,
                'Asset': asset,
                '_trm_asset': coin_val,
                '_trm_network': network_val,
            })

    print(f"  Depositi trovati: {len(depositi)}, Sent trovati: {len(sent_list)}")
    # Depositi prima, poi sent
    df_finale = pd.DataFrame(depositi + sent_list)
    salva_e_avvisa(df_finale, file_output)


if __name__ == "__main__":
    import os
    from cluster_utils import decrypt_excel_if_needed
    if len(sys.argv) < 2:
        print("Uso: python cluster_bitget.py <file.xlsx> [output.csv]")
        sys.exit(1)
    file_input = sys.argv[1]
    file_output = sys.argv[2] if len(sys.argv) > 2 else 'cluster_bitget.csv'
    file_input = decrypt_excel_if_needed(file_input, os.environ.get('EXCEL_PASSWORD'))
    esegui_bitget(file_input, file_output)
