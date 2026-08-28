"""Xpublicator — derivazione xpub per il portale."""
from __future__ import annotations

import csv
import io
import json
import os
import re
import threading
import time
import urllib.error
import urllib.request
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

import xpublicator as xp

app = FastAPI(title="Xpublicator", version=xp.VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

AUTH_VERIFY_URL = os.environ.get("AUTH_VERIFY_URL", "http://auth:4000/api/auth/verify")
ADDR_TYPES = ["p2pkh", "p2sh", "p2wpkh", "eth"]
MAX_XPUBS = 8
MAX_FIND = 40
MAX_NODES = 4000
MAX_INDEX = 2000
RUN_TIMEOUT_SEC = 90
PATH_RE = re.compile(r"^x(?:/[0-9]+(?:-[0-9]+)?(?:,[0-9]+(?:-[0-9]+)?)*)*$")
XPUB_RE = re.compile(r"^[xyzXYZ]pub[1-9A-HJ-NP-Za-km-z]{80,140}$")

_user_locks: dict[str, threading.Lock] = {}
_user_locks_guard = threading.Lock()
_global_sem = threading.Semaphore(2)


class RunRequest(BaseModel):
    xpubs: list[str] = Field(default_factory=list)
    path: str = "x/0-10/0-20"
    addrtypes: list[str] = Field(default_factory=lambda: ADDR_TYPES.copy())
    alladdresses: bool = False
    noethchecksum: bool = False
    find: list[str] = Field(default_factory=list)
    convert: bool = False
    info: bool = False


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
    if role != "superadmin" and "xpublicator" not in cards:
        raise HTTPException(status_code=403, detail="Strumento non assegnato al tuo profilo.")
    return user


def _clean_xpubs(raw: list[str]) -> list[str]:
    out: list[str] = []
    for item in raw:
        for part in str(item or "").replace(",", " ").split():
            key = part.strip()
            if not key:
                continue
            if not XPUB_RE.match(key):
                raise HTTPException(status_code=400, detail="Chiave estesa non valida (attesi xpub/ypub/zpub).")
            if key not in out:
                out.append(key)
    if not out:
        raise HTTPException(status_code=400, detail="Inserisci almeno una chiave xpub/ypub/zpub.")
    if len(out) > MAX_XPUBS:
        raise HTTPException(status_code=400, detail=f"Massimo {MAX_XPUBS} chiavi per richiesta.")
    return out


def _clean_types(raw: list[str]) -> list[str]:
    types = [t for t in raw if t in ADDR_TYPES]
    if not types:
        raise HTTPException(status_code=400, detail="Seleziona almeno un tipo di indirizzo.")
    return types


def _count_nodes(path: str) -> int:
    tree = xp.get_path(path)
    n = 1
    for level in tree:
        if not level:
            continue
        if max(level) > MAX_INDEX:
            raise HTTPException(
                status_code=400,
                detail=f"Indice di derivazione troppo alto (max {MAX_INDEX}).",
            )
        n *= len(level)
        if n > MAX_NODES:
            raise HTTPException(
                status_code=400,
                detail=f"Il path produce troppi indirizzi (max {MAX_NODES}). Riduci gli intervalli.",
            )
    return n


def _xpub_info(xpub: str) -> dict[str, Any]:
    decoded, valid = xp.decode_xpub(xpub)
    return {
        "xpub": xpub,
        "valid": bool(valid),
        "checksum": decoded["checksum"].hex(),
        "calc_checksum": decoded["calc_checksum"].hex(),
        "depth": int(decoded["level"]),
        "parent_fingerprint": decoded["parentfingerprint"].hex(),
        "child_number": decoded["childnumber"].hex(),
        "chain_code": decoded["chaincode"].hex(),
        "pubkey": decoded["pubkey"].hex(),
    }


def _rows_from_tree(xpub: str, tree: dict[str, dict[str, str]]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for path, addrs in tree.items():
        for kind, addr in addrs.items():
            rows.append({"xpub": xpub, "path": path, "type": kind, "address": addr})
    return rows


def _csv_text(rows: list[dict[str, str]]) -> str:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=["xpub", "path", "type", "address"])
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    return buf.getvalue()


@app.get("/api/xpublicator/health")
def health():
    return {"ok": True, "engine": f"xpublicator-{xp.VERSION}", "library": xp.ECLIB}


@app.post("/api/xpublicator/run")
def run(body: RunRequest, user: dict[str, Any] = Depends(require_user)):
    xpubs = _clean_xpubs(body.xpubs)
    user_id = str(user.get("id") or user.get("email") or "anon")
    lock = _lock_for(user_id)
    if not lock.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="Hai già un'operazione in corso. Attendi il termine.")
    if not _global_sem.acquire(blocking=False):
        lock.release()
        raise HTTPException(status_code=429, detail="Il servizio è occupato. Riprova tra poco.")

    started = time.perf_counter()
    try:
        if body.info:
            infos = []
            for xpub in xpubs:
                try:
                    infos.append(_xpub_info(xpub))
                except AssertionError as exc:
                    raise HTTPException(status_code=400, detail=str(exc)) from exc
            return JSONResponse({"ok": True, "mode": "info", "info": infos, "library": xp.ECLIB})

        if body.convert:
            converted = []
            for xpub in xpubs:
                try:
                    converted.append({"xpub": xpub, "formats": xp.convert_xpub(xpub)})
                except Exception as exc:
                    raise HTTPException(status_code=400, detail=f"Conversione non riuscita: {exc}") from exc
            return JSONResponse({"ok": True, "mode": "convert", "converted": converted, "library": xp.ECLIB})

        path = (body.path or "x/0-10/0-20").strip()
        if not PATH_RE.match(path):
            raise HTTPException(
                status_code=400,
                detail="Path non valido. Usa ad esempio x/0-10/0-20 (senza indici hardeniti).",
            )
        addrtypes = _clean_types(body.addrtypes)
        find = [a.strip() for a in body.find if str(a).strip()]
        if len(find) > MAX_FIND:
            raise HTTPException(status_code=400, detail=f"Massimo {MAX_FIND} indirizzi da cercare.")
        nodes = _count_nodes(path)

        rows: list[dict[str, str]] = []
        for xpub in xpubs:
            try:
                tree = xp.xpub_to_address(xpub, [path], addrtypes, body.alladdresses, body.noethchecksum)
            except AssertionError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"Derivazione non riuscita: {exc}") from exc
            rows.extend(_rows_from_tree(xpub, tree))
            if time.perf_counter() - started > RUN_TIMEOUT_SEC:
                raise HTTPException(status_code=504, detail="Operazione troppo lunga, riduci il path.")

        matches = [r for r in rows if r["address"] in find] if find else []
        payload: dict[str, Any] = {
            "ok": True,
            "mode": "find" if find else "derive",
            "library": xp.ECLIB,
            "path": path,
            "nodes": nodes,
            "seconds": round(time.perf_counter() - started, 2),
            "rows": matches if find else rows,
            "csv": _csv_text(matches if find else rows),
        }
        if find:
            payload["searched"] = find
            payload["found"] = len(matches)
        return JSONResponse(payload)
    finally:
        _global_sem.release()
        lock.release()
