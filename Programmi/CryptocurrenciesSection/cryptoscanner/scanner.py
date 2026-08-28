"""CryptoScanner 1.7.2-compatible engine (plaintext + pdf/docx/xlsx, no Java/Tika)."""
from __future__ import annotations

import binascii
import hashlib
import re
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

from mnemonic import Mnemonic
from pypdf import PdfReader

B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
XRP58 = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz"
HERE = Path(__file__).resolve().parent

SKIP_EXT = {
    ".zip", ".rar", ".7z", ".gz", ".bz2", ".xz", ".tar", ".tgz", ".iso",
    ".e01", ".ex01", ".l01", ".dd", ".raw", ".img", ".vmdk", ".vhd", ".vhdx",
    ".mp4", ".avi", ".mkv", ".mov", ".wmv", ".mp3", ".wav", ".flac",
    ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tif", ".tiff", ".heic",
    ".exe", ".dll", ".so", ".dylib", ".bin", ".sys",
}
MAX_FILE_BYTES = 25 * 1024 * 1024
MAX_TEXT_CHARS = 8_000_000

ADDRESS_SPECS = [
    ("Bitcoin P2PKH / Bitcoin cash / Bech32", re.compile(rb"1[a-km-zA-HJ-NP-Z1-9]{25,34}"), "b58", 25),
    ("Bitcoin P2SH / Bitcoin cash / Bech32", re.compile(rb"3[a-km-zA-HJ-NP-Z1-9]{25,34}"), "b58", 25),
    ("BIP38 Encrypted Private Key", re.compile(rb"6P[a-km-zA-HJ-NP-Z1-9]{56}"), "b58", 39),
    ("WIF Private key, uncompressed public keys", re.compile(rb"5[a-km-zA-HJ-NP-Z1-9]{50}"), "b58", 37),
    ("WIF Private key, compressed public keys", re.compile(rb"[KL][a-km-zA-HJ-NP-Z1-9]{51}"), "b58", 38),
    ("BIP32 HD wallet private node", re.compile(rb"xprv[a-km-zA-HJ-NP-Z1-9]{107,108}"), "b58", 82),
    ("BIP32 HD wallet public node", re.compile(rb"xpub[a-km-zA-HJ-NP-Z1-9]{107,108}"), "b58", 82),
    ("Bech32", re.compile(rb"bc1[a-z0-9]{25,62}"), "bech32", 0),
    ("Dash", re.compile(rb"X[1-9A-HJ-NP-Za-km-z]{33}"), "b58", 25),
    ("Dogecoin", re.compile(rb"D[5-9A-HJ-NP-U][1-9A-HJ-NP-Za-km-z]{32}"), "b58", 25),
    ("Ethereum", re.compile(rb"(?<![a-fA-F0-9])0x[a-fA-F0-9]{40}(?![a-fA-F0-9])"), "eth", 0),
    ("XRP", re.compile(rb"r[0-9a-zA-Z]{24,34}"), "xrp", 0),
    ("Monero address", re.compile(rb"4[0-9AB][123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{93}"), "xmr", 0),
]
TX_BTC_RE = re.compile(rb"(?<![a-fA-F0-9])[a-fA-F0-9]{64}(?![a-fA-F0-9])")
TX_ETH_RE = re.compile(rb"(?<![a-fA-F0-9])0x[A-Fa-f0-9]{64}(?![a-fA-F0-9])")
WORD_RE = re.compile(rb"[A-Za-z]+")

_BIP39: list[str] | None = None
_MONERO: list[str] | None = None
_BIP39_SET: set[str] | None = None
_MONERO_SET: set[str] | None = None
_MNEMONIC = Mnemonic("english")


def _load_dicts() -> None:
    global _BIP39, _MONERO, _BIP39_SET, _MONERO_SET
    if _BIP39 is not None:
        return
    _BIP39 = (HERE / "seeddicts" / "seed_dict_eng").read_text(encoding="utf-8").splitlines()
    _MONERO = (HERE / "seeddicts" / "seed_dict_eng_monero").read_text(encoding="utf-8").splitlines()
    _BIP39_SET = {w.strip().lower() for w in _BIP39 if w.strip()}
    _MONERO_SET = {w.strip().lower() for w in _MONERO if w.strip()}


def _b58decode(value: str, alphabet: str = B58) -> bytes:
    n = 0
    for ch in value:
        idx = alphabet.find(ch)
        if idx < 0:
            raise ValueError("invalid base58")
        n = n * 58 + idx
    pad = 0
    for ch in value:
        if ch != alphabet[0]:
            break
        pad += 1
    raw = n.to_bytes((n.bit_length() + 7) // 8, "big") if n else b""
    return b"\x00" * pad + raw


def check_base58check(value: str, alphabet: str = B58) -> bool:
    try:
        raw = _b58decode(value, alphabet)
    except (ValueError, OverflowError):
        return False
    if len(raw) < 5:
        return False
    payload, checksum = raw[:-4], raw[-4:]
    return hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4] == checksum


def _bech32_polymod(values: list[int]) -> int:
    gen = [0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3]
    chk = 1
    for v in values:
        b = chk >> 25
        chk = ((chk & 0x1FFFFFF) << 5) ^ v
        for i in range(5):
            if (b >> i) & 1:
                chk ^= gen[i]
    return chk


def check_bech32(addr: str) -> bool:
    s = addr.lower()
    if not s.startswith("bc1") or not (26 <= len(s) <= 90):
        return False
    charset = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
    try:
        data = [charset.index(c) for c in s[3:]]
    except ValueError:
        return False
    hrp = [ord(x) >> 5 for x in "bc"] + [0] + [ord(x) & 31 for x in "bc"]
    return _bech32_polymod(hrp + data) == 1


def check_eth_address(addr: str) -> bool:
    if not re.fullmatch(r"0x[a-fA-F0-9]{40}", addr):
        return False
    body = addr[2:]
    if body == body.lower() or body == body.upper():
        return True
    from Crypto.Hash import keccak
    digest = keccak.new(digest_bits=256).update(body.lower().encode("ascii")).hexdigest()
    out = []
    for i, ch in enumerate(body):
        if ch.isalpha():
            out.append(ch.upper() if int(digest[i], 16) >= 8 else ch.lower())
        else:
            out.append(ch)
    return addr == "0x" + "".join(out)


def check_xmr_address(addr: str) -> bool:
    try:
        raw = _b58decode(addr, B58)
    except (ValueError, OverflowError):
        return False
    return len(raw) in (69, 77)


def validate_match(kind: str, value: str) -> bool:
    if kind == "b58":
        return check_base58check(value)
    if kind == "xrp":
        return check_base58check(value, XRP58)
    if kind == "bech32":
        return check_bech32(value)
    if kind == "eth":
        return check_eth_address(value)
    if kind == "xmr":
        return check_xmr_address(value)
    if kind == "payid":
        return len(value) == 64 and re.fullmatch(r"[0-9a-fA-F]{64}", value) is not None
    return False


def _monero_checksum_ok(words: list[str]) -> bool:
    if len(words) not in (13, 25):
        return False
    prefix_n = 12 if len(words) == 13 else 24
    trimmed = "".join(w[:3] for w in words[:prefix_n])
    idx = binascii.crc32(trimmed.encode("utf-8")) % prefix_n
    return words[prefix_n] == words[idx]


def extract_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        reader = PdfReader(str(path))
        parts = [(page.extract_text() or "") for page in reader.pages[:80]]
        return "\n".join(parts)[:MAX_TEXT_CHARS]
    if suffix == ".docx":
        with zipfile.ZipFile(path) as zf:
            xml = zf.read("word/document.xml")
        root = ET.fromstring(xml)
        texts = [n.text or "" for n in root.iter() if n.text]
        return " ".join(texts)[:MAX_TEXT_CHARS]
    if suffix in {".xlsx", ".xlsm"}:
        with zipfile.ZipFile(path) as zf:
            chunks = []
            for name in zf.namelist():
                if name.startswith("xl/") and name.endswith(".xml"):
                    root = ET.fromstring(zf.read(name))
                    chunks.extend(n.text or "" for n in root.iter() if n.text)
        return " ".join(chunks)[:MAX_TEXT_CHARS]
    data = path.read_bytes()[:MAX_FILE_BYTES]
    for enc in ("utf-8", "utf-16", "latin-1"):
        try:
            return data.decode(enc)[:MAX_TEXT_CHARS]
        except UnicodeDecodeError:
            continue
    return data.decode("latin-1", errors="replace")[:MAX_TEXT_CHARS]


@dataclass
class Hit:
    file: str
    offset: int
    type: str
    value: str


@dataclass
class ScanResult:
    files_examined: int = 0
    bytes_examined: int = 0
    addresses: list[Hit] = field(default_factory=list)
    seeds: list[Hit] = field(default_factory=list)
    transactions: list[Hit] = field(default_factory=list)
    skipped: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _scan_bytes(blob: bytes, rel: str, find_seeds: bool, find_tx: bool, out: ScanResult) -> None:
    seen_addr: set[tuple[str, str, int]] = set()
    for label, cre, kind, _bl in ADDRESS_SPECS:
        for m in cre.finditer(blob):
            value = m.group().decode("ascii", errors="ignore")
            if not validate_match(kind, value):
                continue
            key = (rel, value, m.start())
            if key in seen_addr:
                continue
            seen_addr.add(key)
            out.addresses.append(Hit(rel, m.start(), label, value))

    if find_tx:
        seen_tx: set[tuple[str, str]] = set()
        for m in TX_ETH_RE.finditer(blob):
            value = m.group().decode("ascii")
            key = (rel, value.lower())
            if key in seen_tx:
                continue
            seen_tx.add(key)
            out.transactions.append(Hit(rel, m.start(), "Transaction Hash ETH", value))
        for m in TX_BTC_RE.finditer(blob):
            value = m.group().decode("ascii")
            if value.lower() in {h.value.lower()[2:] if h.value.lower().startswith("0x") else h.value.lower() for h in out.transactions}:
                continue
            if any(h.value.lower() == value.lower() and h.type.startswith("Monero") for h in out.addresses):
                continue
            key = (rel, value.lower())
            if key in seen_tx:
                continue
            seen_tx.add(key)
            out.transactions.append(Hit(rel, m.start(), "Transaction Hash BTC", value))

    if find_seeds:
        _scan_seeds(blob, rel, out)


def _scan_seeds(blob: bytes, rel: str, out: ScanResult) -> None:
    _load_dicts()
    assert _BIP39_SET and _MONERO_SET
    words: list[tuple[str, int]] = []
    for m in WORD_RE.finditer(blob):
        w = m.group().decode("ascii").lower()
        if w in _BIP39_SET or w in _MONERO_SET:
            words.append((w, m.start()))

    def add_seed(kind: str, window: list[tuple[str, int]]) -> None:
        phrase = " ".join(w for w, _ in window)
        out.seeds.append(Hit(rel, window[0][1], kind, phrase))

    for n in (12, 15, 18, 21, 24):
        for i in range(0, max(0, len(words) - n + 1)):
            window = words[i:i + n]
            token = [w for w, _ in window]
            if any(w not in _BIP39_SET for w in token):
                continue
            if _MNEMONIC.check(" ".join(token)):
                add_seed("BIP39", window)

    for n in (13, 25):
        for i in range(0, max(0, len(words) - n + 1)):
            window = words[i:i + n]
            token = [w for w, _ in window]
            if any(w not in _MONERO_SET for w in token):
                continue
            if _monero_checksum_ok(token):
                add_seed("MONERO", window)


def scan_folder(root: Path, find_seeds: bool = True, find_tx: bool = True) -> ScanResult:
    _load_dicts()
    out = ScanResult()
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        rel = str(path.relative_to(root)).replace("\\", "/")
        ext = path.suffix.lower()
        size = path.stat().st_size
        if ext in SKIP_EXT:
            out.skipped.append({"file": rel, "reason": "archivio o media non letti (limite CryptoScanner)"})
            continue
        if size > MAX_FILE_BYTES:
            out.skipped.append({"file": rel, "reason": f"file oltre {MAX_FILE_BYTES // (1024 * 1024)} MB, saltato"})
            continue
        if size < 8:
            continue
        try:
            text = extract_text(path)
            blob = text.encode("utf-8", errors="replace")
        except Exception as exc:
            out.skipped.append({"file": rel, "reason": f"lettura fallita: {exc}"})
            continue
        out.files_examined += 1
        out.bytes_examined += len(blob)
        _scan_bytes(blob, rel, find_seeds, find_tx, out)
    return out
