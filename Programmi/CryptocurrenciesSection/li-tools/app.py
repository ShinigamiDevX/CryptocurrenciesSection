"""LI Tools — wrapper autenticato per etsi_li_parser e pcap_to_hi3_converter."""
from __future__ import annotations

import base64
import io
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import zipfile
from pathlib import Path
from typing import Any
from uuid import uuid4

import urllib.error
import urllib.request

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI(title="LI Tools", version="1.0.0-lan")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

AUTH_VERIFY_URL = os.environ.get("AUTH_VERIFY_URL", "http://auth:4000/api/auth/verify")
MAX_UPLOAD_BYTES = 200 * 1024 * 1024
JOB_TIMEOUT_SEC = 300
SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")
PARSER_FORMATS = {"binary", "text", "json", "xml"}

_user_locks: dict[str, threading.Lock] = {}
_user_locks_guard = threading.Lock()
_global_sem = threading.Semaphore(1)


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
    if role != "superadmin" and "li-tools" not in cards:
        raise HTTPException(status_code=403, detail="Strumento non assegnato al tuo profilo.")
    return user


def _safe_filename(name: str) -> str:
    base = Path(name or "file").name
    cleaned = SAFE_NAME.sub("_", base).strip("._") or "file"
    return cleaned[:120]


def _run(cmd: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            cmd,
            cwd=str(cwd) if cwd else None,
            capture_output=True,
            text=True,
            timeout=JOB_TIMEOUT_SEC,
            check=False,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Operazione troppo lunga. Riduci i file o riprova.")
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Motore LI Tools non disponibile nel container.")


def _zip_directory(folder: Path) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(folder.rglob("*")):
            if path.is_file():
                zf.write(path, arcname=str(path.relative_to(folder)))
    return buf.getvalue()


def _list_outputs(folder: Path) -> list[dict[str, Any]]:
    out = []
    for path in sorted(folder.rglob("*")):
        if path.is_file():
            out.append({
                "name": str(path.relative_to(folder)).replace("\\", "/"),
                "size": path.stat().st_size,
            })
    return out


@app.get("/api/li-tools/health")
def health():
    parser = shutil.which("etsi_li_parser")
    converter = shutil.which("pcap_to_hi3_converter")
    return {
        "ok": True,
        "engine": "li-tools",
        "tools": {
            "etsi_li_parser": bool(parser),
            "pcap_to_hi3_converter": bool(converter),
        },
    }


@app.post("/api/li-tools/parser")
async def run_parser(
    files: list[UploadFile] = File(...),
    output_format: str = Form(default="binary"),
    user: dict[str, Any] = Depends(require_user),
):
    fmt = (output_format or "binary").strip().lower()
    if fmt not in PARSER_FORMATS:
        raise HTTPException(status_code=400, detail="Formato non valido. Usa binary, text, json o xml.")
    if not files:
        raise HTTPException(status_code=400, detail="Nessun file caricato.")
    if len(files) > 40:
        raise HTTPException(status_code=400, detail="Massimo 40 file per richiesta.")

    user_id = str(user.get("id") or user.get("email") or "anon")
    lock = _lock_for(user_id)
    if not lock.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="Hai già un'operazione LI Tools in corso.")
    if not _global_sem.acquire(blocking=False):
        lock.release()
        raise HTTPException(status_code=429, detail="Il servizio è occupato. Riprova tra poco.")

    tmp = Path(tempfile.mkdtemp(prefix=f"li-parser-{user_id[:12]}-"))
    input_dir = tmp / "input"
    output_dir = tmp / "output"
    input_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        total = 0
        saved_names: list[str] = []
        for item in files:
            raw = await item.read()
            total += len(raw)
            if total > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=400, detail="Caricamento oltre 200 MB.")
            name = _safe_filename(item.filename or "upload.bin")
            dest = input_dir / name
            # Evita collisioni di nome
            if dest.exists():
                dest = input_dir / f"{uuid4().hex[:8]}_{name}"
            dest.write_bytes(raw)
            saved_names.append(dest.name)

        # Una sola chiamata sul directory di input (come da documentazione Europol).
        proc = _run(["etsi_li_parser", str(input_dir), fmt, str(output_dir)])
        stderr = (proc.stderr or "").strip()
        stdout = (proc.stdout or "").strip()
        if proc.returncode != 0:
            detail = stderr or stdout or f"etsi_li_parser terminato con codice {proc.returncode}."
            raise HTTPException(status_code=400, detail=detail[:2000])

        outputs = _list_outputs(output_dir)
        if not outputs:
            raise HTTPException(
                status_code=400,
                detail="Nessun output generato. Verifica che i file contengano record ETSI LI HI3 supportati.",
            )

        zip_bytes = _zip_directory(output_dir)
        # Anteprima testuale se format text/json/xml e file piccoli
        previews: list[dict[str, str]] = []
        if fmt in {"text", "json", "xml"}:
            for path in sorted(output_dir.rglob("*")):
                if not path.is_file():
                    continue
                if path.stat().st_size > 400_000:
                    continue
                try:
                    text = path.read_text(encoding="utf-8", errors="replace")
                except OSError:
                    continue
                previews.append({
                    "name": str(path.relative_to(output_dir)).replace("\\", "/"),
                    "content": text[:120_000],
                })
                if len(previews) >= 8:
                    break

        return JSONResponse({
            "ok": True,
            "tool": "etsi_li_parser",
            "format": fmt,
            "inputs": saved_names,
            "outputs": outputs,
            "log": (stderr or stdout)[:4000],
            "previews": previews,
            "download_name": "li-tools-parser-output.zip",
            "download_base64": base64.b64encode(zip_bytes).decode("ascii"),
        })
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
        _global_sem.release()
        lock.release()


@app.post("/api/li-tools/pcap-to-hi3")
async def run_pcap_to_hi3(
    file: UploadFile = File(...),
    liid: str = Form(...),
    operator_id: str = Form(...),
    user: dict[str, Any] = Depends(require_user),
):
    liid_clean = SAFE_NAME.sub("", (liid or "").strip())[:64]
    opid_clean = SAFE_NAME.sub("", (operator_id or "").strip())[:64]
    if not liid_clean:
        raise HTTPException(status_code=400, detail="LIID non valido.")
    if not opid_clean:
        raise HTTPException(status_code=400, detail="Operator ID non valido.")

    user_id = str(user.get("id") or user.get("email") or "anon")
    lock = _lock_for(user_id)
    if not lock.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="Hai già un'operazione LI Tools in corso.")
    if not _global_sem.acquire(blocking=False):
        lock.release()
        raise HTTPException(status_code=429, detail="Il servizio è occupato. Riprova tra poco.")

    tmp = Path(tempfile.mkdtemp(prefix=f"li-pcap-{user_id[:12]}-"))
    try:
        raw = await file.read()
        if not raw:
            raise HTTPException(status_code=400, detail="File vuoto.")
        if len(raw) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=400, detail="Caricamento oltre 200 MB.")
        in_name = _safe_filename(file.filename or "capture.pcap")
        in_path = tmp / in_name
        in_path.write_bytes(raw)
        out_name = Path(in_name).stem + ".hi3"
        out_path = tmp / out_name

        proc = _run([
            "pcap_to_hi3_converter",
            "--input", str(in_path),
            "--liid", liid_clean,
            "--operator-id", opid_clean,
            "--output", str(out_path),
        ])
        stderr = (proc.stderr or "").strip()
        stdout = (proc.stdout or "").strip()
        if proc.returncode != 0 or not out_path.is_file():
            detail = stderr or stdout or "Conversione fallita."
            raise HTTPException(status_code=400, detail=detail[:2000])

        data = out_path.read_bytes()
        return JSONResponse({
            "ok": True,
            "tool": "pcap_to_hi3_converter",
            "liid": liid_clean,
            "operator_id": opid_clean,
            "input": in_name,
            "output": out_name,
            "size": len(data),
            "log": (stderr or stdout)[:4000],
            "download_name": out_name,
            "download_base64": base64.b64encode(data).decode("ascii"),
        })
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
        _global_sem.release()
        lock.release()
