import re
import time
import json
import warnings
import requests
from urllib.parse import quote

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
CHAINALYSIS_API_TOKEN = "123e45ef8f45fdb6f83a25af557a753d151b7093bca86d9e197c92c33a2e6897"

TRM_BASE_URL = "https://api.trmlabs.com"
TRM_API_KEY = "35c2ed35-f481-4b31-892e-6654bf979b16"

# Chiave Gemini: GEMINI_API_KEY (o GOOGLE_API_KEY) in cluster.env / ambiente. Non in repo.
GEMINI_API_KEY = ""

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


def chiave_deposit_address(value):
    """Chiave di unicità per un deposit address. Gli EVM si confrontano in minuscolo."""
    s = str(value or '').strip()
    if not s or s.lower() in ('nan', 'none'):
        return ''
    if is_evm_address(s):
        return s.lower()
    return s


def is_evm_tx_hash(value):
    v = str(value).strip()
    return v.startswith("0x") and len(v) == 66


def chiave_tx_hash(value):
    """Chiave di unicità per un tx hash. Hex (EVM/BTC/TRON) in minuscolo; Solana resta case-sensitive."""
    s = str(value or '').strip()
    if not s or s.lower() in ('nan', 'none'):
        return ''
    if is_evm_tx_hash(s):
        return s.lower()
    body = s[2:] if s.lower().startswith('0x') else s
    if body and all(c in '0123456789abcdefABCDEF' for c in body) and len(body) in (64, 66):
        return ('0x' + body.lower()) if s.lower().startswith('0x') else body.lower()
    return s


def is_probably_stellar_address(value):
    addr = str(value).strip()
    if len(addr) != 56 or not addr.startswith("G"):
        return False
    return all(ch in STELLAR_BASE32_ALPHABET for ch in addr)


def is_probably_bitcoin_address(value):
    """BTC: Legacy/P2SH ~26-35 char, bech32 bc1q/bc1p. Non le firme Solana lunghe che iniziano con '3'."""
    addr = str(value).strip()
    if addr.startswith(("bc1q", "bc1p")):
        return 14 <= len(addr) <= 90
    if addr[:1] in ("1", "3"):
        return 26 <= len(addr) <= 35
    return False


def is_probably_solana_signature(value):
    """Firma tx Solana: base58, di solito 87-88 caratteri (non un indirizzo wallet)."""
    v = str(value).strip()
    if not (80 <= len(v) <= 90):
        return False
    base58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    return all(ch in base58 for ch in v)


def is_probably_dogecoin_address(value):
    """Dogecoin legacy: inizia con D, ~25-34 caratteri. Non le firme Solana lunghe."""
    addr = str(value).strip()
    return addr.startswith("D") and 25 <= len(addr) <= 34


def is_probably_litecoin_address(value):
    addr = str(value).strip()
    if addr.startswith("ltc1"):
        return 14 <= len(addr) <= 90
    if addr[:1] in ("L", "M"):
        return 26 <= len(addr) <= 35
    return False


def prefisso_indirizzo_plausibile(mainnet, address):
    """Evita falsi positivi (es. firme Solana vs prefissi BTC/DOGE/LTC di 1 carattere)."""
    if mainnet == "STELLAR_MAINNET":
        return is_probably_stellar_address(address)
    if mainnet == "BITCOIN_MAINNET":
        return is_probably_bitcoin_address(address)
    if mainnet == "DOGECOIN_MAINNET":
        return is_probably_dogecoin_address(address)
    if mainnet == "LITECOIN_MAINNET":
        return is_probably_litecoin_address(address)
    if mainnet == "DASH_MAINNET":
        return address.startswith("X") and 25 <= len(address) <= 36
    if mainnet == "TRON_MAINNET":
        return address.startswith("T") and len(address) == 34
    if mainnet == "XRP_MAINNET":
        return address.startswith("r") and 25 <= len(address) <= 35
    return True


def resolve_solana_by_signature(signature):
    """Se la firma esiste su Solana mainnet, restituisce SOLANA_MAINNET."""
    sig = str(signature or "").strip()
    if not is_probably_solana_signature(sig):
        return None
    urls = [u for u in RPC_API.get("SOLANA_MAINNET", []) if "chainalysis.com" not in u]
    if not urls:
        urls = ["https://api.mainnet-beta.solana.com"]
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getTransaction",
        "params": [sig, {"encoding": "json", "maxSupportedTransactionVersion": 0}],
    }
    for url in urls:
        try:
            r = requests.post(url, json=payload, timeout=15)
            if r.status_code == 200 and (r.json() or {}).get("result"):
                print(f"[RPC] SOLANA_MAINNET sig={sig[:14]}...")
                return "SOLANA_MAINNET"
        except Exception:
            continue
    return None


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

    # 3. Prova mapping tramite prefisso address (non su hash/firme di transazione).
    if address and not _e_hash_grezzo(address):
        for tupla in MAPPATURA_ASSET_CLUSTER:
            if len(tupla) > 3:
                prefissi = tupla[3]
                if isinstance(prefissi, str):
                    prefissi = [prefissi]
                for pref in prefissi:
                    if address.startswith(pref):
                        if not prefisso_indirizzo_plausibile(tupla[2], address):
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
    Rimuove duplicati depositi (Type=deposit) per stesso indirizzo (una riga per address).
    Tra i duplicati preferisce la riga il cui asset è presente in MAPPATURA_ASSET_CLUSTER
    (asset mainnet valido); in caso di parità mantiene la prima occorrenza.
    Gli indirizzi EVM si confrontano e si emettono in minuscolo.
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
        mask_dep = df_work['type'].astype(str).str.strip().str.lower() == 'deposit'
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

    df_dep['_addr_key'] = df_dep['deposit address or hash'].map(chiave_deposit_address)
    if 'asset' in cols_lower:
        df_dep['_prio'] = df_dep['asset'].apply(_priorita)
        df_dep = df_dep.sort_values('_prio', kind='stable')
    df_dep = df_dep.drop_duplicates(subset=['_addr_key'], keep='first')
    df_dep['deposit address or hash'] = df_dep['_addr_key'].where(
        df_dep['_addr_key'] != '', df_dep['deposit address or hash']
    )
    df_dep = df_dep.drop(columns=[c for c in ('_addr_key', '_prio') if c in df_dep.columns])

    result = pd.concat([df_dep, df_other], ignore_index=True)
    result.columns = orig_cols
    return result


def elimina_duplicati_sent(df):
    """
    Rimuove duplicati sent per la stessa coppia (tx hash, destinatario/output).
    Chainalysis rifiuta due righe che puntano allo stesso output.
    Tra i duplicati preferisce l'asset mainnet valido; gli hash/indirizzi EVM
    si confrontano e si emettono in minuscolo. I depositi restano invariati.
    """
    if df is None or df.empty:
        return df

    if os.environ.get('OUTPUT_SERVICE', '').lower() == 'trm':
        return df

    orig_cols = df.columns.tolist()
    cols_lower = [str(c).strip().lower() for c in orig_cols]

    if 'deposit address or hash' not in cols_lower:
        return df

    df_work = df.copy()
    df_work.columns = cols_lower

    if 'type' in cols_lower:
        mask_sent = df_work['type'].astype(str).str.strip().str.lower() == 'sent'
        df_sent = df_work[mask_sent].copy()
        df_other = df_work[~mask_sent].copy()
    else:
        return df

    if df_sent.empty:
        df_work.columns = orig_cols
        return df_work

    mainnet_validi = {str(t[2]).strip().upper() for t in MAPPATURA_ASSET_CLUSTER}

    def _priorita(asset):
        return 0 if str(asset).strip().upper() in mainnet_validi else 1

    dest_col = 'output index or counterparty address'
    df_sent['_hash_key'] = df_sent['deposit address or hash'].map(chiave_tx_hash)
    if dest_col in cols_lower:
        df_sent['_dest_key'] = df_sent[dest_col].map(chiave_deposit_address)
    else:
        df_sent['_dest_key'] = ''
    if 'asset' in cols_lower:
        df_sent['_prio'] = df_sent['asset'].apply(_priorita)
        df_sent = df_sent.sort_values('_prio', kind='stable')
    df_sent = df_sent.drop_duplicates(subset=['_hash_key', '_dest_key'], keep='first')
    df_sent['deposit address or hash'] = df_sent['_hash_key'].where(
        df_sent['_hash_key'] != '', df_sent['deposit address or hash']
    )
    if dest_col in cols_lower:
        df_sent[dest_col] = df_sent['_dest_key'].where(
            df_sent['_dest_key'] != '', df_sent[dest_col]
        )
    df_sent = df_sent.drop(columns=[c for c in ('_hash_key', '_dest_key', '_prio') if c in df_sent.columns])

    result = pd.concat([df_other, df_sent], ignore_index=True)
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


# Host Alchemy (g.alchemy.com/v2/KEY) per le EVM di EVM_CHAIN_KEYS.
# Kaia e X Layer non sono su Alchemy: restano gli RPC pubblici.
ALCHEMY_EVM_HOSTS = {
    "ARBITRUM_ONE_MAINNET": "arb-mainnet",
    "AVALANCHE_C_CHAIN_MAINNET": "avax-mainnet",
    "BASE_MAINNET": "base-mainnet",
    "BNB_SMART_CHAIN_MAINNET": "bnb-mainnet",
    "ETHEREUM_MAINNET": "eth-mainnet",
    "INK_MAINNET": "ink-mainnet",
    "LINEA_MAINNET": "linea-mainnet",
    "OPTIMISM_MAINNET": "opt-mainnet",
    "PLASMA_MAINNET": "plasma-mainnet",
    "POLYGON_POS_MAINNET": "polygon-mainnet",
    "SONEIUM_MAINNET": "soneium-mainnet",
    "TEMPO_MAINNET": "tempo-mainnet",
    "UNICHAIN_MAINNET": "unichain-mainnet",
    "WORLD_MAINNET": "worldchain-mainnet",
    "ZK_SYNC_MAINNET": "zksync-mainnet",
}

_TX_CHAIN_CACHE = {}
_ALCHEMY_SKIP = False


def alchemy_api_key():
    if _ALCHEMY_SKIP:
        return ""
    return (os.environ.get("ALCHEMY_API_KEY") or "").strip()


def _is_alchemy_keyed_url(url):
    return ".g.alchemy.com/v2/" in str(url or "")


def _alchemy_quota_error(status, body):
    if status in (402, 429):
        return True
    err = body.get("error") if isinstance(body, dict) else None
    msg = ""
    code = None
    if isinstance(err, dict):
        code = err.get("code")
        msg = str(err.get("message") or "")
    elif err:
        msg = str(err)
    if not msg and body is not None:
        msg = str(body)
    if code in (429, 402, -32005, -32029):
        return True
    low = msg.lower()
    return any(
        token in low
        for token in (
            "compute unit",
            "compute units",
            "capacity limit",
            "monthly capacity",
            "exceeded your",
            "rate limit",
            "too many requests",
            "quota",
        )
    )


def _mark_alchemy_exhausted(reason):
    global _ALCHEMY_SKIP
    if _ALCHEMY_SKIP:
        return
    _ALCHEMY_SKIP = True
    print("[Alchemy] CU/quota esauriti (" + str(reason) + "): passo a RPC pubblici, KYT, TRM.")


def alchemy_rpc_url(chain_key, key=None):
    key = alchemy_api_key() if key is None else key
    host = ALCHEMY_EVM_HOSTS.get(chain_key)
    if not key or not host:
        return None
    return "https://" + host + ".g.alchemy.com/v2/" + key


def _rpc_pubblici_evm():
    """RPC per tutte le chain EVM in EVM_CHAIN_KEYS. Alchemy (se c'è la chiave) prima degli endpoint pubblici."""
    extra = {
        "ETHEREUM_MAINNET": [
            "https://ethereum-rpc.publicnode.com",
            "https://rpc.ankr.com/eth",
            "https://cloudflare-eth.com",
        ],
        "BNB_SMART_CHAIN_MAINNET": [
            "https://bsc-dataseed.binance.org/",
            "https://bsc-dataseed1.defibit.io/",
            "https://bsc-rpc.publicnode.com",
        ],
        "POLYGON_POS_MAINNET": [
            "https://polygon-bor-rpc.publicnode.com",
            "https://rpc.ankr.com/polygon",
            "https://polygon-rpc.com",
        ],
        "INK_MAINNET": ["https://rpc-gel.inkonchain.com"],
        "KAIA_MAINNET": ["https://public-en.node.kaia.io"],
        "PLASMA_MAINNET": ["https://rpc.plasma.to"],
        "SONEIUM_MAINNET": ["https://rpc.soneium.org"],
        "UNICHAIN_MAINNET": ["https://mainnet.unichain.org"],
        "WORLD_MAINNET": ["https://worldchain-mainnet.g.alchemy.com/public"],
        "XLAYER_MAINNET": ["https://rpc.xlayer.tech"],
        "TEMPO_MAINNET": ["https://rpc.tempo.xyz"],
    }
    urls = []
    visti = set()
    key = alchemy_api_key()
    if key:
        for chain in EVM_CHAIN_KEYS:
            url = alchemy_rpc_url(chain, key)
            if not url:
                continue
            coppia = (chain, url)
            if coppia in visti:
                continue
            visti.add(coppia)
            urls.append(coppia)
    for chain in EVM_CHAIN_KEYS:
        candidati = [u for u in RPC_API.get(chain, []) if "chainalysis.com" not in u]
        candidati.extend(extra.get(chain, []))
        for url in candidati:
            chiave = (chain, url)
            if chiave in visti:
                continue
            visti.add(chiave)
            urls.append(chiave)
    urls.sort(key=lambda item: item[0] == "ETHEREUM_MAINNET")
    return urls


def _rpc_tx_presente(rpc_url, tx):
    """True se l'RPC vede la tx (receipt o getTransactionByHash)."""
    keyed = _is_alchemy_keyed_url(rpc_url)
    if keyed and _ALCHEMY_SKIP:
        return False
    for method in ("eth_getTransactionReceipt", "eth_getTransactionByHash"):
        try:
            r = requests.post(
                rpc_url,
                json={"jsonrpc": "2.0", "method": method, "params": [tx], "id": 1},
                timeout=8,
            )
            data = r.json() if r.content else {}
            if keyed and _alchemy_quota_error(r.status_code, data):
                _mark_alchemy_exhausted("HTTP " + str(r.status_code))
                return False
            if r.status_code == 200 and data.get("result"):
                return True
        except Exception:
            continue
    return False


def resolve_chain_with_chainalysis_by_tx_hash(tx_hash, preferred_chain=None, wallet_address=None, chain_filter=None):
    """Identifica la chain EVM di un tx hash via RPC pubblici (in parallelo), poi KYT/TRM.
    Un hash 0x+66 è per forza EVM: non si usa Gemini. chain_filter: mainnet da provare prima."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    tx = str(tx_hash).strip()
    if not is_evm_tx_hash(tx):
        return None
    cached = _TX_CHAIN_CACHE.get(tx.lower())
    if cached:
        return cached

    EVM_PUBLIC_RPCS = _rpc_pubblici_evm()

    if chain_filter:
        prioritized = [(k, u) for k, u in EVM_PUBLIC_RPCS if k in chain_filter]
        remaining = [(k, u) for k, u in EVM_PUBLIC_RPCS if k not in chain_filter]
        base_list = prioritized + remaining
    else:
        base_list = EVM_PUBLIC_RPCS

    if preferred_chain:
        ordered = [(k, u) for k, u in base_list if k == preferred_chain]
        ordered += [(k, u) for k, u in base_list if k != preferred_chain]
    else:
        ordered = base_list

    # RPC in parallelo (Alchemy prima, poi pubblici): un hash 0x esiste su una sola chain EVM.
    with ThreadPoolExecutor(max_workers=min(16, max(4, len(ordered)))) as pool:
        futuri = {
            pool.submit(_rpc_tx_presente, rpc_url, tx): (chain_key, rpc_url)
            for chain_key, rpc_url in ordered
        }
        for fut in as_completed(futuri):
            try:
                if fut.result():
                    chain_key, rpc_url = futuri[fut]
                    tag = "Alchemy" if _is_alchemy_keyed_url(rpc_url) else "RPC"
                    print(f"[{tag}] {chain_key} tx={tx[:14]}...")
                    _TX_CHAIN_CACHE[tx.lower()] = chain_key
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
                _TX_CHAIN_CACHE[tx.lower()] = chain_key
                return chain_key
        except Exception:
            pass
        if is_evm_address(wallet):
            try:
                wallet_url = f"{CHAINALYSIS_BASE_URL}/api/kyt/v2/addresses/{wallet}/transactions"
                r = requests.get(wallet_url, headers=headers,
                                 params={"network": network, "filter[hash]": tx, "page[size]": 100}, timeout=10)
                if r.status_code == 200 and _chainalysis_data_contains_hash(r.json(), tx):
                    _TX_CHAIN_CACHE[tx.lower()] = chain_key
                    return chain_key
            except Exception:
                continue

    # Fallback finale: TRM Labs
    result = resolve_chain_with_trm_tx(tx)
    if result:
        _TX_CHAIN_CACHE[tx.lower()] = result
        return result
    print(f"[RPC] Hash EVM non trovato su nessuna chain nota: tx={tx[:18]}...")
    return None

def inferisci_asset_per_avviso(riga):
    return str(riga.get('Asset', '')).strip()

def asset_senza_api(asset, address=None, network=None):
    """Mapping locale (ticker, network, prefisso indirizzo). Nessuna chiamata esterna."""
    asset = str(asset).strip().upper() if asset else ""
    address = str(address).strip() if address else ""
    network = str(network).strip().lower() if network else None

    for tupla in MAPPATURA_ASSET_CLUSTER:
        if asset == tupla[0] or asset == tupla[2]:
            return tupla[2]

    if network:
        for tupla in MAPPATURA_ASSET_CLUSTER:
            if network == tupla[1] or network == tupla[2].lower():
                return tupla[2]

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

    if asset in ASSET_OUTPUT_VALIDI:
        return asset
    return asset


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

            tipo_riga = str(riga.get('Type', '')).strip().lower()
            if tipo_riga in ('sent', 'deposit'):
                asset_gemini = asset_da_tx_hash_gemini(deposit_address_or_hash)
                if asset_gemini and str(asset_gemini).strip().upper() in ASSET_OUTPUT_VALIDI:
                    righe_da_correggere[idx] = asset_gemini
                    continue
            if tipo_riga == 'sent':
                dettaglio = riga.to_dict()
                dettaglio['Asset'] = inferisci_asset_per_avviso(riga)
                dettaglio['Motivo esclusione'] = 'Mainnet non supportata da reactor.chainalysis'
                avvisi.append(dettaglio)
                righe_da_escludere.append(idx)
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

            # Ultimo tentativo: Gemini (cache) oppure RPC se è un hash EVM 0x.
            tx_hash = str(riga.get('Deposit Address or Hash', '')).strip()
            controparte = str(riga.get('Output index or Counterparty Address', '')).strip()
            if tx_hash and tx_hash.lower() not in ('nan', 'none'):
                if is_evm_tx_hash(tx_hash):
                    chain_rpc = resolve_chain_with_chainalysis_by_tx_hash(
                        tx_hash,
                        wallet_address=controparte if is_evm_address(controparte) else None,
                    )
                    if chain_rpc:
                        df.at[idx, 'Asset'] = chain_rpc
                elif is_probably_solana_signature(tx_hash):
                    chain_sol = resolve_solana_by_signature(tx_hash)
                    if chain_sol:
                        df.at[idx, 'Asset'] = chain_sol
                else:
                    asset_gemini = asset_da_tx_hash_gemini(tx_hash)
                    if asset_gemini:
                        df.at[idx, 'Asset'] = asset_gemini

            # Ricontrolla la riga aggiornata.
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
            avvisi.append("Sono state escluse le seguenti righe dal file di output perché di tipo 'sent' e con almeno un campo vuoto dopo il controllo sulla chain dell'hash di transazione:")
            for riga in righe_escluse:
                avvisi.append(str(riga.to_dict()))
            df = df.drop([r.name for r in righe_escluse])
    return df, avvisi


_GEMINI_CHAIN_CACHE = {}
_PROMPT_CHAIN_HASH = "rispondimi solo con la chain di appartenenza di questi hash di transazione:"

# Nomi che Gemini restituisce spesso e che non coincidono lettera per lettera
# con i campi di MAPPATURA_ASSET_CLUSTER. Il valore è il ticker (primo elemento).
_ALIAS_CHAIN_GEMINI = {
    "ethereum": "ETH",
    "ether": "ETH",
    "bitcoin": "BTC",
    "binance": "BSC",
    "binance smart": "BSC",
    "bnb": "BSC",
    "bnb smart": "BSC",
    "polygon": "POL",
    "matic": "POL",
    "arbitrum": "ARB",
    "arbitrum one": "ARB",
    "avalanche": "AVAX",
    "avalanche c": "AVAX",
    "optimism": "OP",
    "base": "BASE",
    "tron": "TRX",
    "solana": "SOL",
    "litecoin": "LTC",
    "dogecoin": "DOGE",
    "ripple": "XRP",
    "xrp ledger": "XRP",
    "stellar": "XLM",
    "bitcoin cash": "BCH",
    "zksync": "ZK",
    "zk sync": "ZK",
    "zksync era": "ZK",
    "linea": "LINEA",
    "ton": "TON",
    "open network": "TON",
    "sui": "SUI",
    "unichain": "UNI",
    "world": "WLD",
    "worldchain": "WLD",
    "x layer": "OKB",
    "xlayer": "OKB",
    "kaia": "KAIA",
    "klaytn": "KAIA",
    "ink": "INK",
    "plasma": "PLASM",
    "soneium": "SNE",
    "tempo": "TEMPO",
    "dash": "DASH",
    "zcash": "ZEC",
}


def _etichetta_chain(valore):
    """Normalizza un nome chain per il confronto con MAPPATURA_ASSET_CLUSTER."""
    testo = str(valore or "").strip().lower().replace("_", " ").replace("-", " ")
    testo = re.sub(r"[^a-z0-9\s]", " ", testo)
    testo = re.sub(r"\s+", " ", testo).strip()
    stop = {"mainnet", "network", "chain", "the"}
    parti = [p for p in testo.split() if p not in stop]
    return " ".join(parti)


def _contiene_frase(testo, frase):
    if not testo or not frase:
        return False
    return re.search(rf"(?<![a-z0-9]){re.escape(frase)}(?![a-z0-9])", testo) is not None


def _risolvi_a_mainnet_cluster(valore):
    """Porta un nome qualsiasi al terzo elemento della tupla di MAPPATURA_ASSET_CLUSTER."""
    et = _etichetta_chain(valore)
    if not et:
        return None

    for tupla in MAPPATURA_ASSET_CLUSTER:
        if len(tupla) < 3:
            continue
        for campo in tupla[:3]:
            if _etichetta_chain(campo) == et:
                return tupla[2]

    upper = str(valore).strip().upper()
    mapped = MAPPATURA_ASSET.get(upper)
    if mapped:
        return mapped

    ankr = ANKR_BLOCKCHAIN_TO_MAINNET.get(str(valore).strip().lower())
    if ankr:
        return ankr

    for mainnet, code in _MAINNET_TO_CSV_BLOCKCHAIN.items():
        if _etichetta_chain(code) == et or _etichetta_chain(mainnet) == et:
            return mainnet

    for trm_id, mainnet in TRM_CHAIN_ID_TO_MAINNET.items():
        if _etichetta_chain(trm_id) == et or _etichetta_chain(mainnet) == et:
            return mainnet

    for chain_id, mainnet in REACTOR_EIP155_TO_MAINNET.items():
        if str(chain_id) == str(valore).strip() or _etichetta_chain(mainnet) == et:
            return mainnet

    currency = _TRM_CURRENCY_NORMALIZE.get(upper)
    if currency and currency != upper:
        return _risolvi_a_mainnet_cluster(currency)

    for alias, ticker in _ALIAS_CHAIN_GEMINI.items():
        if et == alias:
            return _risolvi_a_mainnet_cluster(ticker)

    for tupla in MAPPATURA_ASSET_CLUSTER:
        if len(tupla) < 3:
            continue
        for campo in tupla[:3]:
            primo = _etichetta_chain(campo).split()
            if primo and primo[0] == et and len(et) >= 3:
                return tupla[2]
    return None


def _coppie_label_mainnet():
    """Tutte le etichette delle liste di cluster_utils.py, collegate al mainnet del cluster."""
    coppie = []
    visti = set()

    def aggiungi(etichetta, destinazione):
        mainnet = _risolvi_a_mainnet_cluster(destinazione) or _risolvi_a_mainnet_cluster(etichetta)
        et = _etichetta_chain(etichetta)
        if not mainnet or not et or len(et) < 2:
            return
        chiave = (et, mainnet)
        if chiave in visti:
            return
        visti.add(chiave)
        coppie.append(chiave)

    for tupla in MAPPATURA_ASSET_CLUSTER:
        if len(tupla) >= 3:
            for campo in tupla[:3]:
                aggiungi(campo, tupla[2])

    for chiave, valore in MAPPATURA_ASSET.items():
        aggiungi(chiave, valore)
        aggiungi(valore, valore)

    for chiave, valore in ANKR_BLOCKCHAIN_TO_MAINNET.items():
        aggiungi(chiave, valore)
        aggiungi(valore, valore)

    for _chain_id, valore in REACTOR_EIP155_TO_MAINNET.items():
        aggiungi(valore, valore)

    for nome in REACTOR_SEARCH_ASSETS:
        aggiungi(nome, nome)

    for nome in EVM_CHAIN_KEYS:
        aggiungi(nome, nome)

    for nome in RPC_API:
        aggiungi(nome, nome)

    for nome in ASSET_OUTPUT_VALIDI:
        aggiungi(nome, nome)

    for mainnet, code in _MAINNET_TO_CSV_BLOCKCHAIN.items():
        aggiungi(mainnet, mainnet)
        aggiungi(code, mainnet)

    for chiave, _trm_id in MAINNET_TO_TRM_CHAIN_ID.items():
        aggiungi(chiave, chiave)
        aggiungi(_trm_id, chiave)

    for trm_id, mainnet in TRM_CHAIN_ID_TO_MAINNET.items():
        aggiungi(trm_id, mainnet)
        aggiungi(mainnet, mainnet)

    for nome, ticker in _TRM_CURRENCY_NORMALIZE.items():
        aggiungi(nome, ticker)
        aggiungi(ticker, ticker)

    for alias, ticker in _ALIAS_CHAIN_GEMINI.items():
        aggiungi(alias, ticker)

    for code in _CSV_BLOCKCHAIN_TO_TRM_ID:
        aggiungi(code, code)

    for nome, mainnet in (
        ("ERC20", "ETHEREUM_MAINNET"),
        ("BEP20", "BNB_SMART_CHAIN_MAINNET"),
        ("TRC20", "TRON_MAINNET"),
        ("SPL", "SOLANA_MAINNET"),
    ):
        aggiungi(nome, mainnet)

    return coppie


def asset_da_risposta_gemini(risposta):
    """
    Confronta la risposta di Gemini con le liste di cluster_utils.py
    e restituisce il terzo elemento della tupla di MAPPATURA_ASSET_CLUSTER.
    """
    resp = _etichetta_chain(risposta)
    if not resp:
        return None

    migliore = None
    migliore_pos = None
    migliore_len = -1
    for etichetta, mainnet in _coppie_label_mainnet():
        if resp == etichetta:
            return mainnet
        if len(etichetta) < 3 or not _contiene_frase(resp, etichetta):
            continue
        pos = resp.find(etichetta)
        if migliore is None or pos < migliore_pos or (pos == migliore_pos and len(etichetta) > migliore_len):
            migliore = mainnet
            migliore_pos = pos
            migliore_len = len(etichetta)
    return migliore


def _e_hash_grezzo(valore):
    """True se il valore è un hash/firma di transazione, non un indirizzo wallet."""
    v = str(valore or "").strip()
    if is_evm_tx_hash(v):
        return True
    if is_probably_solana_signature(v):
        return True
    return len(v) == 64 and all(c in "0123456789abcdefABCDEF" for c in v)


def asset_da_pattern_liste(valore):
    """
    Se l'indirizzo inizia con un prefisso di MAPPATURA_ASSET_CLUSTER,
    restituisce il terzo elemento della tupla. Gli hash grezzi non hanno prefisso.
    """
    address = str(valore or "").strip()
    if not address or address.lower() in ("nan", "none") or _e_hash_grezzo(address):
        return None

    trovati = []
    for tupla in MAPPATURA_ASSET_CLUSTER:
        if len(tupla) <= 3:
            continue
        prefissi = tupla[3]
        if isinstance(prefissi, str):
            prefissi = [prefissi]
        for pref in prefissi:
            if address.startswith(pref):
                if not prefisso_indirizzo_plausibile(tupla[2], address):
                    continue
                trovati.append((len(str(pref)), tupla[2]))
    if not trovati:
        return None
    trovati.sort(key=lambda item: item[0], reverse=True)
    return trovati[0][1]


def _righe_risposta_gemini(testo):
    righe = []
    for riga in str(testo or "").splitlines():
        riga = riga.strip().strip("*").strip()
        riga = re.sub(r"^\d+[\.\)\:\-]\s*", "", riga).strip()
        if riga:
            righe.append(riga)
    return righe


def _chain_dopo_hash(riga, tx):
    """Estrae il nome chain scritto sulla stessa riga, dopo l'hash."""
    riga_low = riga.lower()
    i = riga_low.find(tx.lower())
    if i < 0:
        return ""
    dopo = riga[i + len(tx):].strip(" \t`*:.-")
    dopo = re.sub(r"^[\*`:\-\.\s]+", "", dopo).strip()
    dopo = dopo.strip("*").strip()
    return dopo.splitlines()[0].strip(" *-:.") if dopo else ""


def _associa_chain_agli_hash(testo, hashes):
    """Collega ogni hash alla chain indicata da Gemini, riga per riga."""
    if not testo:
        return {}
    risultato = {}
    for riga in str(testo).splitlines():
        if not riga.strip():
            continue
        for tx in hashes:
            if tx in risultato:
                continue
            chain = _chain_dopo_hash(riga, tx)
            if chain:
                risultato[tx] = chain
                break

    if len(risultato) == len(hashes):
        return risultato

    pulite = _righe_risposta_gemini(testo)
    senza_hash = [riga for riga in pulite if not any(tx.lower() in riga.lower() for tx in hashes)]
    mancanti = [tx for tx in hashes if tx not in risultato]
    if mancanti and len(senza_hash) == len(mancanti):
        for tx, riga in zip(mancanti, senza_hash):
            risultato[tx] = riga
    elif not risultato and len(pulite) == len(hashes):
        return dict(zip(hashes, pulite))
    return risultato


def _hashes_unici(tx_hashes):
    hashes = []
    for tx in tx_hashes:
        tx = str(tx).strip()
        if not tx or tx.lower() in ("nan", "none") or tx in hashes:
            continue
        hashes.append(tx)
    return hashes


def _prompt_chain_hash(hashes):
    return _PROMPT_CHAIN_HASH + "\n" + "\n".join(hashes)


def _popola_cache_da_testo(cache, testo, hashes, etichetta):
    associati = _associa_chain_agli_hash(testo, hashes)
    for tx in hashes:
        risposta = associati.get(tx) or None
        cache[tx] = risposta
        print(f"[{etichetta}] tx={tx[:18]}... → {risposta or '(vuoto)'}")


def chiedi_chain_gemini_batch(tx_hashes):
    """
    Una sola chiamata Gemini per tutti gli hash non riconosciuti dai pattern.
    Prompt: rispondimi solo con la chain di appartenenza di questi hash di transazione:
    """
    hashes = _hashes_unici(tx_hashes)
    if not hashes:
        return {}

    da_chiedere = [tx for tx in hashes if tx not in _GEMINI_CHAIN_CACHE]
    if da_chiedere:
        api_key = (GEMINI_API_KEY or "").strip() or os.environ.get("GEMINI_API_KEY", "").strip() or os.environ.get("GOOGLE_API_KEY", "").strip()
        if not api_key:
            print("[Gemini] Imposta GEMINI_API_KEY in cluster.env")
            for tx in da_chiedere:
                _GEMINI_CHAIN_CACHE[tx] = None
        else:
            modello = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash").strip() or "gemini-3.6-flash"
            prompt = _prompt_chain_hash(da_chiedere)
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{modello}:generateContent?key={api_key}"
            body = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0,
                    "maxOutputTokens": min(8192, 80 * len(da_chiedere) + 64),
                    "thinkingConfig": {"thinkingBudget": 0},
                },
            }
            try:
                r = requests.post(url, json=body, timeout=120)
                if r.status_code == 400 and "thinkingConfig" in r.text:
                    body["generationConfig"].pop("thinkingConfig", None)
                    r = requests.post(url, json=body, timeout=120)
                if r.status_code == 429:
                    print("[Gemini] Quota esaurita (HTTP 429): continuo senza Gemini per questi hash")
                    for tx in da_chiedere:
                        _GEMINI_CHAIN_CACHE[tx] = None
                elif r.status_code != 200:
                    print(f"[Gemini] HTTP {r.status_code}: {r.text[:120]}")
                    for tx in da_chiedere:
                        _GEMINI_CHAIN_CACHE[tx] = None
                else:
                    data = r.json()
                    parti = (
                        data.get("candidates", [{}])[0]
                        .get("content", {})
                        .get("parts", [])
                    )
                    testo = "\n".join(str(p.get("text", "")).strip() for p in parti if isinstance(p, dict)).strip()
                    print(f"[Gemini] {len(da_chiedere)} hash in una richiesta")
                    _popola_cache_da_testo(_GEMINI_CHAIN_CACHE, testo, da_chiedere, "Gemini")
            except Exception as e:
                print(f"[Gemini] Errore batch: {e}")
                for tx in da_chiedere:
                    _GEMINI_CHAIN_CACHE[tx] = None

    return {tx: _GEMINI_CHAIN_CACHE.get(tx) for tx in hashes}


def asset_da_tx_hash_gemini(tx_hash):
    """Legge la chain già chiesta a Gemini e la traduce nel terzo elemento della tupla."""
    tx = str(tx_hash).strip()
    risposta = _GEMINI_CHAIN_CACHE.get(tx)
    if not risposta:
        return None
    asset = asset_da_risposta_gemini(risposta)
    if asset:
        print(f"[Gemini] asset={asset} per tx={tx[:18]}...")
    else:
        print(f"[Gemini] nessuna corrispondenza nelle liste per '{risposta}'")
    return asset


def risolvi_asset_sent_con_gemini(df):
    """
    Prefisso delle liste quando basta.
    Hash sent e indirizzi di deposito non riconosciuti vanno a Gemini in una sola richiesta.
    In Asset finisce il terzo elemento della tupla di MAPPATURA_ASSET_CLUSTER.
    """
    if df is None or df.empty:
        return df

    df.columns = [str(c).strip() for c in df.columns]
    if "Type" not in df.columns or "Deposit Address or Hash" not in df.columns or "Asset" not in df.columns:
        return df

    mainnet_noti = {str(tupla[2]).strip().upper() for tupla in MAPPATURA_ASSET_CLUSTER if len(tupla) >= 3}
    ha_controparte = "Output index or Counterparty Address" in df.columns
    da_chiedere = []
    for idx, riga in df.iterrows():
        tipo = str(riga.get("Type", "")).strip().lower()
        valore = str(riga.get("Deposit Address or Hash", "")).strip()
        if not valore or valore.lower() in ("nan", "none"):
            continue
        if tipo == "sent":
            controparte = str(riga.get("Output index or Counterparty Address", "")).strip() if ha_controparte else ""
            asset_pattern = asset_da_pattern_liste(controparte) or asset_da_pattern_liste(valore)
            if asset_pattern:
                df.at[idx, "Asset"] = asset_pattern
                continue
            # Un hash 0x+66 è per forza EVM: solo RPC/KYT/TRM, mai Gemini (inventa Aptos ecc.).
            if is_evm_tx_hash(valore):
                chain_rpc = resolve_chain_with_chainalysis_by_tx_hash(
                    valore,
                    wallet_address=controparte if is_evm_address(controparte) else None,
                )
                if chain_rpc:
                    df.at[idx, "Asset"] = chain_rpc
                continue
            # Firme Solana (~88 base58): RPC Solana, non Gemini (può dire Dogecoin/Bitcoin).
            if is_probably_solana_signature(valore):
                chain_sol = resolve_solana_by_signature(valore)
                if chain_sol:
                    df.at[idx, "Asset"] = chain_sol
                continue
            da_chiedere.append((idx, valore))
        elif tipo == "deposit":
            asset_attuale = str(riga.get("Asset", "")).strip().upper()
            if asset_attuale in mainnet_noti:
                continue
            asset_pattern = asset_da_pattern_liste(valore)
            if asset_pattern:
                df.at[idx, "Asset"] = asset_pattern
                continue
            da_chiedere.append((idx, valore))

    if not da_chiedere:
        return df

    print(f"[Gemini] {len(da_chiedere)} hash o indirizzi senza pattern, una sola richiesta")
    chiedi_chain_gemini_batch([valore for _, valore in da_chiedere])
    for idx, valore in da_chiedere:
        asset = asset_da_tx_hash_gemini(valore)
        if asset:
            df.at[idx, "Asset"] = asset
    return df


def risolvi_asset_da_tx_hash_sempre(df):
    """Per ogni riga non-sent con tx hash EVM (0x + 66), verifica Chainalysis e aggiorna Asset se risolto.
    Le righe sent usano Gemini e non passano da qui."""
    if df is None or df.empty:
        return df

    df.columns = [str(c).strip() for c in df.columns]
    has_hash_col = 'Deposit Address or Hash' in df.columns
    has_asset_col = 'Asset' in df.columns
    if not has_hash_col or not has_asset_col:
        return df

    has_counterparty_col = 'Output index or Counterparty Address' in df.columns
    has_type_col = 'Type' in df.columns

    for idx, riga in df.iterrows():
        if has_type_col and str(riga.get('Type', '')).strip().lower() == 'sent':
            continue
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
    # Sent e depositi non riconosciuti dai pattern: una richiesta Gemini.
    df_finale = risolvi_asset_sent_con_gemini(df_finale)
    # Le altre righe con tx hash 0x restano sul controllo Chainalysis.
    df_finale = risolvi_asset_da_tx_hash_sempre(df_finale)
    df_finale, avvisi_ton = filtra_righe_ton(df_finale)
    # Unicità per deposit address e per output sent dopo la risoluzione chain.
    df_finale = elimina_duplicati_depositi(df_finale)
    df_finale = elimina_duplicati_sent(df_finale)
    df_finale, avvisi_asset = filtra_righe_asset_non_supportato(df_finale)
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
        # Un indirizzo 0x può appartenere a qualunque chain EVM, non solo a Ethereum.
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
