"""CryptoScanner — servizio LAN autenticato per il portale."""
from __future__ import annotations

import csv
import io
import json
import os
import re
import shutil
import tempfile
import threading
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from scanner import scan_folder

app = FastAPI(title="CryptoScanner", version="1.7.2-lan")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

AUTH_VERIFY_URL = os.environ.get("AUTH_VERIFY_URL", "http://auth:4000/api/auth/verify")
MAX_UPLOAD_BYTES = 80 * 1024 * 1024
MAX_FILES = 80
MAX_ZIP_ENTRIES = 200
MAX_UNCOMPRESSED = 150 * 1024 * 1024
SCAN_TIMEOUT_SEC = 180
SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")

_user_locks: dict[str, threading.Lock] = {}
_user_locks_guard = threading.Lock()
_global_sem = threading.Semaphore(2)


def _lock_for(user_id: str) -> threading.Lock:
    with _user_locks_guard:
        lock = _user_locks.get(user_id)
        if lock is None:
            lock = threading.Lock()
            _user_locks[user_id] = lock
        return lock


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
    if role != "superadmin" and "cryptoscanner" not in cards:
        raise HTTPException(status_code=403, detail="Strumento non assegnato al tuo profilo.")
    return user


def _safe_filename(name: str) -> str:
    base = Path(name or "file").name
    cleaned = SAFE_NAME.sub("_", base).strip("._") or "file"
    return cleaned[:120]


def _extract_zip(src: Path, dest: Path) -> None:
    uncompressed = 0
    with zipfile.ZipFile(src) as zf:
        infos = zf.infolist()
        if len(infos) > MAX_ZIP_ENTRIES:
            raise HTTPException(status_code=400, detail="Lo ZIP contiene troppi file.")
        for info in infos:
            if info.is_dir():
                continue
            name = info.filename.replace("\\", "/")
            if name.startswith("/") or ".." in Path(name).parts:
                raise HTTPException(status_code=400, detail="ZIP non valido (percorso non consentito).")
            uncompressed += info.file_size
            if uncompressed > MAX_UNCOMPRESSED:
                raise HTTPException(status_code=400, detail="ZIP troppo grande una volta estratto.")
            target = dest / Path(name).name
            with zf.open(info, "r") as src_f, open(target, "wb") as out_f:
                shutil.copyfileobj(src_f, out_f, 1024 * 1024)


def _hits_to_dicts(result: ScanResult) -> dict[str, Any]:
    def rows(items):
        return [{"file": h.file, "offset": h.offset, "type": h.type, "value": h.value} for h in items]

    return {
        "addresses": rows(result.addresses),
        "seeds": rows(result.seeds),
        "transactions": rows(result.transactions),
        "skipped": result.skipped,
        "warnings": result.warnings + [
            "I file compressi e i media non vengono letti.",
            "I file oltre 25 MB (es. immagini forensi) vengono saltati: estrai prima i file utili.",
            "Hash di transazione e payment ID possono produrre falsi positivi.",
        ],
        "stats": {
            "files_examined": result.files_examined,
            "bytes_examined": result.bytes_examined,
            "matches": len(result.addresses),
            "seeds": len(result.seeds),
            "transactions": len(result.transactions),
        },
    }


def _csv_text(rows: list[dict[str, Any]], headers: list[str]) -> str:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=headers, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    return buf.getvalue()


@app.get("/api/cryptoscanner/health")
def health():
    return {"ok": True, "engine": "cryptoscanner-1.7.2-lan"}


@app.post("/api/cryptoscanner/scan")
async def scan(
    files: list[UploadFile] = File(...),
    find_seeds: str | None = Form(default="1"),
    find_tx: str | None = Form(default="1"),
    user: dict[str, Any] = Depends(require_user),
):
    if not files:
        raise HTTPException(status_code=400, detail="Nessun file caricato.")
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Massimo {MAX_FILES} file per scansione.")

    user_id = str(user.get("id") or user.get("email") or "anon")
    want_seeds = str(find_seeds or "1") not in {"0", "false", "False"}
    want_tx = str(find_tx or "1") not in {"0", "false", "False"}
    lock = _lock_for(user_id)
    if not lock.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="Hai già una scansione in corso. Attendi il termine.")
    if not _global_sem.acquire(blocking=False):
        lock.release()
        raise HTTPException(status_code=429, detail="Il servizio è occupato. Riprova tra poco.")

    tmp = Path(tempfile.mkdtemp(prefix=f"cs-{user_id[:12]}-"))
    started = time.perf_counter()
    try:
        total = 0
        saved = 0
        for item in files:
            raw = await item.read()
            total += len(raw)
            if total > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=400, detail="Caricamento oltre 80 MB.")
            name = _safe_filename(item.filename or "upload.bin")
            dest = tmp / f"{saved:03d}_{name}"
            dest.write_bytes(raw)
            saved += 1
            if dest.suffix.lower() == ".zip":
                extracted = tmp / f"unzip_{saved}"
                extracted.mkdir(parents=True, exist_ok=True)
                _extract_zip(dest, extracted)
                dest.unlink(missing_ok=True)

        t0 = time.perf_counter()
        result = scan_folder(tmp, find_seeds=want_seeds, find_tx=want_tx)
        elapsed = time.perf_counter() - t0
        if elapsed > SCAN_TIMEOUT_SEC:
            raise HTTPException(status_code=504, detail="Scansione troppo lunga, riduci i file.")
        payload = _hits_to_dicts(result)
        payload["ok"] = True
        payload["stats"]["seconds"] = round(elapsed, 2)
        payload["csv"] = {
            "addresses": _csv_text(payload["addresses"], ["file", "offset", "type", "value"]),
            "seeds": _csv_text(payload["seeds"], ["file", "offset", "type", "value"]),
            "transactions": _csv_text(payload["transactions"], ["file", "offset", "type", "value"]),
        }
        payload["job"] = str(uuid4())
        return JSONResponse(payload)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
        _global_sem.release()
        lock.release()
        _ = started
