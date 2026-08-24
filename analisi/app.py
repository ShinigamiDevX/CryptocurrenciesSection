"""
Analisi Report — interpreta report operativi (profilo, transazioni wallet, log IP)
e produce un riassunto con grafici e indicazione VPN/hosting sugli IP.
"""
from __future__ import annotations

import io
import ipaddress
import json
import math
import os
import re
import tempfile
import unicodedata
import urllib.error
import urllib.request
import warnings
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any
from urllib.parse import quote

import pandas as pd
import pdfplumber
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Analisi Report", version="2.2.0")
warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_BYTES = 25 * 1024 * 1024
ALLOWED_EXT = {".csv", ".xlsx", ".xls", ".pdf"}
IP_RE = re.compile(
    r"\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b"
)
IPV6_RE = re.compile(r"\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b")

VPN_HINTS = (
    "vpn", "proxy", "nordvpn", "expressvpn", "surfshark", "proton", "mullvad",
    "cyberghost", "windscribe", "ipvanish", "purevpn", "tunnelbear", "pia ",
    "private internet", "hidemyass", "vypr", "hotspot shield",
)
HOSTING_HINTS = (
    "amazon", "aws", "google cloud", "gcp", "microsoft", "azure", "digitalocean",
    "linode", "vultr", "ovh", "hetzner", "cloudflare", "leaseweb", "choopa",
    "m247", "datacamp", "hosting", "vps", "datacenter", "data center", "colocation",
    "server", "cdn", "akamai", "fastly",
)
# DNS/CDN pubblici: alcuni provider marcano is_vpn in modo rumoroso.
PUBLIC_INFRA_HINTS = (
    "google llc", "google public dns", "cloudflare", "amazon.com", "amazon technologies",
    "microsoft corporation", "akamai", "fastly", "quad9", "opendns", "cisco",
    "hurricane electric", "level 3", "lumen", "ripe ncc", "iana",
)
CC_IT = {
    "AD": "Andorra", "AE": "Emirati Arabi Uniti", "AR": "Argentina", "AT": "Austria",
    "AU": "Australia", "BE": "Belgio", "BG": "Bulgaria", "BR": "Brasile",
    "CA": "Canada", "CH": "Svizzera", "CL": "Cile", "CN": "Cina", "CO": "Colombia",
    "CY": "Cipro", "CZ": "Cechia", "DE": "Germania", "DK": "Danimarca",
    "EE": "Estonia", "EG": "Egitto", "ES": "Spagna", "FI": "Finlandia",
    "FR": "Francia", "GB": "Regno Unito", "GR": "Grecia", "HK": "Hong Kong",
    "HR": "Croazia", "HU": "Ungheria", "IE": "Irlanda", "IL": "Israele",
    "IN": "India", "IR": "Iran", "IS": "Islanda", "IT": "Italia", "JP": "Giappone",
    "KR": "Corea del Sud", "LT": "Lituania", "LU": "Lussemburgo", "LV": "Lettonia",
    "MA": "Marocco", "MX": "Messico", "MY": "Malaysia", "NG": "Nigeria",
    "NL": "Paesi Bassi", "NO": "Norvegia", "NZ": "Nuova Zelanda", "PH": "Filippine",
    "PK": "Pakistan", "PL": "Polonia", "PT": "Portogallo", "RO": "Romania",
    "RS": "Serbia", "RU": "Russia", "SA": "Arabia Saudita", "SE": "Svezia",
    "SG": "Singapore", "SI": "Slovenia", "SK": "Slovacchia", "TH": "Thailandia",
    "TR": "Turchia", "TW": "Taiwan", "UA": "Ucraina", "US": "Stati Uniti",
    "VN": "Vietnam", "ZA": "Sudafrica",
}

PROFILE_KEYS = {
    "nome": "Nome", "name": "Nome", "firstname": "Nome", "first name": "Nome",
    "cognome": "Cognome", "lastname": "Cognome", "last name": "Cognome", "surname": "Cognome",
    "email": "Email", "e mail": "Email", "mail": "Email",
    "utente": "Utente", "user": "Utente", "username": "Username", "user id": "ID utente",
    "userid": "ID utente", "account": "Account", "account id": "Account",
    "telefono": "Telefono", "phone": "Telefono", "mobile": "Telefono", "cellulare": "Telefono",
    "nascita": "Data di nascita", "dob": "Data di nascita", "birth": "Data di nascita",
    "residenza": "Residenza", "address": "Indirizzo", "indirizzo": "Indirizzo",
    "citta": "Città", "city": "Città", "paese": "Paese", "country": "Paese",
    "kyc": "KYC", "stato": "Stato", "status": "Stato",
    "documento": "Documento", "document": "Documento", "cf": "Codice fiscale",
    "codice fiscale": "Codice fiscale", "fiscal": "Codice fiscale",
    "nazionalita": "Nazionalità", "nationality": "Nazionalità",
}

IN_WORDS = {
    "in", "entrata", "ingresso", "incoming", "inbound", "deposit", "deposito", "versamento",
    "credit", "accredito", "received", "ricevuto", "receive", "funding",
}
OUT_WORDS = {
    "out", "uscita", "outgoing", "outbound", "withdrawal", "prelievo", "withdraw",
    "debit", "addebito", "sent", "inviato", "send", "payout",
}

SHEET_IP_HINTS = (
    "login", "log in", "access", "accesso", "accessi", "session", "sessione",
    "connession", "connection", "audit", "ip log", "log ip", "indirizzi ip",
    "ip address", "geoip", "geoloc", "last ip", "client ip",
)
SHEET_TX_OUT_HINTS = (
    "preliev", "withdraw", "outgoing", "payout", "cashout", "cash out",
    "outbound", "addebit",
)
SHEET_TX_IN_HINTS = (
    "deposit", "entrata", "entrate", "incoming", "inbound", "funding",
    "versament", "accredit", "topup", "top up",
)
SHEET_TX_HINTS = (
    "transaz", "transaction", "wallet", "moviment", "ledger", "trade",
    "order", "operazion", "storico", "history", "spot", "transfer", "trasfer",
)
SHEET_PROFILE_HINTS = (
    "profil", "anagraf", "utente", "customer", "cliente", "kyc",
    "dati personal", "identity", "identita", "user info", "account info",
    "personal data",
)


def _norm(s: Any) -> str:
    raw = unicodedata.normalize("NFKD", str(s or "").lower())
    raw = "".join(c for c in raw if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", raw).strip()


def _cell(v: Any) -> str:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return ""
    s = str(v).strip()
    if s.lower() in ("nan", "none", "null", "-"):
        return ""
    return s


def _safe_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        if math.isnan(float(v)) or math.isinf(float(v)):
            return None
        return float(v)
    s = str(v).strip().replace(" ", "").replace("€", "").replace("$", "")
    if re.match(r"^-?\d{1,3}(\.\d{3})+,\d+$", s):
        s = s.replace(".", "").replace(",", ".")
    else:
        s = s.replace(",", ".")
    s = re.sub(r"[^0-9.\-]", "", s)
    try:
        f = float(s)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except ValueError:
        return None


def _clean_columns(df: pd.DataFrame, promoted: bool = False) -> pd.DataFrame:
    cols = []
    for i, c in enumerate(df.columns):
        name = str(c).strip() if c is not None and str(c).strip() not in ("", "nan", "None") else f"Colonna_{i + 1}"
        cols.append(name)
    seen: dict[str, int] = {}
    out = []
    for c in cols:
        if c not in seen:
            seen[c] = 0
            out.append(c)
        else:
            seen[c] += 1
            out.append(f"{c}_{seen[c]}")
    df = df.copy()
    df.columns = out
    df = df.dropna(how="all").dropna(axis=1, how="all").reset_index(drop=True)
    unnamed = all(
        str(c).lower().startswith("unnamed") or str(c).startswith("Colonna_")
        for c in df.columns
    )
    if not promoted and unnamed and len(df) > 1:
        first = [_cell(v) for v in df.iloc[0].tolist()]
        textish = sum(1 for v in first if v and _safe_float(v) is None)
        if textish >= max(2, int(len([v for v in first if v]) * 0.6)):
            nxt = df.iloc[1:].copy()
            nxt.columns = [v or f"Colonna_{i + 1}" for i, v in enumerate(first)]
            return _clean_columns(nxt.reset_index(drop=True), promoted=True)
    if not promoted:
        relocated = _relocate_data_header(df)
        if relocated is not None:
            return _clean_columns(relocated, promoted=True)
    return df


def _relocate_data_header(df: pd.DataFrame) -> pd.DataFrame | None:
    """Come Bitget nel cluster: salta le righe promozionali e usa la vera intestazione."""
    if df.empty or len(df) < 2:
        return None
    roles = _roles_map(df, "tx")
    if any(r in roles.values() for r in ("amount", "asset", "wallet", "txid")):
        return None
    type_keys = {"type", "category", "ordertype", "transactiontype", "txtype", "tipo"}
    coin_keys = {"coin", "currency", "asset", "token", "cryptoasset", "amount", "qty"}
    best = None
    first_wide = None
    scan = min(len(df), 30)
    for i in range(scan):
        vals = [_cell(v) for v in df.iloc[i].tolist()]
        nonempty = [v for v in vals if v]
        if first_wide is None and len(nonempty) >= 4:
            first_wide = i
        norms = {_col_compact(v) for v in nonempty}
        if (norms & type_keys and norms & coin_keys) or (
            {"currency", "address"} <= norms
            or {"coin", "amount"} <= norms
            or {"depositaddress", "txid"} <= norms
            or {"toaddress", "coin"} <= norms
        ):
            best = i
            break
    if best is None:
        best = first_wide
    if best is None or best == 0:
        return None
    header = [_cell(v) or f"Colonna_{j + 1}" for j, v in enumerate(df.iloc[best].tolist())]
    body = df.iloc[best + 1 :].copy()
    body.columns = header
    return body.reset_index(drop=True)


def _sheet_title(label: str) -> str:
    if " · " in (label or ""):
        return label.split(" · ", 1)[-1]
    return label or ""


def _sheet_kind(label: str) -> str:
    title = _norm(_sheet_title(label))
    blob = _norm(label)
    tokens = set(title.split())
    hay = title or blob
    compact = re.sub(r"[^a-z0-9]", "", hay)
    if not hay:
        return "unknown"
    if (
        hay in ("ip", "ips", "log", "logs")
        or compact in ("ip", "ips", "log", "logs", "loginhistory", "accesshistory")
        or any(h in hay for h in SHEET_IP_HINTS)
        or (re.search(r"\bip\b", hay) and not any(h in hay for h in SHEET_TX_HINTS))
    ):
        return "ip"
    if compact in ("withdrawalhistory", "withdrawhistory", "withdrawals", "prelievi"):
        return "tx_out"
    if compact in ("deposithistory", "deposits", "depositi"):
        return "tx_in"
    if compact in ("depositaddresses", "depositaddress"):
        return "unknown"
    if compact in ("transactionhistory", "tradehistory", "orderhistory", "fundinghistory"):
        return "tx"
    if compact in ("userinfo", "accountinfo", "kycinfo", "personalinfo"):
        return "profile"
    if tokens & {"out", "uscita", "uscite", "withdraw", "withdrawal", "withdrawals", "payout", "debit"} or any(
        h in hay for h in SHEET_TX_OUT_HINTS
    ):
        return "tx_out"
    if tokens & {"in", "entrata", "entrate", "deposit", "deposits", "depositi", "deposito", "credit"} or any(
        h in hay for h in SHEET_TX_IN_HINTS
    ):
        return "tx_in"
    if any(h in hay for h in SHEET_TX_HINTS):
        return "tx"
    if any(h in hay for h in SHEET_PROFILE_HINTS) or hay in ("user", "utente", "account"):
        return "profile"
    if any(h in blob for h in SHEET_IP_HINTS) or re.search(r"\bip\b", blob):
        return "ip"
    if any(h in blob for h in SHEET_TX_OUT_HINTS):
        return "tx_out"
    if any(h in blob for h in SHEET_TX_IN_HINTS):
        return "tx_in"
    if any(h in blob for h in SHEET_TX_HINTS):
        return "tx"
    if any(h in blob for h in SHEET_PROFILE_HINTS):
        return "profile"
    return "unknown"


FIAT_ASSETS = {
    "eur", "usd", "gbp", "chf", "jpy", "try", "brl", "aud", "cad", "hkd",
    "sgd", "krw", "cny", "mxn", "pln", "sek", "nok", "dkk", "zar", "inr",
    "rub", "aed", "sar",
}

NETWORK_LABELS = {
    "erc20": "ERC20", "eth": "ERC20", "ethereum": "ERC20",
    "bep20": "BEP20", "bsc": "BEP20", "bnbsmartchain": "BEP20",
    "trc20": "TRC20", "trx": "TRC20", "tron": "TRC20",
    "polygon": "POLYGON", "matic": "POLYGON", "pol": "POLYGON",
    "arbone": "ARB", "arbitrum": "ARB", "arb": "ARB",
    "op": "OP", "optimism": "OP",
    "base": "BASE",
    "avaxc": "AVAX", "avax": "AVAX", "avalanche": "AVAX",
    "sol": "SOL", "solana": "SOL", "spl": "SOL",
    "btc": "BTC", "bitcoin": "BTC",
    "ltc": "LTC", "litecoin": "LTC",
    "doge": "DOGE", "dogecoin": "DOGE",
    "xlm": "XLM", "stellar": "XLM",
    "xrp": "XRP", "ripple": "XRP",
    "bch": "BCH", "bitcoincash": "BCH",
    "ton": "TON", "sui": "SUI", "linea": "LINEA", "zksync": "ZK",
}

SKIP_TRADE_TYPES = frozenset({
    "buy", "sell", "trade", "convert", "match", "fill", "spottrade",
    "advancedtrade", "advancedtradefill", "staking", "staked",
    "reward", "rewards", "rebate", "interest", "commission",
    "realizedpnl", "fundingfee", "liquidation",
})
SKIP_STATUS = frozenset({
    "cancelled", "canceled", "failed", "rejected", "expired",
})


def _col_compact(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", _norm(name))


def _is_tx_hash(value: str) -> bool:
    s = (value or "").strip()
    if s.startswith("0x") and len(s) == 66 and all(c in "0123456789abcdefABCDEF" for c in s[2:]):
        return True
    if len(s) == 64 and all(c in "0123456789abcdefABCDEF" for c in s):
        return True
    return False


def _is_evm_address(value: str) -> bool:
    s = (value or "").strip()
    return s.startswith("0x") and len(s) == 42


def _looks_internal(text: str) -> bool:
    n = _norm(text).replace(" ", "")
    compact = _col_compact(text)
    raw = (text or "").strip()
    if raw.upper().startswith("INNER_"):
        return True
    return (
        compact in ("internaltransfer", "internal", "inner", "innertransfer")
        or "internaltransfer" in n
        or "innertransfer" in n
        or n == "inner"
    )


def _is_bnb_beacon(address: str, network: str) -> bool:
    addr = (address or "").strip().lower()
    if addr.startswith("bnb") and not addr.startswith("0x"):
        return True
    return _col_compact(network) == "bnb"


def _is_exchange_trade(text: str) -> bool:
    return _col_compact(text) in SKIP_TRADE_TYPES


def _is_failed_status(text: str) -> bool:
    return _col_compact(text) in SKIP_STATUS


def _asset_with_network(coin: str, network: str) -> str:
    ticker = (coin or "").strip()
    if ticker.lower() in ("nan", "none", "—"):
        ticker = ""
    net_key = _col_compact(network)
    label = NETWORK_LABELS.get(net_key, "")
    if not label and network and _norm(network) not in ("", _norm(ticker)):
        label = str(network).strip().upper()
    if ticker and label and label.upper() not in ticker.upper():
        return f"{ticker} ({label})"
    return ticker or label or "—"


def _guess_asset_from_address(address: str, coin: str) -> str:
    if coin:
        return coin
    addr = (address or "").strip()
    if not addr or _is_tx_hash(addr) or _is_evm_address(addr):
        return ""
    low = addr.lower()
    if low.startswith("bitcoincash:"):
        return "BCH"
    if low.startswith(("bc1q", "bc1p")) or (addr[:1] in "13" and 26 <= len(addr) <= 35):
        return "BTC"
    if low.startswith("ltc1") or (addr[:1] in "LM" and 26 <= len(addr) <= 35):
        return "LTC"
    if addr.startswith(("EQ", "UQ", "0:")):
        return "TON"
    if addr.startswith("T") and 30 <= len(addr) <= 36:
        return "TRX"
    if addr.startswith("r") and 25 <= len(addr) <= 35:
        return "XRP"
    if len(addr) == 56 and addr.startswith("G"):
        return "XLM"
    if addr.startswith("D") and 26 <= len(addr) <= 35:
        return "DOGE"
    if len(addr) in (95, 106) and addr[:1] in "48":
        return "XMR"
    if 32 <= len(addr) <= 44 and all(c not in addr for c in "0OIl") and re.fullmatch(r"[1-9A-HJ-NP-Za-km-z]+", addr):
        return "SOL"
    return ""


def _row_pick(row: Any, *aliases: str) -> str:
    wanted = {_col_compact(a) for a in aliases}
    for key in row.index:
        if _col_compact(key) in wanted:
            return _cell(row.get(key))
    return ""


def _col_role(name: str, kind: str = "unknown") -> str | None:
    n = _norm(name)
    if not n:
        return None
    if any(k in n for k in ("fee", "commiss", "gas fee", "network fee", "transactionfee")):
        return None
    compact = _col_compact(name)
    if compact in ("ipaddress", "clientip", "remoteaddr", "sourceip", "loginip") or n in ("ip", "ipv4", "ipv6"):
        return "ip"
    if any(k in n for k in ("ip address", "indirizzo ip", "client ip", "remote addr", "source ip", "login ip")):
        return "ip"
    if kind == "ip" and any(k in n for k in ("host", "origin", "remote", "client")) and "name" not in n:
        return "ip"
    if compact in (
        "txid", "txhash", "transactionhash", "transactionhashtxid", "transactionid",
        "hashtransazione",
    ) or n in ("hash", "txid") or any(k in n for k in ("txid", "tx id", "tx hash", "transaction hash")):
        return "txid"
    if compact in ("counterpartyid", "counterparty", "cpid"):
        return None
    if compact in (
        "depositaddress", "destinationaddress", "toaddress", "fromaddress",
        "walletaddress", "toaddr", "cryptoaddress", "indirizzowallet",
    ):
        return "wallet"
    if kind in ("tx", "tx_in", "tx_out") and n in ("address", "indirizzo", "to", "from", "destinatario", "mittente"):
        return "wallet"
    if any(k in n for k in ("wallet", "indirizzo wallet", "crypto address", "to address", "from address", "destinatario", "mittente", "deposit address", "destination address")):
        return "wallet"
    if compact in ("amount", "importo", "quantity", "quantita", "valore", "somma", "qty", "qta", "size", "volume", "coinamount"):
        return "amount"
    if any(k in n for k in ("amount", "importo", "quantita", "quantity", "valore", "somma", "totale", "volume", "qty", "qta", "size")):
        return "amount"
    if compact in ("type", "tipo", "side", "direzione", "category", "ordertype", "transactiontype", "txtype"):
        return "direction"
    if any(k in n for k in ("tipo", "type", "side", "direzione", "flow", "movimento", "operation", "operazione")):
        return "direction"
    if compact in ("currency", "asset", "coin", "crypto", "valuta", "token", "symbol", "ticker", "moneta", "assettype"):
        return "asset"
    if any(k in n for k in ("currency", "asset", "coin", "crypto", "valuta", "token", "symbol", "moneta", "ticker")):
        return "asset"
    if compact in (
        "date", "time", "timestamp", "datetime", "created", "dateutc",
        "createtime", "updatetime", "insertdate", "txntime", "txntimeutc",
    ):
        return "when"
    if n in ("data", "date", "time", "ora", "quando") or any(
        k in n for k in ("timestamp", "datetime", "date utc", "created at", "create time", "data ora")
    ):
        return "when"
    if kind == "ip" and n in ("address", "indirizzo"):
        return "ip"
    if kind != "tx" and kind not in ("tx_in", "tx_out") and (
        n in PROFILE_KEYS or any(n.endswith(" " + k) or n.startswith(k + " ") for k in PROFILE_KEYS)
    ):
        return "profile"
    return None


def _direction_of(text: str, amount: float | None) -> str | None:
    n = _norm(text)
    tokens = set(n.split())
    if tokens & IN_WORDS or any(w in n for w in IN_WORDS if len(w) > 2):
        return "in"
    if tokens & OUT_WORDS or any(w in n for w in OUT_WORDS if len(w) > 2):
        return "out"
    if amount is not None and amount < 0:
        return "out"
    return None


def _is_private_ip(ip: str) -> bool:
    try:
        obj = ipaddress.ip_address(ip)
        return obj.is_private or obj.is_loopback or obj.is_link_local or obj.is_reserved
    except ValueError:
        return False


def _coord(v: Any) -> float | None:
    try:
        f = float(v)
        if math.isnan(f) or math.isinf(f):
            return None
        if abs(f) > 180:
            return None
        return f
    except (TypeError, ValueError):
        return None


def _country_name(cc: str) -> str:
    code = (cc or "").strip().upper()
    if not code or code in ("XX", "ZZ"):
        return "—"
    return CC_IT.get(code, code)


IP_LOOKUP_LIMIT = 80
IP_LOOKUP_WORKERS = 6
IP_HTTP_UA = "CryptocurrenciesSection-analisi/2.1"


def _env(name: str) -> str:
    return (os.environ.get(name) or "").strip()


def _pretty_name(raw: Any) -> str:
    if isinstance(raw, list):
        for item in raw:
            name = _pretty_name(item)
            if name:
                return name
        return ""
    if isinstance(raw, dict):
        return _pretty_name(raw.get("name") or next(iter(raw.values()), ""))
    text = str(raw or "").replace("_", " ").strip()
    if not text or text.lower() in ("none", "null", "n/a", "na", "—"):
        return ""
    return text


def _pair_lat_lon(lat: Any, lon: Any) -> tuple[float | None, float | None]:
    la, lo = _coord(lat), _coord(lon)
    if la is None or lo is None or abs(la) > 90:
        return None, None
    return la, lo


def _normalize_country(val: str) -> str:
    code = (val or "").strip()
    if not code or code.upper() in ("XX", "ZZ", "N/A", "NA"):
        return "—"
    if len(code) == 2 and code.isalpha():
        return _country_name(code)
    return code


def _http_json(
    url: str,
    *,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = 12,
) -> Any:
    hdrs = {"Accept": "application/json", "User-Agent": IP_HTTP_UA}
    if headers:
        hdrs.update(headers)
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        hdrs.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        try:
            raw = exc.read().decode("utf-8", errors="replace")
            obj = json.loads(raw)
            if isinstance(obj, dict):
                obj["_http_status"] = exc.code
                return obj
        except Exception:
            return None
        return None
    except (urllib.error.URLError, TimeoutError, OSError):
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def _blank_flags() -> dict[str, Any]:
    return {
        "is_vpn": False,
        "is_proxy": False,
        "is_tor": False,
        "is_datacenter": False,
        "is_residential_proxy": False,
        "is_relay": False,
        "isp": "",
        "org": "",
        "vpn_provider": "",
        "country": "",
        "city": "",
        "lat": None,
        "lon": None,
        "source": "",
    }


def _vpn_label(geo: dict[str, Any] | None) -> tuple[str, str]:
    if not geo:
        return "sconosciuto", "Lookup non disponibile"
    blob = " ".join(
        str(geo.get(k) or "")
        for k in ("company_name", "asn_org", "isp", "org", "as", "vpn_provider")
    ).lower()
    public_infra = any(h in blob for h in PUBLIC_INFRA_HINTS)
    name_vpn = any(h in blob for h in VPN_HINTS)
    hosting_flag = geo.get("is_datacenter") is True or any(h in blob for h in HOSTING_HINTS)
    provider = _pretty_name(geo.get("vpn_provider"))

    if geo.get("is_tor") is True:
        return "vpn", "Nodo di uscita Tor"
    if geo.get("is_residential_proxy") is True and not public_infra:
        return "vpn", "Proxy residenziale" + (f" ({provider})" if provider else "")
    if geo.get("is_relay") is True and not public_infra:
        return "vpn", "Relay" + (f" ({provider})" if provider else " (Private Relay o simile)")
    if geo.get("is_proxy") is True and not public_infra:
        return "vpn", "Segnalato come proxy" + (f" ({provider})" if provider else "")
    if (geo.get("is_vpn") is True or name_vpn) and not public_infra:
        if provider:
            return "vpn", f"VPN {provider}"
        if name_vpn:
            return "vpn", "Provider VPN"
        return "vpn", "Segnalato come VPN"
    if hosting_flag:
        return "hosting", "IP di hosting / datacenter"
    return "residenziale", "Probabile connessione residenziale / mobile"


def _unknown_ip(ip: str, reason: str = "Impossibile interrogare il servizio geolocalizzazione") -> dict[str, Any]:
    return {
        "ip": ip, "kind": "sconosciuto", "reason": reason,
        "country": "—", "city": "—", "isp": "—", "org": "—",
        "lat": None, "lon": None, "source": "",
    }


def _private_ip_row(ip: str) -> dict[str, Any]:
    return {
        "ip": ip, "kind": "privato", "reason": "Indirizzo privato / rete locale",
        "country": "—", "city": "—", "isp": "—", "org": "—",
        "lat": None, "lon": None, "source": "",
    }


def _merge_flags(parts: list[dict[str, Any]]) -> dict[str, Any]:
    out = _blank_flags()
    sources: list[str] = []
    for part in parts:
        if not part:
            continue
        for key in ("is_vpn", "is_proxy", "is_tor", "is_datacenter", "is_residential_proxy", "is_relay"):
            out[key] = bool(out[key] or part.get(key))
        for key in ("isp", "org", "vpn_provider", "country", "city"):
            if not out[key] and part.get(key):
                out[key] = part[key]
        if out["lat"] is None and part.get("lat") is not None:
            out["lat"] = part.get("lat")
            out["lon"] = part.get("lon")
        src = str(part.get("source") or "").strip()
        if src and src not in sources:
            sources.append(src)
    out["source"] = " + ".join(sources)
    return out


def _row_from_flags(ip: str, flags: dict[str, Any]) -> dict[str, Any]:
    kind, reason = _vpn_label(flags)
    return {
        "ip": ip,
        "kind": kind,
        "reason": reason,
        "country": _normalize_country(str(flags.get("country") or "")),
        "city": _cell(flags.get("city")) or "—",
        "isp": _cell(flags.get("isp")) or _cell(flags.get("org")) or "—",
        "org": _cell(flags.get("org")) or "—",
        "lat": flags.get("lat"),
        "lon": flags.get("lon"),
        "source": flags.get("source") or "",
    }


def _fetch_ipqs(ip: str) -> dict[str, Any] | None:
    key = _env("IPQS_API_KEY")
    if not key:
        return None
    url = (
        f"https://www.ipqualityscore.com/api/json/ip/{quote(key, safe='')}/"
        f"{quote(ip, safe='')}?strictness=1&allow_public_access_points=true"
    )
    data = _http_json(url, timeout=10)
    if not isinstance(data, dict) or data.get("success") is False:
        return None
    if data.get("_http_status") in (401, 403, 429):
        return None
    conn = str(data.get("connection_type") or "").lower().replace(" ", "")
    lat, lon = _pair_lat_lon(data.get("latitude"), data.get("longitude"))
    isp = _cell(data.get("ISP") or data.get("isp"))
    flags = _blank_flags()
    flags.update({
        "is_vpn": bool(data.get("vpn") or data.get("active_vpn")),
        "is_proxy": bool(data.get("proxy")),
        "is_tor": bool(data.get("tor") or data.get("active_tor")),
        "is_datacenter": conn in ("datacenter", "datacentre"),
        "isp": isp,
        "org": _cell(data.get("organization") or data.get("Organization")),
        "vpn_provider": isp if any(h in isp.lower() for h in VPN_HINTS) else "",
        "country": str(data.get("country_code") or ""),
        "city": _cell(data.get("city")),
        "lat": lat,
        "lon": lon,
        "source": "IPQualityScore",
    })
    return flags


def _fetch_spur(ip: str) -> dict[str, Any] | None:
    token = _env("SPUR_API_TOKEN")
    if not token:
        return None
    data = _http_json(
        f"https://api.spur.us/v2/context/{quote(ip, safe='')}",
        headers={"Token": token},
        timeout=10,
    )
    if not isinstance(data, dict) or data.get("_http_status") in (400, 401, 403, 429):
        return None
    if not any(data.get(k) for k in ("ip", "as", "infrastructure", "tunnels", "location")):
        return None
    tunnels = data.get("tunnels") if isinstance(data.get("tunnels"), list) else []
    types = {str(t.get("type") or "").upper() for t in tunnels if isinstance(t, dict)}
    operators = [_pretty_name(t.get("operator")) for t in tunnels if isinstance(t, dict)]
    risks = [str(r).upper() for r in (data.get("risks") or [])]
    client = data.get("client") if isinstance(data.get("client"), dict) else {}
    proxies = client.get("proxies") or []
    loc = data.get("location") if isinstance(data.get("location"), dict) else {}
    asn = data.get("as") if isinstance(data.get("as"), dict) else {}
    infra = str(data.get("infrastructure") or "").upper()
    org = _cell(data.get("organization")) or _cell(asn.get("organization"))
    flags = _blank_flags()
    flags.update({
        "is_vpn": "VPN" in types or any(r in ("TUNNEL", "VPN_TUNNEL") for r in risks),
        "is_proxy": "PROXY" in types or any("PROXY" in r for r in risks) or bool(proxies),
        "is_tor": "TOR" in types or any("TOR" in r for r in risks),
        "is_datacenter": infra in ("DATACENTER", "HOSTING"),
        "is_residential_proxy": bool(proxies) or any("RESIDENTIAL" in r for r in risks),
        "isp": org,
        "org": org,
        "vpn_provider": next((name for name in operators if name), ""),
        "country": str(loc.get("country") or ""),
        "city": _cell(loc.get("city")),
        "source": "Spur",
    })
    return flags


def _fetch_ipgeo(ip: str) -> dict[str, Any] | None:
    key = _env("IPGEOLOCATION_API_KEY")
    if not key:
        return None
    url = (
        f"https://api.ipgeolocation.io/v3/ipgeo?apiKey={quote(key, safe='')}"
        f"&ip={quote(ip, safe='')}&include=security"
    )
    data = _http_json(url, timeout=10)
    if not isinstance(data, dict) or data.get("_http_status") in (401, 403, 423):
        return None
    sec = data.get("security") if isinstance(data.get("security"), dict) else {}
    loc = data.get("location") if isinstance(data.get("location"), dict) else {}
    asn = data.get("asn") if isinstance(data.get("asn"), dict) else {}
    company = data.get("company") if isinstance(data.get("company"), dict) else {}
    if not sec and not loc and data.get("ip") is None:
        return None
    lat, lon = _pair_lat_lon(
        loc.get("latitude") or data.get("latitude"),
        loc.get("longitude") or data.get("longitude"),
    )
    vpn_names = sec.get("vpn_provider_names") or sec.get("proxy_provider_names") or sec.get("relay_provider_name")
    org = _cell(asn.get("organization")) or _cell(company.get("name"))
    flags = _blank_flags()
    flags.update({
        "is_vpn": bool(sec.get("is_vpn")),
        "is_proxy": bool(sec.get("is_proxy") or sec.get("is_residential_proxy")),
        "is_tor": bool(sec.get("is_tor")),
        "is_datacenter": bool(sec.get("is_cloud_provider")) or str(asn.get("type") or "").upper() in ("HOSTING", "DATACENTER"),
        "is_residential_proxy": bool(sec.get("is_residential_proxy")),
        "is_relay": bool(sec.get("is_relay")),
        "isp": _cell(company.get("name")) or org,
        "org": org,
        "vpn_provider": _pretty_name(vpn_names),
        "country": str(loc.get("country_code2") or data.get("country_code2") or ""),
        "city": _cell(loc.get("city") or data.get("city")),
        "lat": lat,
        "lon": lon,
        "source": "IPGeolocation.io",
    })
    return flags


def _fetch_vpnapi(ip: str) -> dict[str, Any] | None:
    data = _http_json(f"https://vpnapi.io/api/{quote(ip, safe='')}", timeout=10)
    if not isinstance(data, dict) or not isinstance(data.get("security"), dict):
        return None
    sec = data["security"]
    loc = data.get("location") if isinstance(data.get("location"), dict) else {}
    net = data.get("network") if isinstance(data.get("network"), dict) else {}
    lat, lon = _pair_lat_lon(loc.get("latitude"), loc.get("longitude"))
    org = _cell(net.get("autonomous_system_organization"))
    flags = _blank_flags()
    flags.update({
        "is_vpn": bool(sec.get("vpn")),
        "is_proxy": bool(sec.get("proxy")),
        "is_tor": bool(sec.get("tor")),
        "is_relay": bool(sec.get("relay")),
        "isp": org,
        "org": org,
        "country": str(loc.get("country_code") or ""),
        "city": _cell(loc.get("city")),
        "lat": lat,
        "lon": lon,
        "source": "vpnapi.io",
    })
    return flags


def _fetch_proxycheck(ip: str) -> dict[str, Any] | None:
    data = _http_json(
        f"https://proxycheck.io/v2/{quote(ip, safe='')}?vpn=1&asn=1",
        timeout=10,
    )
    if not isinstance(data, dict) or str(data.get("status") or "").lower() != "ok":
        return None
    row = data.get(ip) if isinstance(data.get(ip), dict) else None
    if not row:
        return None
    proxy_flag = str(row.get("proxy") or "").lower() in ("yes", "true", "1")
    ptype = str(row.get("type") or "").lower()
    lat, lon = _pair_lat_lon(row.get("latitude"), row.get("longitude"))
    org = _cell(row.get("provider") or row.get("organisation") or row.get("organization"))
    flags = _blank_flags()
    flags.update({
        "is_vpn": proxy_flag and ("vpn" in ptype or ptype in ("", "vpn")),
        "is_proxy": proxy_flag and "vpn" not in ptype and "tor" not in ptype,
        "is_tor": proxy_flag and "tor" in ptype,
        "is_datacenter": ptype in ("business", "hosting", "datacenter", "comp"),
        "isp": org,
        "org": org,
        "vpn_provider": org if proxy_flag and "vpn" in ptype else "",
        "country": str(row.get("isocode") or ""),
        "city": _cell(row.get("city")),
        "lat": lat,
        "lon": lon,
        "source": "proxycheck.io",
    })
    return flags


def _fetch_iplocate(ip: str) -> dict[str, Any] | None:
    data = _http_json(f"https://iplocate.io/api/lookup/{quote(ip, safe='')}", timeout=10)
    if not isinstance(data, dict) or not data.get("ip"):
        return None
    privacy = data.get("privacy") if isinstance(data.get("privacy"), dict) else {}
    asn = data.get("asn") if isinstance(data.get("asn"), dict) else {}
    hosting = data.get("hosting") if isinstance(data.get("hosting"), dict) else {}
    lat, lon = _pair_lat_lon(data.get("latitude"), data.get("longitude"))
    org = _cell(asn.get("name") or hosting.get("provider"))
    flags = _blank_flags()
    flags.update({
        "is_vpn": bool(privacy.get("is_vpn")),
        "is_proxy": bool(privacy.get("is_proxy")),
        "is_tor": bool(privacy.get("is_tor")),
        "is_relay": bool(privacy.get("is_icloud_relay")),
        "is_datacenter": bool(privacy.get("is_hosting")) or str(asn.get("type") or "").lower() == "hosting",
        "isp": org,
        "org": org,
        "country": str(data.get("country_code") or ""),
        "city": _cell(data.get("city")),
        "lat": lat,
        "lon": lon,
        "source": "IPLocate.io",
    })
    return flags


def _fetch_free_stack(ip: str) -> dict[str, Any] | None:
    """Fallback gratuito se non ci sono chiavi premium e IPLogs non è raggiungibile."""
    parts: list[dict[str, Any]] = []
    for fn in (_fetch_proxycheck, _fetch_vpnapi):
        try:
            got = fn(ip)
        except Exception:
            got = None
        if got:
            parts.append(got)
    if not parts or all(p.get("lat") is None for p in parts):
        try:
            geo = _fetch_iplocate(ip)
        except Exception:
            geo = None
        if geo:
            parts.append(geo)
    if not parts:
        return None
    return _merge_flags(parts)


def _fetch_geo_only(ip: str) -> dict[str, Any] | None:
    for fn in (_fetch_proxycheck, _fetch_iplocate, _fetch_vpnapi):
        try:
            got = fn(ip)
        except Exception:
            got = None
        if got and got.get("lat") is not None:
            return got
    return None


def _fetch_iplogs_bulk(ips: list[str]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    if not ips:
        return out
    data = _http_json(
        "https://iplogs.com/v1/bulk-check",
        method="POST",
        payload={"ips": ips},
        timeout=95,
    )
    rows: list[Any] = []
    if isinstance(data, dict):
        maybe = data.get("results")
        if isinstance(maybe, list):
            rows = maybe
    elif isinstance(data, list):
        rows = data
    for row in rows:
        if not isinstance(row, dict):
            continue
        ip = str(row.get("ip") or "").strip()
        if not ip:
            continue
        verdict = str(row.get("verdict") or "").lower()
        info = row.get("ip_info") if isinstance(row.get("ip_info"), dict) else {}
        ip_type = str(info.get("type") or "").lower()
        provider = _pretty_name(row.get("vpn_provider") or info.get("vpn_provider"))
        lat, lon = _pair_lat_lon(info.get("lat") or row.get("lat"), info.get("lon") or row.get("lon"))
        flags = _blank_flags()
        flags.update({
            "is_vpn": bool(row.get("is_vpn")) or verdict in ("vpn_detected", "vpn_likely"),
            "is_proxy": bool(info.get("is_proxy")) or verdict == "suspicious",
            "is_tor": "tor" in provider.lower() or "tor" in verdict,
            "is_datacenter": ip_type in ("datacenter", "hosting"),
            "isp": _cell(row.get("org") or info.get("isp") or info.get("org")),
            "org": _cell(row.get("org") or info.get("org")),
            "vpn_provider": provider,
            "country": str(row.get("country_code") or info.get("country_code") or ""),
            "city": _cell(info.get("city")),
            "lat": lat,
            "lon": lon,
            "source": "IPLogs",
        })
        out[ip] = flags
    return out


def _map_parallel(ips: list[str], fn, workers: int = IP_LOOKUP_WORKERS) -> dict[str, Any]:
    out: dict[str, Any] = {}
    if not ips:
        return out
    with ThreadPoolExecutor(max_workers=min(workers, len(ips))) as pool:
        futs = {pool.submit(fn, ip): ip for ip in ips}
        for fut in as_completed(futs):
            ip = futs[fut]
            try:
                out[ip] = fut.result()
            except Exception:
                out[ip] = None
    return out


def _fill_missing_geo(flags_by_ip: dict[str, dict[str, Any]]) -> None:
    need = [ip for ip, flags in flags_by_ip.items() if flags and flags.get("lat") is None]
    if not need:
        return
    extras = _map_parallel(need, _fetch_geo_only)
    for ip, geo in extras.items():
        if not geo:
            continue
        flags = flags_by_ip[ip]
        if flags.get("lat") is None:
            flags["lat"] = geo.get("lat")
            flags["lon"] = geo.get("lon")
        for key in ("country", "city", "isp", "org"):
            if not flags.get(key) and geo.get(key):
                flags[key] = geo[key]


def _premium_fetchers() -> list:
    fns = []
    if _env("IPQS_API_KEY"):
        fns.append(_fetch_ipqs)
    if _env("SPUR_API_TOKEN"):
        fns.append(_fetch_spur)
    if _env("IPGEOLOCATION_API_KEY"):
        fns.append(_fetch_ipgeo)
    return fns


def _intel_configured() -> list[str]:
    names = []
    if _env("IPQS_API_KEY"):
        names.append("IPQualityScore")
    if _env("SPUR_API_TOKEN"):
        names.append("Spur")
    if _env("IPGEOLOCATION_API_KEY"):
        names.append("IPGeolocation.io")
    if not names:
        names.append("IPLogs")
    return names


def _lookup_ips(ips: list[str]) -> dict[str, dict[str, Any]]:
    unique = list(dict.fromkeys(ips))[:IP_LOOKUP_LIMIT]
    out: dict[str, dict[str, Any]] = {}
    public = [ip for ip in unique if not _is_private_ip(ip)]
    for ip in unique:
        if _is_private_ip(ip):
            out[ip] = _private_ip_row(ip)
    if not public:
        return out

    buckets: dict[str, list[dict[str, Any]]] = {ip: [] for ip in public}
    fetchers = _premium_fetchers()
    if fetchers:
        with ThreadPoolExecutor(max_workers=len(fetchers)) as pool:
            jobs = [pool.submit(_map_parallel, public, fn) for fn in fetchers]
            for job in as_completed(jobs):
                try:
                    got = job.result()
                except Exception:
                    continue
                for ip, flags in got.items():
                    if flags:
                        buckets[ip].append(flags)

    missing = [ip for ip in public if not buckets[ip]]
    if missing:
        for ip, flags in _fetch_iplogs_bulk(missing).items():
            buckets[ip].append(flags)
        missing = [ip for ip in public if not buckets[ip]]

    merged: dict[str, dict[str, Any]] = {}
    still: list[str] = []
    for ip in public:
        if buckets[ip]:
            merged[ip] = _merge_flags(buckets[ip])
        else:
            still.append(ip)

    _fill_missing_geo(merged)

    if still:
        fallback = _map_parallel(still, _fetch_free_stack)
        for ip in still:
            flags = fallback.get(ip)
            if flags:
                merged[ip] = flags
            else:
                out[ip] = _unknown_ip(ip)

    for ip, flags in merged.items():
        out[ip] = _row_from_flags(ip, flags)
    return out


def _roles_map(df: pd.DataFrame, kind: str = "unknown") -> dict[str, str]:
    roles = {}
    for col in df.columns:
        role = _col_role(col, kind)
        if role:
            roles[col] = role
    return roles


def _guess_amount_cols(df: pd.DataFrame, kind: str) -> list[str]:
    skip = set()
    for col in df.columns:
        role = _col_role(col, kind)
        if role in ("when", "txid", "ip", "wallet"):
            skip.add(col)
    found = []
    for col in df.columns:
        if col in skip:
            continue
        n = _norm(col)
        if any(x in n for x in ("fee", "commiss", "id", "hash", "wallet", "address")):
            continue
        sample = [_safe_float(v) for v in df[col].head(40).tolist()]
        ok = [x for x in sample if x is not None]
        if len(ok) >= max(2, int(len(sample) * 0.35)):
            found.append(col)
    return found


def _extract_profile_kv(df: pd.DataFrame, loose: bool = False) -> dict[str, str]:
    if df.shape[1] < 2:
        return {}
    left, right = df.columns[0], df.columns[1]
    profile = {}
    for _, row in df.iterrows():
        key = _norm(row.get(left))
        val = _cell(row.get(right))
        if not key or not val:
            continue
        label = PROFILE_KEYS.get(key)
        if not label:
            for pk, lb in PROFILE_KEYS.items():
                if pk in key:
                    label = lb
                    break
        if label:
            profile[label] = val
        elif loose:
            raw_key = _cell(row.get(left))
            if raw_key and raw_key not in profile:
                profile[raw_key] = val
    return profile


def _extract_profile_cols(df: pd.DataFrame, loose: bool = False) -> dict[str, str]:
    profile = {}
    if df.empty:
        return profile
    row = df.iloc[0]
    for col in df.columns:
        n = _norm(col)
        label = PROFILE_KEYS.get(n)
        if not label:
            for pk, lb in PROFILE_KEYS.items():
                if pk in n:
                    label = lb
                    break
        if not label and loose:
            label = str(col).strip()
        if not label or str(col).startswith("Colonna_"):
            continue
        val = _cell(row.get(col))
        if val:
            profile[label] = val
    return profile


def _extract_transactions(
    df: pd.DataFrame,
    source: str,
    kind: str = "unknown",
    default_direction: str | None = None,
    warnings: list[str] | None = None,
) -> list[dict[str, Any]]:
    roles = _roles_map(df, kind)
    amount_cols = [c for c, r in roles.items() if r == "amount"]
    dir_cols = [c for c, r in roles.items() if r == "direction"]
    asset_cols = [c for c, r in roles.items() if r == "asset"]
    when_cols = [c for c, r in roles.items() if r == "when"]
    wallet_cols = [c for c, r in roles.items() if r == "wallet"]
    txid_cols = [c for c, r in roles.items() if r == "txid"]
    in_col = next((c for c in df.columns if _norm(c) in ("in", "entrata", "incoming", "deposit")), None)
    out_col = next((c for c in df.columns if _norm(c) in ("out", "uscita", "outgoing", "withdrawal")), None)
    if not amount_cols and kind in ("tx", "tx_in", "tx_out"):
        amount_cols = _guess_amount_cols(df, kind)

    looks_tx = bool(
        amount_cols or in_col or out_col or dir_cols or wallet_cols
        or kind in ("tx", "tx_in", "tx_out")
        or any(_col_compact(c) in ("coin", "currency", "depositaddress", "toaddress", "txid") for c in df.columns)
    )
    if not looks_tx:
        return []

    notes = warnings if warnings is not None else []
    rows = []
    skipped_internal = 0
    skipped_fiat = 0
    skipped_trade = 0
    skipped_status = 0
    skipped_beacon = 0
    for _, raw in df.iterrows():
        sub = _row_pick(
            raw, "subcategory", "sub cat", "sub category", "data_src_desc",
            "datasrcdesc", "remark", "notes", "comment", "memo",
        )
        if _looks_internal(sub) or _col_compact(sub) == "fiat":
            if _col_compact(sub) == "fiat":
                skipped_fiat += 1
            else:
                skipped_internal += 1
            continue
        cpid = _row_pick(raw, "counterparty id", "counterpartyid", "counter party id", "cpid")
        if cpid:
            skipped_internal += 1
            continue
        addr_raw = _row_pick(
            raw, "deposit address", "destination address", "to_address", "to address",
            "to", "from address", "from_address", "wallet", "address", "indirizzo",
        ) or (_cell(raw.get(wallet_cols[0])) if wallet_cols else "")
        if addr_raw.upper().startswith("INNER_"):
            skipped_internal += 1
            continue

        amount = None
        direction = None
        if in_col or out_col:
            inn = _safe_float(raw.get(in_col)) if in_col else None
            outv = _safe_float(raw.get(out_col)) if out_col else None
            if inn and inn != 0:
                amount, direction = abs(inn), "in"
            elif outv and outv != 0:
                amount, direction = abs(outv), "out"
        if amount is None and amount_cols:
            amount = _safe_float(raw.get(amount_cols[0]))
        if amount is None:
            amount = _safe_float(_row_pick(raw, "amount", "importo", "qty", "quantity", "volume", "coinamount"))

        dir_text = _cell(raw.get(dir_cols[0])) if dir_cols else ""
        if not dir_text:
            dir_text = _row_pick(raw, "type", "tipo", "side", "category", "transaction type")
        if _is_exchange_trade(dir_text):
            skipped_trade += 1
            continue
        status = _row_pick(raw, "status", "state", "tx status", "withdraw status")
        if _is_failed_status(status):
            skipped_status += 1
            continue
        if direction is None:
            direction = _direction_of(dir_text, amount)
        if direction is None:
            direction = default_direction

        coin = _cell(raw.get(asset_cols[0])) if asset_cols else ""
        if not coin:
            coin = _row_pick(raw, "coin", "currency", "asset", "token", "symbol", "asset type")
        network = _row_pick(
            raw, "network", "chain", "network type", "chain name", "chain type",
            "network protocol", "blockchain", "chainid",
        )
        if coin and coin.strip().lower() in FIAT_ASSETS:
            skipped_fiat += 1
            continue
        if _is_bnb_beacon(addr_raw, network):
            skipped_beacon += 1
            continue

        txid = _cell(raw.get(txid_cols[0])) if txid_cols else ""
        if not txid:
            txid = _row_pick(
                raw, "txid", "tx_id", "tx hash", "transaction hash", "hash",
                "transactionhashtxid", "transaction hash txid",
            )
        wallet = addr_raw
        if _is_tx_hash(wallet):
            if not txid:
                txid = wallet
            wallet = ""
        if _is_evm_address(txid) and not wallet:
            wallet, txid = txid, ""

        if direction == "out" and not wallet and not _is_tx_hash(txid):
            skipped_internal += 1
            continue

        if amount is None and not dir_text and not wallet and not txid:
            continue
        if amount is None:
            continue
        if direction is None:
            direction = "out" if amount < 0 else "in"

        coin = _guess_asset_from_address(wallet, coin)
        asset = _asset_with_network(coin, network)
        rows.append({
            "source": source,
            "direction": direction,
            "amount": abs(amount),
            "asset": asset,
            "when": (_cell(raw.get(when_cols[0])) if when_cols else "") or _row_pick(
                raw, "date", "time", "timestamp", "datetime", "created",
                "date(utc)", "date utc", "create_time", "createtime",
            ),
            "wallet": wallet,
            "txid": txid,
        })
    if skipped_internal:
        notes.append(f"{source}: {skipped_internal} movimenti interni esclusi (INNER_ / internal transfer / CounterParty).")
    if skipped_fiat:
        notes.append(f"{source}: {skipped_fiat} movimenti fiat esclusi.")
    if skipped_trade:
        notes.append(f"{source}: {skipped_trade} operazioni di trading/convert escluse (non sono flussi wallet).")
    if skipped_status:
        notes.append(f"{source}: {skipped_status} transazioni annullate o fallite escluse.")
    if skipped_beacon:
        notes.append(f"{source}: {skipped_beacon} movimenti Binance Beacon (bnb) esclusi.")
    return rows


def _extract_ips_from_df(df: pd.DataFrame, kind: str = "unknown") -> list[str]:
    found: list[str] = []
    roles = _roles_map(df, kind)
    ip_cols = [c for c, r in roles.items() if r == "ip"]
    if ip_cols:
        scan_cols = ip_cols
    elif kind == "ip":
        scan_cols = list(df.columns)
    elif kind in ("profile", "tx", "tx_in", "tx_out"):
        return []
    else:
        scan_cols = list(df.columns)
    for col in scan_cols:
        for v in df[col].tolist():
            text = _cell(v)
            found.extend(IP_RE.findall(text))
            if ":" in text:
                found.extend(IPV6_RE.findall(text))
    return found


def _read_csv(path: Path) -> list[tuple[str | None, pd.DataFrame]]:
    for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            df = pd.read_csv(path, encoding=enc, sep=None, engine="python")
            return [(None, df)]
        except Exception:
            continue
    raise ValueError("Impossibile leggere il CSV (encoding/separatore non riconosciuto).")


def _frames_from_book(book: Any) -> list[tuple[str | None, pd.DataFrame]]:
    return [(str(name), df) for name, df in book.items() if isinstance(df, pd.DataFrame)]


def _read_excel(path: Path) -> list[tuple[str | None, pd.DataFrame]]:
    """Apre xlsx/xls, OLE2 non standard, HTML-as-xls (OKX) o CSV mascherato."""
    ext = path.suffix.lower()
    engines = ("openpyxl", "xlrd") if ext != ".xls" else ("xlrd", "openpyxl")
    for engine in engines:
        try:
            sheets = _frames_from_book(pd.read_excel(path, sheet_name=None, engine=engine))
            if sheets:
                return sheets
        except Exception:
            continue
    try:
        sheets = _frames_from_book(pd.read_excel(path, sheet_name=None))
        if sheets:
            return sheets
    except Exception:
        pass
    try:
        import olefile
        if olefile.isOleFile(str(path)):
            with olefile.OleFileIO(str(path)) as ole:
                for sname in ("Workbook", "Book"):
                    if not ole.exists(sname):
                        continue
                    buf = io.BytesIO(ole.openstream(sname).read())
                    try:
                        sheets = _frames_from_book(pd.read_excel(buf, sheet_name=None, engine="xlrd"))
                        if sheets:
                            return sheets
                    except Exception:
                        continue
    except Exception:
        pass
    for enc in ("utf-8", "utf-16", "latin-1", "cp1252"):
        try:
            tables = pd.read_html(path, encoding=enc)
        except Exception:
            continue
        sheets = [
            (f"Tabella {i + 1}", df)
            for i, df in enumerate(tables or [])
            if isinstance(df, pd.DataFrame) and not df.empty
        ]
        if sheets:
            return sheets
    try:
        return _read_csv(path)
    except Exception:
        pass
    raise ValueError("Impossibile leggere il file Excel (xlsx, xls, HTML-as-xls o CSV).")


def _read_pdf(path: Path, password: str | None = None) -> list[tuple[str | None, pd.DataFrame]]:
    tables: list[tuple[str | None, pd.DataFrame]] = []
    texts: list[str] = []
    open_kw = {"password": password} if password else {}
    with pdfplumber.open(path, **open_kw) as pdf:
        t_idx = 0
        for p_i, page in enumerate(pdf.pages, start=1):
            texts.append(page.extract_text() or "")
            for table in (page.extract_tables() or []):
                if not table or len(table) < 2:
                    continue
                header = table[0]
                if not any(h is not None and str(h).strip() for h in header):
                    continue
                df = pd.DataFrame(
                    table[1:],
                    columns=[str(h) if h is not None else f"Col_{i}" for i, h in enumerate(header)],
                )
                t_idx += 1
                tables.append((f"Pagina {p_i} — Tabella {t_idx}", df))
    blob = "\n".join(texts)
    if blob.strip():
        kv_rows = []
        for line in blob.splitlines():
            if ":" in line:
                k, _, v = line.partition(":")
                if k.strip() and v.strip():
                    kv_rows.append({"Campo": k.strip(), "Valore": v.strip()})
        extra_ips = IP_RE.findall(blob)
        if kv_rows:
            tables.append(("Testo PDF — campi", pd.DataFrame(kv_rows)))
        if extra_ips and not any(_extract_ips_from_df(df, "ip") for _, df in tables):
            tables.append(("Testo PDF — IP", pd.DataFrame({"IP": extra_ips})))
    if not tables:
        raise ValueError("Nessuna tabella o dato strutturato nel PDF. Le scansioni senza testo non sono supportate.")
    return tables


class FilePasswordError(Exception):
    def __init__(self, filename: str, *, wrong: bool = False):
        self.filename = filename
        self.wrong = wrong
        super().__init__("Password errata." if wrong else "File protetto da password.")


def _office_encrypted(path: Path) -> bool:
    try:
        import msoffcrypto
        with path.open("rb") as fh:
            office = msoffcrypto.OfficeFile(fh)
            return bool(office.is_encrypted())
    except Exception:
        return False


def _decrypt_office(src: Path, password: str, original_name: str) -> Path:
    import msoffcrypto
    try:
        from msoffcrypto.exceptions import DecryptionError, InvalidKeyError
    except Exception:
        InvalidKeyError = Exception  # type: ignore[misc, assignment]
        DecryptionError = Exception  # type: ignore[misc, assignment]
    fd, tmp = tempfile.mkstemp(suffix=src.suffix)
    os.close(fd)
    dest = Path(tmp)
    try:
        with src.open("rb") as fh:
            office = msoffcrypto.OfficeFile(fh)
            office.load_key(password=password)
            with dest.open("wb") as out:
                office.decrypt(out)
    except (InvalidKeyError, DecryptionError, ValueError):
        dest.unlink(missing_ok=True)
        raise FilePasswordError(original_name, wrong=True)
    except Exception as exc:
        dest.unlink(missing_ok=True)
        msg = str(exc).lower()
        if any(w in msg for w in ("password", "decrypt", "key", "invalid")):
            raise FilePasswordError(original_name, wrong=True) from exc
        raise
    return dest


def _pdf_encrypted(path: Path) -> bool:
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(path))
        return bool(getattr(reader, "is_encrypted", False))
    except Exception:
        return False


def _pdf_password_ok(path: Path, password: str) -> bool:
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(path))
        if not getattr(reader, "is_encrypted", False):
            return True
        return int(reader.decrypt(password or "") or 0) != 0
    except Exception:
        return False


def _parse_file(
    path: Path,
    original_name: str,
    password: str | None = None,
) -> list[tuple[str, pd.DataFrame]]:
    ext = Path(original_name).suffix.lower() or path.suffix.lower()
    extra: Path | None = None
    try:
        if ext == ".csv":
            parts = _read_csv(path)
        elif ext in (".xlsx", ".xls"):
            if _office_encrypted(path):
                if not password:
                    raise FilePasswordError(original_name)
                extra = _decrypt_office(path, password, original_name)
                path = extra
            parts = _read_excel(path)
        elif ext == ".pdf":
            if _pdf_encrypted(path):
                pw = password or ""
                if not _pdf_password_ok(path, pw):
                    raise FilePasswordError(original_name, wrong=bool(password))
                parts = _read_pdf(path, password=pw)
            else:
                parts = _read_pdf(path)
        else:
            raise ValueError(f"Formato non supportato: {ext}")
        out = []
        for sheet, df in parts:
            cleaned = _clean_columns(df)
            if not cleaned.empty:
                label = original_name if not sheet else f"{original_name} · {sheet}"
                out.append((label, cleaned))
        return out
    finally:
        if extra is not None and extra.exists():
            try:
                extra.unlink()
            except OSError:
                pass


def _fmt_money(n: float) -> str:
    if abs(n) >= 1000:
        return f"{n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{n:.8g}"


def _collect_from_frames(
    frames: list[tuple[str, pd.DataFrame]],
) -> tuple[dict[str, str], list[dict[str, Any]], list[str], list[str]]:
    profile: dict[str, str] = {}
    txs: list[dict[str, Any]] = []
    ips: list[str] = []
    warnings: list[str] = []
    tagged = [(label, df, _sheet_kind(label)) for label, df in frames]
    for label, df, kind in tagged:
        want_profile = kind in ("profile", "unknown")
        want_tx = kind in ("tx", "tx_in", "tx_out", "unknown")
        default_dir = "in" if kind == "tx_in" else "out" if kind == "tx_out" else None
        if want_profile:
            kv = _extract_profile_kv(df, loose=(kind == "profile"))
            if len(kv) >= 2 or (kind == "profile" and kv):
                profile.update(kv)
            else:
                profile.update(_extract_profile_cols(df, loose=(kind == "profile")))
        if want_tx:
            txs.extend(_extract_transactions(
                df, label, kind=kind, default_direction=default_dir, warnings=warnings,
            ))
        ips.extend(_extract_ips_from_df(df, kind))
    return profile, txs, ips, warnings


def _build_report(
    frames: list[tuple[str, pd.DataFrame]],
    file_name: str = "",
    ip_info: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    profile, txs, ips, parse_warnings = _collect_from_frames(frames)
    if ip_info is None:
        ip_info = _lookup_ips(ips)
    unique_ips = list(dict.fromkeys(ips))
    ip_rows = [ip_info.get(ip) or {
        "ip": ip, "kind": "sconosciuto", "reason": "—", "country": "—", "city": "—", "isp": "—", "org": "—",
        "lat": None, "lon": None, "source": "",
    } for ip in unique_ips]

    in_txs = [t for t in txs if t["direction"] == "in"]
    out_txs = [t for t in txs if t["direction"] == "out"]
    in_by_asset: dict[str, float] = defaultdict(float)
    out_by_asset: dict[str, float] = defaultdict(float)
    for t in in_txs:
        in_by_asset[t["asset"] or "—"] += t["amount"]
    for t in out_txs:
        out_by_asset[t["asset"] or "—"] += t["amount"]

    kind_counts = Counter(r["kind"] for r in ip_rows)
    country_counts = Counter(r["country"] for r in ip_rows if r["country"] not in ("", "—"))

    bullets = []
    if len(frames) > 1:
        kinds_it = {"profile": "profilo", "tx": "transazioni", "tx_in": "entrate", "tx_out": "uscite", "ip": "IP/accessi", "unknown": "altro"}
        labeled = []
        for label, _ in frames:
            title = _sheet_title(label)
            kind = _sheet_kind(label)
            tagged = kinds_it.get(kind, kind)
            labeled.append(f"{title} ({tagged})" if title else tagged)
        bullets.append("Fogli letti: " + ", ".join(labeled[:16]) + ("…" if len(labeled) > 16 else "") + ".")
    if profile:
        who = profile.get("Nome") or profile.get("Utente") or profile.get("Email") or profile.get("Account")
        bullets.append(f"Profilo rilevato{': ' + who if who else ''} con {len(profile)} campi.")
    else:
        bullets.append("Nessun profilo utente strutturato trovato in questo file.")
    if txs:
        bullets.append(
            f"{len(txs)} transazioni: {len(in_txs)} in entrata e {len(out_txs)} in uscita."
        )
        if in_by_asset:
            top = max(in_by_asset.items(), key=lambda x: x[1])
            bullets.append(f"Entrata principale: {_fmt_money(top[1])} {top[0]}.")
        if out_by_asset:
            top = max(out_by_asset.items(), key=lambda x: x[1])
            bullets.append(f"Uscita principale: {_fmt_money(top[1])} {top[0]}.")
    else:
        bullets.append("Nessuna transazione wallet riconosciuta.")
    if unique_ips:
        vpn_n = kind_counts.get("vpn", 0)
        host_n = kind_counts.get("hosting", 0)
        if vpn_n:
            bullets.append(f"{vpn_n} indirizzi IP risultano di VPN/proxy.")
        elif host_n:
            bullets.append(f"Nessuna VPN evidente; {host_n} IP di hosting/datacenter.")
        else:
            bullets.append(f"{len(unique_ips)} IP di accesso, senza indicazioni VPN.")
    else:
        bullets.append("Nessun indirizzo IP di log trovato.")

    charts = []
    if txs:
        flow = [("Entrata", len(in_txs)), ("Uscita", len(out_txs))]
        flow = [(lab, val) for lab, val in flow if val]
        if flow:
            charts.append({
                "type": "pie",
                "title": "Flussi in / out",
                "labels": [lab for lab, _ in flow],
                "values": [val for _, val in flow],
            })
        assets = sorted(set(in_by_asset) | set(out_by_asset))
        if assets:
            charts.append({
                "type": "bar",
                "title": "Volumi per asset (entrata)",
                "labels": assets[:12],
                "values": [round(in_by_asset[a], 8) for a in assets[:12]],
            })
            charts.append({
                "type": "bar",
                "title": "Volumi per asset (uscita)",
                "labels": assets[:12],
                "values": [round(out_by_asset[a], 8) for a in assets[:12]],
            })
        by_day = Counter()
        for t in txs:
            day = (t.get("when") or "")[:10]
            if day:
                by_day[day] += 1
        if by_day:
            days = sorted(by_day)[-20:]
            charts.append({
                "type": "line",
                "title": "Transazioni nel tempo",
                "labels": days,
                "values": [by_day[d] for d in days],
            })
    if ip_rows:
        ip_pie = [
            ("VPN", kind_counts.get("vpn", 0)),
            ("Hosting", kind_counts.get("hosting", 0)),
            ("Residenziale", kind_counts.get("residenziale", 0)),
            ("Privato", kind_counts.get("privato", 0)),
            ("Sconosciuto", kind_counts.get("sconosciuto", 0)),
        ]
        ip_pie = [(lab, val) for lab, val in ip_pie if val]
        if ip_pie:
            charts.append({
                "type": "pie",
                "title": "IP: VPN / hosting / altro",
                "labels": [lab for lab, _ in ip_pie],
                "values": [val for _, val in ip_pie],
            })
        if country_counts:
            topc = country_counts.most_common(8)
            charts.append({
                "type": "bar",
                "title": "IP per paese",
                "labels": [c for c, _ in topc],
                "values": [n for _, n in topc],
            })

    kpis = [
        {"label": "Fogli", "value": str(len(frames))},
        {"label": "Transazioni", "value": str(len(txs))},
        {"label": "In entrata", "value": str(len(in_txs))},
        {"label": "In uscita", "value": str(len(out_txs))},
        {"label": "IP unici", "value": str(len(unique_ips))},
        {"label": "IP VPN", "value": str(kind_counts.get("vpn", 0))},
    ]

    title = f"Riassunto — {file_name}" if file_name else "Riassunto operativo"
    return {
        "headline": title,
        "bullets": bullets,
        "kpis": kpis,
        "profile": [{"label": k, "value": v} for k, v in profile.items()],
        "transactions": {
            "count": len(txs),
            "in_count": len(in_txs),
            "out_count": len(out_txs),
            "in_total": {k: round(v, 8) for k, v in in_by_asset.items()},
            "out_total": {k: round(v, 8) for k, v in out_by_asset.items()},
            "sample": txs[:60],
        },
        "ips": {
            "unique": len(unique_ips),
            "vpn": kind_counts.get("vpn", 0),
            "hosting": kind_counts.get("hosting", 0),
            "residential": kind_counts.get("residenziale", 0),
            "private": kind_counts.get("privato", 0),
            "provider": " + ".join(dict.fromkeys(
                part
                for r in ip_rows
                for part in str(r.get("source") or "").split(" + ")
                if part.strip()
            )),
            "rows": ip_rows[:80],
        },
        "charts": charts,
        "warnings": parse_warnings,
    }


AUTH_VERIFY_URL = os.environ.get("AUTH_VERIFY_URL", "http://auth:4000/api/auth/verify")


def require_user(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Non autenticato.")
    req = urllib.request.Request(
        AUTH_VERIFY_URL,
        headers={"Authorization": authorization},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=6) as resp:
            user = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError:
        raise HTTPException(status_code=401, detail="Sessione non valida.")
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError, ValueError):
        raise HTTPException(status_code=503, detail="Servizio di autenticazione non disponibile.")
    if not isinstance(user, dict):
        raise HTTPException(status_code=401, detail="Sessione non valida.")
    role = user.get("role")
    cards = user.get("cards") or []
    if role != "superadmin" and "analisi-report" not in cards:
        raise HTTPException(status_code=403, detail="Strumento non assegnato al tuo profilo.")
    return user


@app.get("/api/analisi/health")
def health():
    return {"ok": True, "ip_intel": _intel_configured()}


@app.post("/api/analisi/analyze")
async def analyze(
    files: list[UploadFile] = File(...),
    file_passwords: str | None = Form(default=None),
    _user: dict[str, Any] = Depends(require_user),
):
    if not files:
        raise HTTPException(status_code=400, detail="Nessun file caricato.")

    passwords_payload: Any = {}
    if file_passwords:
        try:
            passwords_payload = json.loads(file_passwords)
        except json.JSONDecodeError:
            passwords_payload = {}

    def _pw_for(name: str, index: int) -> str | None:
        if isinstance(passwords_payload, list):
            if 0 <= index < len(passwords_payload):
                val = str(passwords_payload[index] or "").strip()
                return val or None
        if isinstance(passwords_payload, dict):
            val = str(passwords_payload.get(name) or passwords_payload.get(str(index)) or "").strip()
            return val or None
        return None

    file_frames: list[tuple[str, list[tuple[str, pd.DataFrame]]]] = []
    errors: list[dict[str, str]] = []
    need_password: list[str] = []

    for index, upload in enumerate(files):
        name = upload.filename or "file"
        ext = Path(name).suffix.lower()
        if ext not in ALLOWED_EXT:
            errors.append({"file": name, "error": f"Estensione non supportata ({ext})."})
            continue
        data = await upload.read()
        if len(data) > MAX_BYTES:
            errors.append({"file": name, "error": "File troppo grande (max 25 MB)."})
            continue
        if not data:
            errors.append({"file": name, "error": "File vuoto."})
            continue
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
                tmp.write(data)
                tmp_path = Path(tmp.name)
            parts = _parse_file(tmp_path, name, password=_pw_for(name, index))
            if not parts:
                errors.append({"file": name, "error": "Nessun dato leggibile."})
            else:
                file_frames.append((name, parts))
        except FilePasswordError as exc:
            if exc.wrong:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "code": "wrong_password",
                        "file": exc.filename,
                        "message": "Password errata.",
                    },
                )
            if exc.filename not in need_password:
                need_password.append(exc.filename)
        except Exception as e:
            errors.append({"file": name, "error": str(e)})
        finally:
            if tmp_path and tmp_path.exists():
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

    if need_password:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "password_required",
                "files": need_password,
                "message": "Uno o più file sono protetti da password.",
            },
        )

    if not file_frames:
        raise HTTPException(
            status_code=400,
            detail={"message": "Nessun dato leggibile nei file.", "errors": errors},
        )

    all_ips: list[str] = []
    for _, parts in file_frames:
        for _, df in parts:
            all_ips.extend(_extract_ips_from_df(df))
    ip_info = _lookup_ips(all_ips)

    per_file = []
    sheet_total = 0
    for name, parts in file_frames:
        sheet_total += len(parts)
        per_file.append({
            "name": name,
            "sheets": len(parts),
            "report": _build_report(parts, file_name=name, ip_info=ip_info),
        })

    return {
        "files": per_file,
        "errors": errors,
        "sheets": sheet_total,
        "file_count": len(per_file),
    }
