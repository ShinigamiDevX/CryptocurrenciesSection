import os
import re
import time
import json
import warnings
import requests
from urllib.parse import quote

def _load_cluster_env_file():
    """Carica cluster.env se le variabili non sono già nell'ambiente (Docker le inietta da solo)."""
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = (
        os.path.join(here, '..', 'cluster.env'),
        os.path.join(here, 'cluster.env'),
    )
    for path in candidates:
        path = os.path.abspath(path)
        if not os.path.isfile(path):
            continue
        try:
            with open(path, encoding='utf-8') as fh:
                for raw in fh:
                    line = raw.strip()
                    if not line or line.startswith('#') or '=' not in line:
                        continue
                    key, _, val = line.partition('=')
                    key, val = key.strip(), val.strip().strip('"').strip("'")
                    if key and key not in os.environ:
                        os.environ[key] = val
        except OSError:
            continue
        break

_load_cluster_env_file()

# Sopprimi warning openpyxl cosmetics (stili mancanti nel workbook)
warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")


def decrypt_excel_if_needed(file_path, password=None):
    """
    Se il file è cifrato, tenta la decifratura.
    - password=None e file cifrato → stampa [PASSWORD_REQUIRED] su stderr, sys.exit(2)
    - password fornita e corretta   → restituisce BytesIO decifrato
    - password fornita e errata     → stampa [PASSWORD_ERRATA] su stderr, sys.exit(3)
    - file non cifrato              → restituisce file_path originale
    """
    import sys, io as _io
    try:
        import msoffcrypto
        with open(str(file_path), 'rb') as fh:
            try:
                office = msoffcrypto.OfficeFile(fh)
            except Exception:
                return file_path
            if not office.is_encrypted():
                return file_path
            if not password:
                print("[PASSWORD_REQUIRED]", file=sys.stderr, flush=True)
                sys.exit(2)
            fh.seek(0)
            office2 = msoffcrypto.OfficeFile(fh)
            try:
                office2.load_key(password=password)
                buf = _io.BytesIO()
                office2.decrypt(buf)
                buf.seek(0)
                return buf
            except Exception:
                print("[PASSWORD_ERRATA]", file=sys.stderr, flush=True)
                sys.exit(3)
    except ImportError:
        return file_path
    except SystemExit:
        raise
    except Exception:
        return file_path

EVM_CHAIN_KEYS = [
    "ARBITRUM_ONE_MAINNET",
    "AVALANCHE_C_CHAIN_MAINNET",
    "BASE_MAINNET",
    "BNB_SMART_CHAIN_MAINNET",
    "ETHEREUM_MAINNET",
    "INK_MAINNET",
    "KAIA_MAINNET",
    "LINEA_MAINNET",
    "OPTIMISM_MAINNET",
    "PLASMA_MAINNET",
    "POLYGON_POS_MAINNET",
    "SONEIUM_MAINNET",
    "TEMPO_MAINNET",
    "UNICHAIN_MAINNET",
    "WORLD_MAINNET",
    "XLAYER_MAINNET",
    "ZK_SYNC_MAINNET",
]

CHAINALYSIS_BASE_URL = "https://api.chainalysis.com"
REACTOR_BASE_URL = "https://reactor.chainalysis.com"
CHAINALYSIS_API_TOKEN = (os.environ.get("CHAINALYSIS_API_TOKEN") or os.environ.get("REACTOR_TOKEN") or "").strip()

TRM_BASE_URL = "https://api.trmlabs.com"
TRM_API_KEY = (os.environ.get("TRM_API_KEY") or "").strip()

# Mapping TRM chain names → mainnet Chainalysis
# TRM_CHAIN_TO_MAINNET rimosso: sostituito da TRM_CHAIN_ID_TO_MAINNET
# costruito dinamicamente dall'inverso di MAINNET_TO_TRM_CHAIN_ID (caricato dal CSV).

STELLAR_BASE32_ALPHABET = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567")

# Mapping EIP-155 chain ID → mainnet Chainalysis
REACTOR_EIP155_TO_MAINNET = {
    "1":     "ETHEREUM_MAINNET",
    "56":    "BNB_SMART_CHAIN_MAINNET",
    "137":   "POLYGON_POS_MAINNET",
    "42161": "ARBITRUM_ONE_MAINNET",
    "10":    "OPTIMISM_MAINNET",
    "8453":  "BASE_MAINNET",
    "43114": "AVALANCHE_C_CHAIN_MAINNET",
    "59144": "LINEA_MAINNET",
    "324":   "ZK_SYNC_MAINNET",
    "1868":  "SONEIUM_MAINNET",
    "480":   "WORLD_MAINNET",
    "2741":  "UNICHAIN_MAINNET",
    "37111": "TEMPO_MAINNET",
    "763373":"INK_MAINNET",
    "1001":  "KAIA_MAINNET",
    "7700":  "XLAYER_MAINNET",
    "3776":  "PLASMA_MAINNET",
}

# Asset ticker validi per la POST /api/v2/search di Reactor
REACTOR_SEARCH_ASSETS = [
    'ETH', 'BNB', 'BTC', 'TRX', 'MATIC', 'SOL',
    'XRP', 'LTC', 'DOGE', 'TON', 'SUI', 'XLM',
    'USDT', 'USDC',
]


def _parse_reactor_asset_to_mainnet(asset_id):
    """
    Converte un asset identifier Reactor (es. 'asset-v2:eip155:1:native')
    nel nome mainnet Chainalysis corrispondente.
    """
    if not asset_id:
        return None
    m = re.search(r'eip155:(\d+)', asset_id)
    if m:
        return REACTOR_EIP155_TO_MAINNET.get(m.group(1))
    if '000000000019d6689c085ae165831e93' in asset_id:
        return 'BITCOIN_MAINNET'
    if '12a765e31ffd4059bada1e25190f6e98' in asset_id:
        return 'LITECOIN_MAINNET'
    if '1a91e3dace36e2be3bf030a65679fe82' in asset_id:
        return 'DOGECOIN_MAINNET'
    if '00000000000000001ebf88508a03865c' in asset_id:
        return 'TRON_MAINNET'
    if 'solana:' in asset_id:
        return 'SOLANA_MAINNET'
    if 'xrpl:' in asset_id:
        return 'XRP_MAINNET'
    if 'stellar:' in asset_id:
        return 'STELLAR_MAINNET'
    if 'tvm:' in asset_id:
        return 'TON_MAINNET'
    if 'sui:' in asset_id:
        return 'SUI_MAINNET'
    return None


def reactor_auth_header():
    """Header per le API reactor.chainalysis.com (usa 'token' minuscolo)."""
    return {
        "token": CHAINALYSIS_API_TOKEN,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def trm_auth_header():
    """Header per le API TRM (Basic Auth: api_key:api_key)."""
    import base64
    token = base64.b64encode(f"{TRM_API_KEY}:{TRM_API_KEY}".encode()).decode()
    return {
        "Authorization": f"Basic {token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def resolve_chain_with_trm(address):
    """
    Fallback TRM Labs API per identificare la chain di un indirizzo.
    POST /public/v2/screening/addresses con le chain più probabili.
    Ritorna il nome mainnet (es. 'ETHEREUM_MAINNET') o None.
    """
    addr = str(address).strip()
    if not addr:
        return None

    # Seleziona le chain da provare in base al formato dell'indirizzo
    # Usa i TRM chain ID reali presi dal CSV tramite MAINNET_TO_TRM_CHAIN_ID
    _m = MAINNET_TO_TRM_CHAIN_ID  # alias breve
    if is_evm_address(addr):
        chains_to_try = [c for c in [
            _m.get("ETHEREUM_MAINNET"), _m.get("BNB_SMART_CHAIN_MAINNET"),
            _m.get("ARBITRUM_ONE_MAINNET"), _m.get("POLYGON_POS_MAINNET"),
            _m.get("BASE_MAINNET"), _m.get("OPTIMISM_MAINNET"),
            _m.get("AVALANCHE_C_CHAIN_MAINNET"), _m.get("LINEA_MAINNET"),
            _m.get("ZK_SYNC_MAINNET"),
        ] if c]
    elif addr.startswith("T") and len(addr) == 34:
        chains_to_try = [c for c in [_m.get("TRON_MAINNET")] if c]
    elif addr.startswith(("1", "3", "bc1")):
        chains_to_try = [c for c in [_m.get("BITCOIN_MAINNET")] if c]
    elif addr.startswith("r") and 25 <= len(addr) <= 35:
        chains_to_try = [c for c in [_m.get("XRP_MAINNET")] if c]
    elif addr.startswith("G") and len(addr) == 56:
        chains_to_try = [c for c in [_m.get("STELLAR_MAINNET")] if c]
    elif addr.startswith(("EQ", "UQ", "0:")):
        chains_to_try = [c for c in [_m.get("TON_MAINNET")] if c]
    elif addr.startswith("D") and len(addr) == 34:
        chains_to_try = [c for c in [_m.get("DOGECOIN_MAINNET")] if c]
    elif addr.startswith(("L", "M", "ltc1")):
        chains_to_try = [c for c in [_m.get("LITECOIN_MAINNET")] if c]
    else:
        chains_to_try = list(TRM_CHAIN_ID_TO_MAINNET.keys())

    headers = trm_auth_header()
    body = [{"address": addr, "chain": chain} for chain in chains_to_try]
    try:
        r = requests.post(
            f"{TRM_BASE_URL}/public/v2/screening/addresses",
            headers=headers, json=body, timeout=15
        )
        if r.status_code != 200:
            print(f"[TRM] HTTP {r.status_code} per addr={addr[:14]}...")
            return None
        results = r.json()
        if not isinstance(results, list):
            return None
        for item in results:
            chain = item.get("chain", "")
            if chain and item.get("addressRiskScore") is not None:
                mainnet = TRM_CHAIN_ID_TO_MAINNET.get(chain)
                if mainnet:
                    print(f"[TRM] chain={mainnet} per addr={addr[:14]}...")
                    return mainnet
    except Exception as e:
        print(f"[TRM] Errore per addr={addr[:14]}...: {e}")
    return None


def resolve_chain_with_trm_tx(tx_hash):
    """
    Fallback TRM Labs API per identificare la chain di un tx hash EVM.
    POST /public/v2/screening/transactions con le chain EVM principali.
    Ritorna il nome mainnet o None.
    """
    tx = str(tx_hash).strip()
    if not is_evm_tx_hash(tx):
        return None

    _m = MAINNET_TO_TRM_CHAIN_ID
    evm_chains = [c for c in [
        _m.get("ETHEREUM_MAINNET"), _m.get("BNB_SMART_CHAIN_MAINNET"),
        _m.get("ARBITRUM_ONE_MAINNET"), _m.get("POLYGON_POS_MAINNET"),
        _m.get("BASE_MAINNET"), _m.get("OPTIMISM_MAINNET"),
        _m.get("AVALANCHE_C_CHAIN_MAINNET"), _m.get("LINEA_MAINNET"),
        _m.get("ZK_SYNC_MAINNET"),
    ] if c]
    headers = trm_auth_header()
    body = [{"txHash": tx, "chain": chain} for chain in evm_chains]
    try:
        r = requests.post(
            f"{TRM_BASE_URL}/public/v2/screening/transactions",
            headers=headers, json=body, timeout=15
        )
        if r.status_code != 200:
            return None
        results = r.json()
        if not isinstance(results, list):
            return None
        for item in results:
            chain = item.get("chain", "")
            if chain and item.get("txRiskScore") is not None:
                mainnet = TRM_CHAIN_ID_TO_MAINNET.get(chain)
                if mainnet:
                    print(f"[TRM] chain={mainnet} per tx={tx[:14]}...")
                    return mainnet
    except Exception as e:
        print(f"[TRM] Errore tx per tx={tx[:14]}...: {e}")
    return None


def resolve_chain_with_reactor_search(address):
    """
    Usa POST /api/v2/search di reactor.chainalysis.com per identificare
    la chain di un indirizzo. Ritorna il nome mainnet (es. 'ETHEREUM_MAINNET') o None.
    """
    addr = str(address).strip()
    if not addr:
        return None
    headers = reactor_auth_header()
    body = {
        'query': addr,
        'resultTypes': ['ADDRESS'],
        'assets': REACTOR_SEARCH_ASSETS,
    }
    try:
        r = requests.post(f'{REACTOR_BASE_URL}/api/v2/search', headers=headers, json=body, timeout=15)
        if r.status_code != 200:
            print(f"[Reactor] HTTP {r.status_code} per addr={addr[:14]}...")
            return None
        results = r.json()
        if not results:
            return None
        info = results[0].get('info', {})
        # Cerca prima in searchedAddresses (chain specifica dell'indirizzo cercato)
        for sa in info.get('searchedAddresses', []):
            mainnet = _parse_reactor_asset_to_mainnet(sa.get('asset', ''))
            if mainnet:
                print(f"[Reactor] chain={mainnet} per addr={addr[:14]}...")
                return mainnet
        # Fallback: asset principale del risultato
        mainnet = _parse_reactor_asset_to_mainnet(info.get('asset', ''))
        if mainnet:
            print(f"[Reactor] chain={mainnet} (fallback) per addr={addr[:14]}...")
            return mainnet
    except Exception as e:
        print(f"[Reactor] Errore per addr={addr[:14]}...: {e}")
    return None


def is_evm_address(value):
    v = str(value).strip()
    return v.startswith("0x") and len(v) == 42


def is_evm_tx_hash(value):
    v = str(value).strip()
    return v.startswith("0x") and len(v) == 66


def is_probably_stellar_address(value):
    addr = str(value).strip()
    if len(addr) != 56 or not addr.startswith("G"):
        return False
    return all(ch in STELLAR_BASE32_ALPHABET for ch in addr)


def is_probably_monero_address(value):
    """Monero standard address: 95 caratteri, inizia con '4'.
       Monero subaddress:        95 caratteri, inizia con '8'.
       Monero integrated address: 106 caratteri, inizia con '4'."""
    addr = str(value).strip()
    return len(addr) in (95, 106) and addr[0] in ('4', '8')


def _chainalysis_payload_has_data(payload):
    if isinstance(payload, list):
        return len(payload) > 0
    if isinstance(payload, dict):
        for key in ("data", "results", "transactions", "entities", "alerts", "hits"):
            value = payload.get(key)
            if isinstance(value, (list, dict)) and value:
                return True
        return len(payload) > 0
    return payload is not None


def _chainalysis_data_contains_hash(payload, tx_hash):
    """Ritorna True solo se il payload include davvero lo specifico tx hash."""
    wanted = str(tx_hash).strip().lower()
    if not wanted:
        return False

    if not isinstance(payload, dict):
        return False

    candidates = []
    for key in ("data", "results", "transactions"):
        value = payload.get(key)
        if isinstance(value, list):
            candidates.extend(value)
        elif isinstance(value, dict):
            candidates.append(value)

    if not candidates:
        candidates = [payload]

    for item in candidates:
        if not isinstance(item, dict):
            continue
        direct_hash = str(item.get("hash", "")).strip().lower()
        attrs_hash = str(item.get("attributes", {}).get("hash", "")).strip().lower()
        tx_hash_field = str(item.get("transaction_hash", "")).strip().lower()
        if wanted in (direct_hash, attrs_hash, tx_hash_field):
            return True
    return False


def chainalysis_auth_header():
    return {
        "Authorization": f"Bearer {CHAINALYSIS_API_TOKEN}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


# Normalizza un ticker o mainnet nel nome mainnet standard
def postprocessa_asset(asset):
    if not asset:
        return ""
    asset = str(asset).strip().upper()
    # Import differito per evitare circolarità (MAPPATURA_ASSET_CLUSTER definita più avanti)
    # Verrà chiamata solo dopo che il modulo è caricato
    for tupla in MAPPATURA_ASSET_CLUSTER:
        if asset == tupla[0].upper() or asset == tupla[2].upper():
            return tupla[2]
    mapped = MAPPATURA_ASSET.get(asset)
    if mapped:
        return mapped
    return asset

def trova_foglio(xls, nome):
    """Cerca un foglio in modo case-insensitive, restituisce il nome reale."""
    for s in xls.sheet_names:
        if s.strip().lower() == str(nome).strip().lower():
            return s
    return nome

def get_col(row, col, default=""):
    """Legge un valore da una riga pandas in modo case-insensitive sul nome colonna."""
    col_l = str(col).strip().lower()
    for k in row.index:
        if str(k).strip().lower() == col_l:
            return row[k]
    return default

# Funzione per interrogare Ankr e ottenere la chain da un address (fallback per address EVM-like)
def get_chain_from_ankr(address):
    url = "https://rpc.ankr.com/multichain"
    headers = {"Content-Type": "application/json"}
    data = {
        "jsonrpc": "2.0",
        "method": "ankr_getAccountBalance",
        "params": {"walletAddress": address},
        "id": 1
    }
    try:
        response = requests.post(url, headers=headers, data=json.dumps(data), timeout=10)
        if response.status_code == 200:
            result = response.json().get("result", {})
            chains = result.get("assets", [])
            if chains:
                # Prendi la chain con balance > 0, altrimenti la prima
                for chain in chains:
                    if chain.get("balance", "0") not in (None, "0", 0):
                        return chain.get("blockchain")
                return chains[0].get("blockchain")
    except Exception as e:
        print(f"[ANKR ERROR] {e}")
    return None

# Funzione centralizzata per determinare l'asset finale (con fallback RPC)
def asset_output_finale(asset, address=None, network=None):
    asset = str(asset).strip().upper() if asset else ""
    address = str(address).strip() if address else ""
    network = str(network).strip().lower() if network else None

    # 1. Prova mapping diretto (asset o mainnet)
    for tupla in MAPPATURA_ASSET_CLUSTER:
        if asset == tupla[0] or asset == tupla[2]:
            return tupla[2]

    # 2. Prova mapping tramite network string
    if network:
        for tupla in MAPPATURA_ASSET_CLUSTER:
            if network == tupla[1] or network == tupla[2].lower():
                return tupla[2]

    # 3. Prova mapping tramite prefisso address
    # Gli hash di transazione a 64 caratteri hex non sono indirizzi wallet: escludili.
    _is_raw_tx_hash = len(address) == 64 and all(c in '0123456789abcdefABCDEF' for c in address)
    if address and not _is_raw_tx_hash:
        for tupla in MAPPATURA_ASSET_CLUSTER:
            if len(tupla) > 3:
                prefissi = tupla[3]
                if isinstance(prefissi, str):
                    prefissi = [prefissi]
                for pref in prefissi:
                    if address.startswith(pref):
                        if tupla[2] == "STELLAR_MAINNET" and not is_probably_stellar_address(address):
                            continue
                        return tupla[2]

    # 4. Fallback: se address EVM-like, prova RPC Ankr
    if address and address.startswith("0x") and len(address) == 42:
        chain = get_chain_from_ankr(address)
        if chain:
            for tupla in MAPPATURA_ASSET_CLUSTER:
                if chain.lower() == tupla[1]:
                    return tupla[2]

    # 5. Fallback: restituisci asset originale se valido
    if asset in ASSET_OUTPUT_VALIDI:
        return asset

    # 6. Fallback: controllo Chainalysis
    chainalysis_result = resolve_asset_with_chainalysis(asset, address)
    if chainalysis_result:
        return chainalysis_result
    return "UNKNOWN"
import pandas as pd
import os

MAPPATURA_ASSET = {
    'ARB': 'ARBITRUM_ONE_MAINNET',
    'AVAX': 'AVALANCHE_C_CHAIN_MAINNET',
    'BASE': 'BASE_MAINNET',
    'BTC': 'BITCOIN_MAINNET',
    'BCH': 'BITCOIN_CASH_MAINNET',
    'BSC': 'BNB_SMART_CHAIN_MAINNET',
    'DASH': 'DASH_MAINNET',
    'DOGE': 'DOGECOIN_MAINNET',
    'ETH': 'ETHEREUM_MAINNET',
    'INK': 'INK_MAINNET',
    'KAIA': 'KAIA_MAINNET',
    'LINEA': 'LINEA_MAINNET',
    'LTC': 'LITECOIN_MAINNET',
    'OP': 'OPTIMISM_MAINNET',
    'PLASM': 'PLASMA_MAINNET',
    'POL': 'POLYGON_POS_MAINNET',
    'MATIC': 'POLYGON_POS_MAINNET',
    'SOL': 'SOLANA_MAINNET',
    'SNE': 'SONEIUM_MAINNET',
    'XLM': 'STELLAR_MAINNET',
    'SUI': 'SUI_MAINNET',
    'TEMPO': 'TEMPO_MAINNET',
    'TON': 'TON_MAINNET',
    'TRX': 'TRON_MAINNET',
    'UNI': 'UNICHAIN_MAINNET',
    'WLD': 'WORLD_MAINNET',
    'OKB': 'XLAYER_MAINNET',
    'XRP': 'XRP_MAINNET',
    'ZEC': 'ZCASH_MAINNET',
    'ZK': 'ZK_SYNC_MAINNET',
}

# Lista per i vari cluster, da aggiornare quando necessario
MAPPATURA_ASSET_CLUSTER = [
    ("ARB", "arbitrum-one-mainnet", "ARBITRUM_ONE_MAINNET"),
    ("AVAX", "avalanche-c-chain-mainnet", "AVALANCHE_C_CHAIN_MAINNET"),
    ("BASE", "base-mainnet", "BASE_MAINNET"),
    ("BTC", "bitcoin-mainnet", "BITCOIN_MAINNET", ("1", "3", "bc1q", "bc1p")),
    ("BCH", "bitcoin-cash-mainnet", "BITCOIN_CASH_MAINNET", ("q", "p", "bitcoincash:")),
    ("BSC", "bnb-smart-chain-mainnet", "BNB_SMART_CHAIN_MAINNET"),
    ("DASH", "dash-mainnet", "DASH_MAINNET", "X"),
    ("DOGE", "dogecoin-mainnet", "DOGECOIN_MAINNET", "D"),
    ("ETH", "ethereum-mainnet", "ETHEREUM_MAINNET"),
    ("INK", "ink-mainnet", "INK_MAINNET"),
    ("KAIA", "kaia-mainnet", "KAIA_MAINNET"),
    ("LINEA", "linea-mainnet", "LINEA_MAINNET"),
    ("LTC", "litecoin-mainnet", "LITECOIN_MAINNET" , ("L", "M", "ltc1")),
    ("OP", "optimism-mainnet", "OPTIMISM_MAINNET"),
    ("PLASM", "plasma-mainnet", "PLASMA_MAINNET"),
    ("POL", "polygon-pos-mainnet", "POLYGON_POS_MAINNET"),
    ("SOL", "solana-mainnet", "SOLANA_MAINNET"),
    ("SNE", "soneium-mainnet", "SONEIUM_MAINNET"),
    ("XLM", "stellar-mainnet", "STELLAR_MAINNET", "G"),
    ("SUI", "sui-mainnet", "SUI_MAINNET"),
    ("TEMPO", "tempo-mainnet", "TEMPO_MAINNET"),
    ("TON", "ton-mainnet", "TON_MAINNET", ("EQ", "UQ", "0:")),
    ("TRX", "tron-mainnet", "TRON_MAINNET", "T"),
    ("UNI", "unichain-mainnet", "UNICHAIN_MAINNET"),
    ("WLD", "world-mainnet", "WORLD_MAINNET"),
    ("OKB", "xlayer-mainnet", "XLAYER_MAINNET"),
    ("XRP", "xrp-mainnet", "XRP_MAINNET", "r"),
    ("ZEC", "zcash-mainnet", "ZCASH_MAINNET", ("t1", "t3", "z", "u")),
    ("ZK", "zk-sync-mainnet", "ZK_SYNC_MAINNET"),
]

# Mapping nomi blockchain Ankr → mainnet Chainalysis
ANKR_BLOCKCHAIN_TO_MAINNET = {
    "eth":             "ETHEREUM_MAINNET",
    "bsc":             "BNB_SMART_CHAIN_MAINNET",
    "polygon":         "POLYGON_POS_MAINNET",
    "arbitrum":        "ARBITRUM_ONE_MAINNET",
    "optimism":        "OPTIMISM_MAINNET",
    "avalanche":       "AVALANCHE_C_CHAIN_MAINNET",
    "base":            "BASE_MAINNET",
    "linea":           "LINEA_MAINNET",
    "zksync_era":      "ZK_SYNC_MAINNET",
    "tron":            "TRON_MAINNET",
    "solana":          "SOLANA_MAINNET",
    "bitcoin":         "BITCOIN_MAINNET",
    "dogecoin":        "DOGECOIN_MAINNET",
    "litecoin":        "LITECOIN_MAINNET",
}

# Lista RPC e API
RPC_API = {
"ARBITRUM_ONE_MAINNET": [
    "https://arb1.arbitrum.io/rpc",
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=arbitrum-one-mainnet",
],
"AVALANCHE_C_CHAIN_MAINNET": [
    "https://api.avax.network/ext/bc/C/rpc",
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=avalanche-c-chain-mainnet",
],
"BASE_MAINNET": [
    "https://mainnet.base.org",
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=base-mainnet",
],
"BITCOIN_MAINNET": [
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=bitcoin-mainnet",
],
"BITCOIN_CASH_MAINNET": [
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=bitcoin-cash-mainnet",
],
"BNB_SMART_CHAIN_MAINNET": [
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=bnb-smart-chain-mainnet",
],
"DASH_MAINNET": [
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=dash-mainnet",
],
"DOGECOIN_MAINNET": [
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=dogecoin-mainnet",
],
"ETHEREUM_MAINNET": [
    "https://cloudflare-eth.com",
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=ethereum-mainnet",
],
"INK_MAINNET": [
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=ink-mainnet",
],
"KAIA_MAINNET": [
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=kaia-mainnet",
],
"LINEA_MAINNET": [
    "https://rpc.linea.build",
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=linea-mainnet",
],
"LITECOIN_MAINNET": [
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=litecoin-mainnet",
],
"OPTIMISM_MAINNET": [
    "https://mainnet.optimism.io",
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=optimism-mainnet",
],
"PLASMA_MAINNET": [
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=plasma-mainnet",
],
"POLYGON_POS_MAINNET": [
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=polygon-pos-mainnet",
],
"SOLANA_MAINNET": [
    "https://api.mainnet-beta.solana.com",
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=solana-mainnet",
],
"SONEIUM_MAINNET": [
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=soneium-mainnet",
],
"STELLAR_MAINNET": [
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=stellar-mainnet",
],
"SUI_MAINNET": [
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=sui-mainnet",
],
"TEMPO_MAINNET": [
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=tempo-mainnet",
],
"TON_MAINNET": [
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=ton-mainnet",
],
"TRON_MAINNET": [
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=tron-mainnet",
],
"UNICHAIN_MAINNET": [
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=unichain-mainnet",
],
"WORLD_MAINNET": [
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=world-mainnet",
],
"XLAYER_MAINNET": [
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=xlayer-mainnet",
],
"XRP_MAINNET": [
    "https://xrplcluster.com",
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=xrp-mainnet",
],
"ZCASH_MAINNET": [
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=zcash-mainnet",
],
"ZK_SYNC_MAINNET": [
    "https://mainnet.era.zksync.io",
    "https://api.chainalysis.com/api/kyt/v2/addresses/<address>?network=zk-sync-mainnet",
]
# Aggiungere altre chain e i loro RPC/API se necessario
}

ASSET_OUTPUT_VALIDI = {
    str(asset).strip().upper()
    for asset in (
        list(MAPPATURA_ASSET.keys())
        + list(MAPPATURA_ASSET.values())
        + [tupla[0] for tupla in MAPPATURA_ASSET_CLUSTER]
        + [tupla[2] for tupla in MAPPATURA_ASSET_CLUSTER if len(tupla) >= 3]
    )
    if str(asset).strip()
}

def scrivi_asset_supportati(file_output):
    asset_file = file_output + '.assets.txt'
    asset_list = sorted(ASSET_OUTPUT_VALIDI)
    with open(asset_file, 'w', encoding='utf-8') as f:
        for asset in asset_list:
            f.write(asset + '\n')


# --- TRM OUTPUT SUPPORT ---

# Bridge: our internal mainnet names → Blockchain code as used in TRM's supported_assets CSV
_MAINNET_TO_CSV_BLOCKCHAIN = {
    "ARBITRUM_ONE_MAINNET":      "ARBITRUM",
    "AVALANCHE_C_CHAIN_MAINNET": "AVAX",
    "BASE_MAINNET":              "BASE",
    "BITCOIN_MAINNET":           "BTC",
    "BITCOIN_CASH_MAINNET":      "BCH",
    "BNB_SMART_CHAIN_MAINNET":   "BSC",
    "DASH_MAINNET":              "DASH",
    "DOGECOIN_MAINNET":          "DOGE",
    "ETHEREUM_MAINNET":          "ETH",
    "INK_MAINNET":               "INK",
    "KAIA_MAINNET":              "KAIA",
    "LINEA_MAINNET":             "LINEA",
    "LITECOIN_MAINNET":          "LTC",
    "OPTIMISM_MAINNET":          "OPTIMISM",
    "PLASMA_MAINNET":            "PLASMA",
    "POLYGON_POS_MAINNET":       "MATIC",
    "SOLANA_MAINNET":            "SOL",
    "SONEIUM_MAINNET":           "SNE",
    "STELLAR_MAINNET":           "XLM",
    "SUI_MAINNET":               "SUI",
    "TEMPO_MAINNET":             "TEMPO",
    "TON_MAINNET":               "TON",
    "TRON_MAINNET":              "TRX",
    "UNICHAIN_MAINNET":          "UNICHAIN",
    "WORLD_MAINNET":             "WORLDCHAIN",
    "XLAYER_MAINNET":            "OKB",
    "XRP_MAINNET":               "XRPL",
    "ZCASH_MAINNET":             "ZEC",
    "ZK_SYNC_MAINNET":           "ZKSYNC",
}


def _load_trm_blockchain_map():
    """
    Carica il CSV supported_assets_*.csv dalla directory dello script
    e restituisce un dict {BLOCKCHAIN_CODE_UPPER: trm_chain_id}.
    Il file più recente (per nome) viene usato se ce ne sono più di uno.
    """
    import csv as _csv, glob as _glob
    script_dir = os.path.dirname(os.path.abspath(__file__))
    files = sorted(_glob.glob(os.path.join(script_dir, "supported_assets_*.csv")), reverse=True)
    if not files:
        return {}
    result = {}
    try:
        with open(files[0], newline='', encoding='utf-8') as fh:
            reader = _csv.DictReader(fh)
            for row in reader:
                blockchain = row.get("Blockchain", "").strip().upper()
                trm_id = row.get("Blockchain TRM ID", "").strip()
                if blockchain and trm_id and blockchain not in result:
                    result[blockchain] = trm_id
    except Exception as e:
        print(f"[TRM] Errore caricamento supported_assets: {e}")
    return result


def _load_asset_to_trm_chains():
    """
    Legge il CSV supported_assets e costruisce un indice
    {ASSET_UPPER: set(trm_chain_id)} per filtrare le chiamate RPC
    solo alle chain dove l'asset è effettivamente supportato.
    """
    import csv as _csv, glob as _glob
    script_dir = os.path.dirname(os.path.abspath(__file__))
    files = sorted(_glob.glob(os.path.join(script_dir, "supported_assets_*.csv")), reverse=True)
    if not files:
        return {}
    result = {}
    try:
        with open(files[0], newline='', encoding='utf-8') as fh:
            reader = _csv.DictReader(fh)
            for row in reader:
                asset  = row.get("Asset", "").strip().upper()
                trm_id = row.get("Blockchain TRM ID", "").strip()
                if asset and trm_id:
                    result.setdefault(asset, set()).add(trm_id)
    except Exception as e:
        print(f"[TRM] Errore caricamento asset→chain map: {e}")
    return result


# Carica mapping blockchain code → TRM chain ID dal CSV (eseguito una volta al caricamento modulo)
_CSV_BLOCKCHAIN_TO_TRM_ID = _load_trm_blockchain_map()

# Indice asset → set di TRM chain ID (per filtrare RPC nel raffinamento EVM)
_CSV_ASSET_TO_TRM_CHAINS = _load_asset_to_trm_chains()

# Mapping completo: mainnet Chainalysis + ticker → TRM Blockchain TRM ID
MAINNET_TO_TRM_CHAIN_ID = {}
for _mainnet, _csv_code in _MAINNET_TO_CSV_BLOCKCHAIN.items():
    _trm_id = _CSV_BLOCKCHAIN_TO_TRM_ID.get(_csv_code)
    if _trm_id:
        MAINNET_TO_TRM_CHAIN_ID[_mainnet] = _trm_id
# Aggiungi anche i ticker come alias (es. ETH → eth, BTC → bitcoin)
for _tupla in MAPPATURA_ASSET_CLUSTER:
    _ticker  = _tupla[0]
    _mainnet = _tupla[2]
    _trm_id  = MAINNET_TO_TRM_CHAIN_ID.get(_mainnet)
    if _trm_id and _ticker not in MAINNET_TO_TRM_CHAIN_ID:
        MAINNET_TO_TRM_CHAIN_ID[_ticker] = _trm_id


# Mapping inverso: TRM chain ID (dal CSV) → nome mainnet Chainalysis
# Disponibile dopo che MAINNET_TO_TRM_CHAIN_ID è stato popolato.
TRM_CHAIN_ID_TO_MAINNET = {}


def _build_trm_chain_id_to_mainnet():
    """Costruisce TRM_CHAIN_ID_TO_MAINNET come inverso di MAINNET_TO_TRM_CHAIN_ID
    (solo chiavi che terminano in _MAINNET per evitare duplicati con i ticker)."""
    global TRM_CHAIN_ID_TO_MAINNET
    TRM_CHAIN_ID_TO_MAINNET = {
        v: k for k, v in MAINNET_TO_TRM_CHAIN_ID.items()
        if k.endswith('_MAINNET')
    }


_build_trm_chain_id_to_mainnet()


def get_trm_chain_id(asset_or_mainnet):
    """
    Dato un asset (ticker o mainnet Chainalysis), restituisce il Blockchain TRM ID
    come appare nel CSV supported_assets_*.csv.
    Fallback: cerca nel CSV per blockchain code, poi tenta la TRM API.
    """
    val = str(asset_or_mainnet).strip().upper()
    if not val or val == "UNKNOWN":
        return ""
    # 1. Lookup diretto (mainnet o ticker già mappato)
    trm_id = MAINNET_TO_TRM_CHAIN_ID.get(val)
    if trm_id:
        return trm_id
    # 2. Tramite MAPPATURA_ASSET (alias ticker → mainnet)
    mainnet = MAPPATURA_ASSET.get(val)
    if mainnet:
        trm_id = MAINNET_TO_TRM_CHAIN_ID.get(mainnet.upper())
        if trm_id:
            return trm_id
    # 3. Cerca direttamente nel CSV per blockchain code
    trm_id = _CSV_BLOCKCHAIN_TO_TRM_ID.get(val)
    if trm_id:
        return trm_id
    return ""


def _raw_network_to_trm_id(raw_network):
    """
    Dato un valore raw di network/chain dal file sorgente (es. 'ETH', 'BSC', 'TRC20'),
    cerca nel CSV supported_assets e restituisce il Blockchain TRM ID corrispondente.
    """
    if not raw_network:
        return None
    net_upper = str(raw_network).strip().upper()
    if not net_upper:
        return None
    # 0. Nomi di protocollo/standard token → blockchain sottostante
    #    (ERC20/BEP20/TRC20 sono standard, non blockchain: vanno risolti prima del CSV)
    _PROTOCOL_TO_MAINNET = {
        'ERC20': 'ETHEREUM_MAINNET',
        'BEP20': 'BNB_SMART_CHAIN_MAINNET',
        'TRC20': 'TRON_MAINNET',
        'SPL':   'SOLANA_MAINNET',
    }
    protocol_mainnet = _PROTOCOL_TO_MAINNET.get(net_upper)
    if protocol_mainnet:
        trm_id = MAINNET_TO_TRM_CHAIN_ID.get(protocol_mainnet)
        if trm_id:
            return trm_id
    # 1. Lookup diretto nella colonna Blockchain del CSV
    trm_id = _CSV_BLOCKCHAIN_TO_TRM_ID.get(net_upper)
    if trm_id:
        return trm_id
    # 2. Via MAINNET_TO_TRM_CHAIN_ID (mainnet name → TRM ID)
    trm_id = MAINNET_TO_TRM_CHAIN_ID.get(net_upper)
    if trm_id:
        return trm_id
    # 3. Via MAPPATURA_ASSET (ticker → mainnet → TRM ID)
    mainnet = MAPPATURA_ASSET.get(net_upper)
    if mainnet:
        trm_id = MAINNET_TO_TRM_CHAIN_ID.get(mainnet.upper())
        if trm_id:
            return trm_id
    # 4. Via postprocessa_asset (normalizza ticker/mainnet)
    normalized = postprocessa_asset(net_upper)
    if normalized and normalized != net_upper:
        trm_id = MAINNET_TO_TRM_CHAIN_ID.get(normalized)
        if trm_id:
            return trm_id
    return None


# Normalizzazione nomi per esteso → ticker TRM standard.
# Usato in _salva_trm per convertire i nomi verbosi che alcuni exchange
# (es. Coinbase) scrivono nella colonna Currency.
_TRM_CURRENCY_NORMALIZE = {
    'BITCOIN':          'BTC',
    'ETHEREUM':         'ETH',
    'ETHER':            'ETH',
    'TETHER':           'USDT',
    'TETHER USD':       'USDT',
    'USD COIN':         'USDC',
    'USDCOIN':          'USDC',
    'SOLANA':           'SOL',
    'RIPPLE':           'XRP',
    'LITECOIN':         'LTC',
    'DOGECOIN':         'DOGE',
    'STELLAR LUMENS':   'XLM',
    'STELLAR':          'XLM',
    'CARDANO':          'ADA',
    'POLKADOT':         'DOT',
    'CHAINLINK':        'LINK',
    'POLYGON':          'MATIC',
    'AVALANCHE':        'AVAX',
    'BINANCE COIN':     'BNB',
    'SHIBA INU':        'SHIB',
    'TRON':             'TRX',
    'WRAPPED BITCOIN':  'WBTC',
}


def _salva_trm(df, file_output):
    """
    Salva il CSV in formato TRM:
    Transaction Hash,Destination Address,Direction,Asset,Blockchain

    - deposit: Transaction Hash vuoto, Destination Address = Deposit Address or Hash
    - sent:    Transaction Hash = Deposit Address or Hash,
               Destination Address = Output index or Counterparty Address
    - Direction: deposit → Deposit, sent → Withdrawal
    - Asset:     valore raw dalla colonna _trm_asset (Currency, coin, ecc.) o
                 codice blockchain derivato dal mainnet normalizzato
    - Blockchain: Blockchain TRM ID dal CSV supported_assets
    """
    cols_map        = {str(c).strip().lower(): c for c in df.columns}
    type_col        = cols_map.get('type')
    hash_col        = cols_map.get('deposit address or hash')
    counterpart_col = cols_map.get('output index or counterparty address')
    asset_col       = cols_map.get('asset')
    trm_asset_col   = cols_map.get('_trm_asset')
    trm_network_col = cols_map.get('_trm_network')
    trm_tx_hash_col = cols_map.get('_trm_tx_hash')

    if type_col is None or hash_col is None or counterpart_col is None or asset_col is None:
        print("[TRM] Colonne mancanti nel DataFrame, impossibile generare output TRM")
        return

    seen = set()
    rows = []
    for _, row in df.iterrows():
        row_type  = str(row[type_col]).strip().lower()
        asset_val = str(row[asset_col]).strip().upper()  # mainnet normalizzato

        # Raw ticker da _trm_asset (preferito), oppure codice blockchain dal mainnet
        if trm_asset_col:
            raw_ticker = str(row[trm_asset_col]).strip()
            if raw_ticker.lower() in ('nan', 'none', ''):
                raw_ticker = _MAINNET_TO_CSV_BLOCKCHAIN.get(asset_val, asset_val)
        else:
            raw_ticker = _MAINNET_TO_CSV_BLOCKCHAIN.get(asset_val, asset_val)
        if not raw_ticker:
            raw_ticker = asset_val

        # Normalizza nomi per esteso (es. Coinbase) → ticker TRM standard
        raw_ticker = _TRM_CURRENCY_NORMALIZE.get(raw_ticker.upper(), raw_ticker)

        # Raw network da _trm_network (se disponibile)
        raw_network = ''
        if trm_network_col:
            rn = str(row[trm_network_col]).strip()
            if rn.lower() not in ('nan', 'none', ''):
                raw_network = rn

        if row_type == 'sent':
            tx_hash   = str(row[hash_col]).strip()
            dest_addr = str(row[counterpart_col]).strip()
            if not tx_hash or tx_hash.lower() in ('nan', 'none', ''):
                continue
            direction      = 'Withdrawal'
            addr_for_chain = dest_addr
        else:  # deposit
            # Hash della transazione di deposito entrante (da _trm_tx_hash se disponibile)
            if trm_tx_hash_col:
                raw_tx = str(row[trm_tx_hash_col]).strip()
                tx_hash = '' if raw_tx.lower() in ('nan', 'none', '') else raw_tx
            else:
                tx_hash = ''
            dest_addr = str(row[hash_col]).strip()
            if not dest_addr or dest_addr.lower() in ('nan', 'none', ''):
                continue
            # Salta se il valore è un tx hash EVM (non è un indirizzo wallet)
            if is_evm_tx_hash(dest_addr):
                continue
            direction      = 'Deposit'
            addr_for_chain = dest_addr

        if not dest_addr or dest_addr.lower() in ('nan', 'none', ''):
            continue

        # Determina Blockchain TRM ID
        blockchain = ''
        if raw_network:
            blockchain = _raw_network_to_trm_id(raw_network) or ''
        if not blockchain:
            blockchain = get_trm_chain_id(asset_val)
        if not blockchain and is_evm_address(addr_for_chain):
            chain_mainnet = resolve_chain_with_trm(addr_for_chain)
            if not chain_mainnet:
                chain_mainnet = resolve_chain_with_chainalysis_by_address(addr_for_chain)
            if chain_mainnet:
                blockchain = get_trm_chain_id(chain_mainnet) or chain_mainnet.lower()
        if not blockchain and raw_ticker:
            # Fallback: prova il ticker grezzo come codice blockchain nel CSV
            # (utile per asset come XMR non presenti nel mapping mainnet)
            blockchain = _raw_network_to_trm_id(raw_ticker) or get_trm_chain_id(raw_ticker.upper())

        # Per deposit con EVM tx hash: raffina la chain se il network è generico
        # (ERC20/BEP20 vengono usati dagli exchange per qualsiasi chain EVM, non solo Ethereum/BSC)
        _GENERIC_EVM_PROTOCOLS = {'ERC20', 'ERC-20', 'BEP20', 'BEP-20'}
        raw_net_upper = raw_network.upper() if raw_network else ''
        if (tx_hash and is_evm_tx_hash(tx_hash) and
                (not raw_network or raw_net_upper in _GENERIC_EVM_PROTOCOLS)):
            # 1. Prima: file locali — il ticker grezzo identifica univocamente una chain?
            _local_chain = (_raw_network_to_trm_id(raw_ticker) if raw_ticker else None) or \
                           (get_trm_chain_id(raw_ticker.upper()) if raw_ticker else None)
            if _local_chain and _local_chain not in ('eth', 'erc20', 'binance_smart_chain'):
                # Asset single-chain (es. ARB, MATIC) — nessuna chiamata esterna
                blockchain = _local_chain
            else:
                # Asset multi-chain (USDC, USDT, ETH…):
                # 1. Usa il CSV per sapere su quali chain EVM è supportato questo asset
                ticker_upper = raw_ticker.upper() if raw_ticker else ''
                csv_trm_chains = _CSV_ASSET_TO_TRM_CHAINS.get(ticker_upper, set())
                if csv_trm_chains:
                    # Converti TRM chain ID → mainnet Chainalysis
                    chain_filter = {TRM_CHAIN_ID_TO_MAINNET[c] for c in csv_trm_chains
                                    if c in TRM_CHAIN_ID_TO_MAINNET}
                    chain_filter.discard(None)
                else:
                    chain_filter = None  # asset sconosciuto: prova tutte le chain
                # 2. RPC pubblici gratuiti, limitati alle chain del CSV
                refined = resolve_chain_with_chainalysis_by_tx_hash(tx_hash, chain_filter=chain_filter)
                if refined:
                    refined_trm = get_trm_chain_id(refined)
                    if refined_trm:
                        blockchain = refined_trm

        if not blockchain:
            print(f"[TRM] Blockchain non trovata per {dest_addr[:20]}..., riga esclusa")
            continue

        key = (tx_hash, dest_addr, direction, raw_ticker.upper(), blockchain)
        if key in seen:
            continue
        seen.add(key)
        rows.append({
            'Transaction Hash': tx_hash,
            'Destination Address': dest_addr,
            'Direction': direction,
            'Asset': raw_ticker,
            'Blockchain': blockchain,
        })

    if rows:
        import pandas as _pd
        df_trm = _pd.DataFrame(rows, columns=['Transaction Hash', 'Destination Address', 'Direction', 'Asset', 'Blockchain'])
        df_trm.to_csv(file_output, index=False, encoding='utf-8')
        print(f"\nSuccesso! File TRM creato: {file_output}")
    else:
        print("\nNessun dato TRM trovato da esportare.")


def elimina_duplicati_depositi(df):
    """
    Rimuove duplicati depositi (Type=deposit) per stesso 'deposit address or hash'.
    Tra i duplicati preferisce la riga il cui asset è presente in MAPPATURA_ASSET_CLUSTER
    (asset mainnet valido); in caso di parità mantiene la prima occorrenza.
    Le righe 'sent' vengono restituite invariate.
    """
    if df is None or df.empty:
        return df

    # In TRM mode mantieni tutti i depositi (uno per transazione, con il proprio txid)
    if os.environ.get('OUTPUT_SERVICE', '').lower() == 'trm':
        return df

    orig_cols = df.columns.tolist()
    cols_lower = [str(c).strip().lower() for c in orig_cols]

    if 'deposit address or hash' not in cols_lower:
        return df

    df_work = df.copy()
    df_work.columns = cols_lower

    # Separa depositi e sent
    if 'type' in cols_lower:
        mask_dep = df_work['type'].str.strip().str.lower() == 'deposit'
        df_dep = df_work[mask_dep].copy()
        df_other = df_work[~mask_dep].copy()
    else:
        df_dep = df_work.copy()
        df_other = df_work.iloc[0:0].copy()

    if df_dep.empty:
        df_work.columns = orig_cols
        return df_work

    mainnet_validi = {str(t[2]).strip().upper() for t in MAPPATURA_ASSET_CLUSTER}

    def _priorita(asset):
        return 0 if str(asset).strip().upper() in mainnet_validi else 1

    if 'asset' in cols_lower:
        df_dep['_prio'] = df_dep['asset'].apply(_priorita)
        df_dep = df_dep.sort_values('_prio', kind='stable')
        df_dep = df_dep.drop_duplicates(subset=['deposit address or hash'], keep='first')
        df_dep = df_dep.drop(columns=['_prio'])
    else:
        df_dep = df_dep.drop_duplicates(subset=['deposit address or hash'], keep='first')

    result = pd.concat([df_dep, df_other], ignore_index=True)
    result.columns = orig_cols
    return result



# --- CHAINALYSIS UTILS GLOBALI ---

def resolve_asset_with_chainalysis(asset, address):
    chain_key = None
    for tupla in MAPPATURA_ASSET_CLUSTER:
        if asset == tupla[0]:
            chain_key = tupla[2]
            break
    if not chain_key:
        return None
    endpoints = RPC_API.get(chain_key, [])
    headers = chainalysis_auth_header()
    for url in endpoints:
        if "chainalysis.com" in url and address:
            url_test = url.replace("<address>", address)
            try:
                r = requests.get(url_test, headers=headers, timeout=10)
                if r.status_code == 200:
                    data = r.json()
                    if _chainalysis_payload_has_data(data):
                        return chain_key
            except Exception:
                continue
    return None


def resolve_chain_with_chainalysis_by_address(address, preferred_chain=None):
    """Identifica la chain di un indirizzo usando prima Reactor search API, poi KYT v2."""
    addr = str(address).strip()
    if not addr:
        return None

    # 1. Reactor search API (metodo principale, funzionante con il token corrente)
    result = resolve_chain_with_reactor_search(addr)
    if result:
        return result

    # 2. Fallback: KYT v2 (potrebbe non essere accessibile con questo token)
    chain_keys = []
    if preferred_chain and preferred_chain in RPC_API:
        chain_keys.append(preferred_chain)
    chain_keys.extend([k for k in RPC_API.keys() if k not in chain_keys])

    headers = chainalysis_auth_header()
    for chain_key in chain_keys:
        endpoints = RPC_API.get(chain_key, [])
        for url in endpoints:
            if "chainalysis.com" not in url:
                continue
            url_test = url.replace("<address>", addr)
            try:
                r = requests.get(url_test, headers=headers, timeout=10)
                if r.status_code == 200:
                    data = r.json()
                    if _chainalysis_payload_has_data(data):
                        print(f"[KYT] Trovata chain: {chain_key} per addr={addr[:14]}...")
                        return chain_key
            except Exception:
                continue
    # 3. Fallback: TRM Labs
    result = resolve_chain_with_trm(addr)
    if result:
        return result

    print(f"[Reactor/TRM] Nessuna chain trovata per addr={addr[:14]}...")
    return None


def resolve_chain_with_chainalysis_by_tx_hash(tx_hash, preferred_chain=None, wallet_address=None, chain_filter=None):
    """Identifica la chain EVM di un tx hash via RPC pubblici, poi KYT v2 come fallback.
    chain_filter: set/list di mainnet Chainalysis da provare (None = tutte)."""
    tx = str(tx_hash).strip()
    if not is_evm_tx_hash(tx):
        return None

    # RPC pubblici EVM ordinati per probabilità (L2 comuni prima, poi L1/altri)
    EVM_PUBLIC_RPCS = [
        ("ARBITRUM_ONE_MAINNET",       "https://arb1.arbitrum.io/rpc"),
        ("BNB_SMART_CHAIN_MAINNET",    "https://bsc-dataseed.binance.org/"),
        ("ETHEREUM_MAINNET",           "https://cloudflare-eth.com"),
        ("BASE_MAINNET",               "https://mainnet.base.org"),
        ("OPTIMISM_MAINNET",           "https://mainnet.optimism.io"),
        ("POLYGON_POS_MAINNET",        "https://polygon-rpc.com"),
        ("AVALANCHE_C_CHAIN_MAINNET",  "https://api.avax.network/ext/bc/C/rpc"),
        ("LINEA_MAINNET",              "https://rpc.linea.build"),
        ("ZK_SYNC_MAINNET",            "https://mainnet.era.zksync.io"),
    ]

    # Filtra per chain_filter se specificato (basato sui dati CSV dell'asset):
    # le chain nel filtro vengono provate per prime, poi le restanti come fallback
    if chain_filter:
        prioritized = [(k, u) for k, u in EVM_PUBLIC_RPCS if k in chain_filter]
        remaining   = [(k, u) for k, u in EVM_PUBLIC_RPCS if k not in chain_filter]
        base_list = prioritized + remaining  # CSV-matching prima, poi tutte le altre
    else:
        base_list = EVM_PUBLIC_RPCS

    # Metti preferred_chain in testa se specificato
    ordered = []
    if preferred_chain:
        ordered = [(k, u) for k, u in base_list if k == preferred_chain]
        ordered += [(k, u) for k, u in base_list if k != preferred_chain]
    else:
        ordered = base_list

    payload = {"jsonrpc": "2.0", "method": "eth_getTransactionReceipt", "params": [tx], "id": 1}
    for chain_key, rpc_url in ordered:
        try:
            r = requests.post(rpc_url, json=payload, timeout=8)
            if r.status_code == 200:
                data = r.json()
                if data.get("result"):
                    print(f"[RPC] Trovata chain: {chain_key} per tx={tx[:14]}...")
                    return chain_key
        except Exception:
            continue

    # Fallback: KYT v2 (potrebbe non essere accessibile con questo token)
    chain_keys = []
    if preferred_chain and preferred_chain in EVM_CHAIN_KEYS:
        chain_keys.append(preferred_chain)
    chain_keys.extend([k for k in EVM_CHAIN_KEYS if k not in chain_keys])
    headers = chainalysis_auth_header()
    wallet = str(wallet_address).strip() if wallet_address else ""
    for chain_key in chain_keys:
        network = None
        for tupla in MAPPATURA_ASSET_CLUSTER:
            if tupla[2] == chain_key:
                network = tupla[1]
                break
        if not network:
            continue
        tx_url = f"{CHAINALYSIS_BASE_URL}/api/kyt/v2/transactions/{quote(tx)}"
        try:
            r = requests.get(tx_url, headers=headers, params={"network": network}, timeout=10)
            if r.status_code == 200 and _chainalysis_data_contains_hash(r.json(), tx):
                return chain_key
        except Exception:
            pass
        if is_evm_address(wallet):
            try:
                wallet_url = f"{CHAINALYSIS_BASE_URL}/api/kyt/v2/addresses/{wallet}/transactions"
                r = requests.get(wallet_url, headers=headers,
                                 params={"network": network, "filter[hash]": tx, "page[size]": 100}, timeout=10)
                if r.status_code == 200 and _chainalysis_data_contains_hash(r.json(), tx):
                    return chain_key
            except Exception:
                continue

    # Fallback finale: TRM Labs
    result = resolve_chain_with_trm_tx(tx)
    if result:
        return result
    return None

def inferisci_asset_per_avviso(riga):
    return str(riga.get('Asset', '')).strip()

def normalizza_asset(asset, address=None, network=None):
    asset = str(asset).strip().upper() if asset else ""
    address = str(address).strip() if address else ""
    network = str(network).strip().lower() if network else None

    # 1. Prova mapping diretto (asset o mainnet)
    for tupla in MAPPATURA_ASSET_CLUSTER:
        if asset == tupla[0] or asset == tupla[2]:
            return tupla[2]

    # 2. Prova mapping tramite network string
    if network:
        for tupla in MAPPATURA_ASSET_CLUSTER:
            if network == tupla[1] or network == tupla[2].lower():
                return tupla[2]

    # 3. Prova mapping tramite prefisso address
    # Gli hash di transazione a 64 caratteri hex (es. Cardano, Bitcoin, ecc.) non sono indirizzi
    # wallet: un hash come "34bbd7af..." inizia con "3" ma NON è un indirizzo Bitcoin P2SH.
    _is_raw_tx_hash = len(address) == 64 and all(c in '0123456789abcdefABCDEF' for c in address)
    if address and not _is_raw_tx_hash:
        for tupla in MAPPATURA_ASSET_CLUSTER:
            if len(tupla) > 3:
                prefissi = tupla[3]
                if isinstance(prefissi, str):
                    prefissi = [prefissi]
                for pref in prefissi:
                    if address.startswith(pref):
                        if tupla[2] == "STELLAR_MAINNET" and not is_probably_stellar_address(address):
                            continue
                        return tupla[2]

    # 4. Se è tx hash EVM, prova a identificare la chain via Chainalysis.
    if is_evm_tx_hash(address):
        chain_chainalysis = resolve_chain_with_chainalysis_by_tx_hash(address)
        if chain_chainalysis:
            return chain_chainalysis

    # 5. Fallback: se address EVM-like, prova RPC Ankr
    if is_evm_address(address):
        chain = get_chain_from_ankr(address)
        if chain:
            for tupla in MAPPATURA_ASSET_CLUSTER:
                if chain.lower() == tupla[1]:
                    return tupla[2]

    # 5b. Per indirizzi EVM con token non mappati (es. USDT, token ERC-20, ecc.),
    #     interroga Chainalysis su tutte le chain EVM finché una risponde.
    if is_evm_address(address):
        chain_chainalysis = resolve_chain_with_chainalysis_by_address(address)
        if chain_chainalysis:
            return chain_chainalysis

    # 6. Fallback: restituisci asset originale se valido
    if asset in ASSET_OUTPUT_VALIDI:
        return asset

    # 7. Fallback: controllo Chainalysis
    chainalysis_result = resolve_asset_with_chainalysis(asset, address)
    if chainalysis_result:
        return chainalysis_result
    return "UNKNOWN"

def filtra_righe_asset_non_supportato(df):
    avvisi = []
    righe_da_correggere = {}
    righe_da_escludere = []
    if not df.empty:
        df.columns = [str(c).strip() for c in df.columns]
        for idx, riga in df.iterrows():
            asset_norm = str(riga.get('Asset', '')).strip().upper()
            deposit_address_or_hash = str(riga.get('Deposit Address or Hash', '')).strip()
            counterparty = str(riga.get('Output index or Counterparty Address', '')).strip()
            if not asset_norm or asset_norm in ASSET_OUTPUT_VALIDI:
                continue

            preferred_chain = None
            for tupla in MAPPATURA_ASSET_CLUSTER:
                if asset_norm in (tupla[0], tupla[2]):
                    preferred_chain = tupla[2]
                    break

            # Per hash 0x prova prima una risoluzione dedicata Chainalysis su chain EVM.
            if is_evm_tx_hash(deposit_address_or_hash):
                asset_tx = resolve_chain_with_chainalysis_by_tx_hash(
                    deposit_address_or_hash,
                    preferred_chain=preferred_chain,
                    wallet_address=counterparty if is_evm_address(counterparty) else None,
                )
                if asset_tx in ASSET_OUTPUT_VALIDI:
                    righe_da_correggere[idx] = asset_tx
                    continue

            asset_corretto = normalizza_asset(asset_norm, deposit_address_or_hash)
            asset_corretto_norm = str(asset_corretto).strip().upper()
            if asset_corretto_norm in ASSET_OUTPUT_VALIDI:
                righe_da_correggere[idx] = asset_corretto
                continue

            # Se il deposit address è un indirizzo EVM, interroga Chainalysis per trovare la chain
            if is_evm_address(deposit_address_or_hash):
                chain_trovata = resolve_chain_with_chainalysis_by_address(deposit_address_or_hash, preferred_chain=preferred_chain)
                if chain_trovata in ASSET_OUTPUT_VALIDI:
                    righe_da_correggere[idx] = chain_trovata
                    continue

            dettaglio = riga.to_dict()
            dettaglio['Asset'] = inferisci_asset_per_avviso(riga)
            dettaglio['Motivo esclusione'] = 'Mainnet non supportata da reactor.chainalysis'
            avvisi.append(dettaglio)
            righe_da_escludere.append(idx)
    if righe_da_correggere:
        for idx, new_asset in righe_da_correggere.items():
            df.at[idx, 'Asset'] = new_asset
    if righe_da_escludere:
        df = df.drop(righe_da_escludere)
    return df, avvisi

def filtra_righe_ton(df):
    """Esclude dal CSV le righe con asset TON o TON_MAINNET e le aggiunge agli avvisi."""
    avvisi = []
    righe_da_escludere = []
    if df.empty:
        return df, avvisi
    df.columns = [str(c).strip() for c in df.columns]
    for idx, riga in df.iterrows():
        asset_norm = str(riga.get('Asset', '')).strip().upper()
        if asset_norm in ('TON', 'TON_MAINNET'):
            dettaglio = riga.to_dict()
            dettaglio['Asset'] = 'TON_MAINNET'
            dettaglio['Motivo esclusione'] = 'TON Mainnet, ricerca manualmente inserendo il Tag/Memo'
            avvisi.append(dettaglio)
            righe_da_escludere.append(idx)
    if righe_da_escludere:
        df = df.drop(righe_da_escludere)
    return df, avvisi

def filtra_righe_sent(df):
    avvisi = []
    import numpy as np
    righe_escluse = []

    def _is_empty(v):
        return v is None or (isinstance(v, float) and np.isnan(v)) or str(v).strip() == ''

    if not df.empty:
        # Normalizza header
        df.columns = [str(c).strip() for c in df.columns]
        for idx, riga in df.iterrows():
            tipo = str(riga.get('Type', '')).strip().lower()
            if tipo != 'sent':
                continue

            campi_vuoti = []
            for campo in df.columns:
                if str(campo).strip().lower() == 'type':
                    continue
                if _is_empty(riga[campo]):
                    campi_vuoti.append(campo)

            if not campi_vuoti:
                continue

            # Ultimo controllo richiesto: tenta risoluzione via Chainalysis prima di escludere.
            counterparty = str(riga.get('Output index or Counterparty Address', '')).strip()
            tx_hash = str(riga.get('Deposit Address or Hash', '')).strip()
            asset_attuale = str(riga.get('Asset', '')).strip().upper()

            preferred_chain = None
            for tupla in MAPPATURA_ASSET_CLUSTER:
                if asset_attuale in (tupla[0], tupla[2]):
                    preferred_chain = tupla[2]
                    break

            if counterparty:
                # Prima prova locale veloce (prefissi/euristiche), poi verifica Chainalysis reale.
                asset_norm = normalizza_asset(asset_attuale, counterparty)
                if asset_norm in ASSET_OUTPUT_VALIDI:
                    df.at[idx, 'Asset'] = asset_norm
                else:
                    chain_chainalysis = resolve_chain_with_chainalysis_by_address(counterparty, preferred_chain)
                    if chain_chainalysis:
                        df.at[idx, 'Asset'] = chain_chainalysis

            # Se il campo hash è un 0x tx hash, prova lookup Chainalysis per capire la chain EVM.
            if is_evm_tx_hash(tx_hash):
                chain_by_hash = resolve_chain_with_chainalysis_by_tx_hash(
                    tx_hash,
                    preferred_chain=preferred_chain,
                    wallet_address=counterparty if is_evm_address(counterparty) else None,
                )
                if chain_by_hash:
                    df.at[idx, 'Asset'] = chain_by_hash

            # Ricontrolla la riga aggiornata dopo tentativo Chainalysis.
            riga_aggiornata = df.loc[idx]
            ancora_vuota = False
            for campo in df.columns:
                if str(campo).strip().lower() == 'type':
                    continue
                if _is_empty(riga_aggiornata[campo]):
                    ancora_vuota = True
                    break
            if ancora_vuota:
                righe_escluse.append(riga_aggiornata)
        if righe_escluse:
            avvisi.append("Sono state escluse le seguenti righe dal file di output perché di tipo 'sent' e con almeno un campo vuoto dopo l'ultimo controllo API:")
            for riga in righe_escluse:
                avvisi.append(str(riga.to_dict()))
            df = df.drop([r.name for r in righe_escluse])
    return df, avvisi


def risolvi_asset_da_tx_hash_sempre(df):
    """Per ogni riga con tx hash EVM (0x + 66), verifica sempre Chainalysis e aggiorna Asset se risolto."""
    if df is None or df.empty:
        return df

    df.columns = [str(c).strip() for c in df.columns]
    has_hash_col = 'Deposit Address or Hash' in df.columns
    has_asset_col = 'Asset' in df.columns
    if not has_hash_col or not has_asset_col:
        return df

    has_counterparty_col = 'Output index or Counterparty Address' in df.columns

    for idx, riga in df.iterrows():
        tx_hash = str(riga.get('Deposit Address or Hash', '')).strip()
        if not is_evm_tx_hash(tx_hash):
            continue

        asset_attuale = str(riga.get('Asset', '')).strip().upper()
        counterparty = str(riga.get('Output index or Counterparty Address', '')).strip() if has_counterparty_col else ""

        preferred_chain = None
        for tupla in MAPPATURA_ASSET_CLUSTER:
            if asset_attuale in (tupla[0], tupla[2]):
                preferred_chain = tupla[2]
                break

        chain_by_hash = resolve_chain_with_chainalysis_by_tx_hash(
            tx_hash,
            preferred_chain=preferred_chain,
            wallet_address=counterparty if is_evm_address(counterparty) else None,
        )
        if chain_by_hash:
            df.at[idx, 'Asset'] = chain_by_hash

    return df

def salva_e_avvisa(df_finale, file_output, avvisi_extra=None):
    """
    Filtra le righe 'sent' con campi vuoti e salva il DataFrame su file CSV.
    Scrive anche un file di avvisi se necessario.
    """
    file_avvisi = os.path.splitext(file_output)[0] + '.warnings.txt'

    output_service = os.environ.get('OUTPUT_SERVICE', '').lower()
    if output_service == 'trm':
        _salva_trm(df_finale, file_output)
        return

    # Flusso Chainalysis normale
    # Rimuovi colonne interne TRM (se presenti) prima del processing Chainalysis
    trm_cols = [c for c in df_finale.columns if str(c).strip().lower().startswith('_trm')]
    if trm_cols:
        df_finale = df_finale.drop(columns=trm_cols)
    # Controllo globale: ogni tx hash 0x viene verificato su Chainalysis prima dei filtri.
    df_finale = risolvi_asset_da_tx_hash_sempre(df_finale)
    df_finale, avvisi_ton = filtra_righe_ton(df_finale)
    df_finale, avvisi_asset = filtra_righe_asset_non_supportato(df_finale)
    df_finale = elimina_duplicati_depositi(df_finale)
    df_finale, avvisi = filtra_righe_sent(df_finale)
    import json
    all_avvisi = avvisi_ton + avvisi_asset + avvisi.copy()
    if avvisi_extra:
        all_avvisi += avvisi_extra
    if all_avvisi:
        with open(file_avvisi, 'w', encoding='utf-8') as f:
            for avv in all_avvisi:
                if isinstance(avv, dict):
                    f.write(json.dumps(avv, ensure_ascii=False) + '\n')
                else:
                    f.write(str(avv) + '\n')
    if not df_finale.empty:
        df_finale.to_csv(file_output, index=False, encoding='utf-8')
        scrivi_asset_supportati(file_output)
        print(f"\nSuccesso! File creato: {file_output}")
    else:
        print("\nNessun dato trovato da esportare.")

def normalizzatore_asset_binance(asset, indirizzo=None, network=None):
    asset = str(asset).strip()
    network = str(network).strip() if network is not None else None
    if network is not None and asset != network:
        return MAPPATURA_ASSET.get(network, network)
    else:
        return asset

def normalizzatore_asset_coinbase(asset, indirizzo=None, network=None, deposito=False):
    if deposito:
        asset = str(asset).strip().split()[-1]
        indirizzo = str(indirizzo) if indirizzo is not None else ""
        # Regola custom: se address inizia con 0x e asset type diverso da ETH, ritorna ETHEREUM_MAINNET
        if indirizzo.startswith("0x") and asset != "ETH":
            return "ETHEREUM_MAINNET"
        # Comportamento standard
        if network is not None:
            network = str(network).strip().split('-')[-2:]
            network = '_'.join([x.upper() for x in network])
        if asset in MAPPATURA_ASSET:
            return asset
        elif network in MAPPATURA_ASSET.values():
            return network
        else:
            return network
    else:
        # --- LOGICA AVANZATA PER TRANSACTION HISTORY ---
        asset = str(asset).strip().upper()
        network = str(network).strip().lower() if network is not None else None
        # Crea dizionario inverso per ricerca rapida
        mappatura_network = {v.lower(): k for k, v in MAPPATURA_ASSET.items()}
        if network in mappatura_network:
            asset_coppia = mappatura_network[network]
            # Se currency è il primo valore della coppia
            if asset == asset_coppia:
                return asset
            else:
                # Se currency non è il primo valore, restituisci network formattato
                return network.upper().replace('-', '_')
        # Se network non è in mappatura, fallback precedente
        if network:
            return network.upper().replace('-', '_')
        else:
            return asset

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
    colonna_indirizzo_deposito = colonna_indirizzo_deposito.strip().lower()
    colonna_asset_deposito = colonna_asset_deposito.strip().lower()
    if colonna_network_deposito:
        colonna_network_deposito = colonna_network_deposito.strip().lower()
    colonna_indirizzo_prelievo = colonna_indirizzo_prelievo.strip().lower()
    colonna_destinatario_prelievo = colonna_destinatario_prelievo.strip().lower()
    colonna_asset_prelievo = colonna_asset_prelievo.strip().lower()
    if colonna_network_prelievo:
        colonna_network_prelievo = colonna_network_prelievo.strip().lower()
    df_depositi = pd.DataFrame()
    if foglio_depositi in xls.sheet_names:
        sheet_dep = pd.read_excel(xls, sheet_name=foglio_depositi)
        sheet_dep.columns = [str(c).strip().lower() for c in sheet_dep.columns]
        indirizzo_deposito = sheet_dep[colonna_indirizzo_deposito.strip()]
        asset_deposito = sheet_dep[colonna_asset_deposito.strip()]
        network_deposito = sheet_dep[colonna_network_deposito.strip()] if colonna_network_deposito and colonna_network_deposito.strip() in sheet_dep.columns else None
        asset_out = [
            postprocessa_asset(
                (normalizzatore_asset_deposito or normalizzatore_asset or normalizza_asset)(
                    str(asset_deposito.iloc[i]).strip(),
                    indirizzo=str(indirizzo_deposito.iloc[i]).strip(),
                    network=str(network_deposito.iloc[i]).strip() if network_deposito is not None else None
                )
            ) for i in range(len(sheet_dep))
        ]
        df_depositi = pd.DataFrame({
            'Type': ['deposit'] * len(sheet_dep),
            'Deposit Address or Hash': [str(x).strip() for x in indirizzo_deposito],
            'Output index or Counterparty Address': ["" for _ in range(len(sheet_dep))],
            'Asset': asset_out,
            '_trm_asset': [str(asset_deposito.iloc[i]).strip() for i in range(len(sheet_dep))],
            '_trm_network': [str(network_deposito.iloc[i]).strip() if network_deposito is not None else '' for i in range(len(sheet_dep))],
        })
        df_depositi = elimina_duplicati_depositi(df_depositi)
        print(f"- Foglio '{foglio_depositi}' elaborato.")
    else:
        print(f"! Attenzione: Foglio '{foglio_depositi}' non trovato.")
    df_prelievi = pd.DataFrame()
    if foglio_prelievi in xls.sheet_names:
        sheet_hist = pd.read_excel(xls, sheet_name=foglio_prelievi)
        sheet_hist.columns = [str(c).strip().lower() for c in sheet_hist.columns]
        if filtro_righe_prelievo is not None:
            sheet_hist = sheet_hist[filtro_righe_prelievo(sheet_hist)]
        indirizzo_prelievo = sheet_hist[colonna_indirizzo_prelievo.strip()].values
        destinatario_prelievo = sheet_hist[colonna_destinatario_prelievo.strip()].values
        asset_prelievo = sheet_hist[colonna_asset_prelievo.strip()].values
        network_prelievo = sheet_hist[colonna_network_prelievo.strip()].values if colonna_network_prelievo and colonna_network_prelievo.strip() in sheet_hist.columns else [None]*len(sheet_hist)
        asset_out = [
            postprocessa_asset(
                (normalizzatore_asset_prelievo or normalizzatore_asset or normalizza_asset)(
                    str(asset_prelievo[i]).strip(),
                    indirizzo=str(destinatario_prelievo[i]).strip(),
                    network=str(network_prelievo[i]).strip() if network_prelievo[i] is not None else None
                )
            ) for i in range(len(sheet_hist))
        ]
        df_prelievi = pd.DataFrame({
            'Type': ['sent'] * len(sheet_hist),
            'Deposit Address or Hash': [str(x).strip() for x in indirizzo_prelievo],
            'Output index or Counterparty Address': [str(x).strip() for x in destinatario_prelievo],
            'Asset': asset_out,
            '_trm_asset': [str(asset_prelievo[i]).strip() for i in range(len(sheet_hist))],
            '_trm_network': [str(network_prelievo[i]).strip() if network_prelievo[i] is not None else '' for i in range(len(sheet_hist))],
        })
        print(f"- Foglio '{foglio_prelievi}' elaborato.")
    else:
        print(f"! Attenzione: Foglio '{foglio_prelievi}' non trovato.")
    df_finale = pd.concat([df_depositi, df_prelievi], ignore_index=True)
    df_finale = df_finale[~(df_finale['Deposit Address or Hash'].isna() | (df_finale['Deposit Address or Hash'] == ''))]
    df_finale = df_finale[~(df_finale['Output index or Counterparty Address'].isna() & df_finale['Deposit Address or Hash'].isna())]
    salva_e_avvisa(df_finale, file_output)
