"""
Analisi Report — servizio Python (FastAPI).
Analizza Excel/CSV/PDF in sessione e restituisce statistiche + dati per grafici.
"""
from __future__ import annotations

import math
import os
import tempfile
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import pdfplumber
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Analisi Report", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_BYTES = 25 * 1024 * 1024
ALLOWED_EXT = {".csv", ".xlsx", ".xls", ".pdf"}
MAX_CAT_VALUES = 15
MAX_HIST_BINS = 12
MAX_CHARTS_PER_DATASET = 8


def _safe_float(v: Any) -> float | None:
    try:
        f = float(v)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except (TypeError, ValueError):
        return None


def _clean_columns(df: pd.DataFrame) -> pd.DataFrame:
    cols = []
    for i, c in enumerate(df.columns):
        name = str(c).strip() if c is not None and str(c).strip() not in ("", "nan", "None") else f"Colonna_{i + 1}"
        cols.append(name)
    # dedupe
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
    # drop fully empty rows/cols
    df = df.dropna(how="all").dropna(axis=1, how="all")
    return df.reset_index(drop=True)


def _is_numeric_series(s: pd.Series) -> bool:
    if pd.api.types.is_numeric_dtype(s):
        return True
    converted = pd.to_numeric(s, errors="coerce")
    non_null = s.notna().sum()
    if non_null == 0:
        return False
    return converted.notna().sum() / non_null >= 0.7


def _numeric_series(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s, errors="coerce")


def _analyze_dataframe(df: pd.DataFrame, *, source: str, sheet: str | None) -> dict[str, Any]:
    df = _clean_columns(df)
    if df.empty:
        return {
            "id": f"{source}::{sheet or 'dati'}",
            "source": source,
            "sheet": sheet,
            "rows": 0,
            "columns": [],
            "summary": {"note": "Dataset vuoto"},
            "columns_detail": [],
            "charts": [],
            "error": "Nessun dato utilizzabile in questo foglio/tabella.",
        }

    columns_detail: list[dict[str, Any]] = []
    charts: list[dict[str, Any]] = []

    for col in df.columns:
        series = df[col]
        nulls = int(series.isna().sum()) + int((series.astype(str).str.strip() == "").sum())
        detail: dict[str, Any] = {
            "name": col,
            "nulls": nulls,
            "unique": int(series.nunique(dropna=True)),
        }

        if _is_numeric_series(series):
            num = _numeric_series(series).dropna()
            detail["type"] = "numeric"
            if len(num):
                detail["stats"] = {
                    "count": int(len(num)),
                    "min": float(num.min()),
                    "max": float(num.max()),
                    "mean": float(num.mean()),
                    "median": float(num.median()),
                    "std": float(num.std()) if len(num) > 1 else 0.0,
                }
                bins = min(MAX_HIST_BINS, max(4, int(math.sqrt(len(num)))))
                counts, edges = np.histogram(num.to_numpy(), bins=bins)
                labels = [
                    f"{edges[i]:.2g}–{edges[i + 1]:.2g}" for i in range(len(counts))
                ]
                if len(charts) < MAX_CHARTS_PER_DATASET:
                    charts.append(
                        {
                            "type": "histogram",
                            "title": f"Distribuzione: {col}",
                            "labels": labels,
                            "values": [int(c) for c in counts],
                        }
                    )
            else:
                detail["stats"] = None
        else:
            detail["type"] = "categorical"
            text = series.dropna().astype(str).str.strip()
            text = text[text != ""]
            if len(text):
                vc = text.value_counts().head(MAX_CAT_VALUES)
                detail["top_values"] = [
                    {"value": str(k), "count": int(v)} for k, v in vc.items()
                ]
                if len(charts) < MAX_CHARTS_PER_DATASET and len(vc) >= 1:
                    chart_type = "pie" if len(vc) <= 8 else "bar"
                    charts.append(
                        {
                            "type": chart_type,
                            "title": f"Frequenze: {col}",
                            "labels": [str(k) for k in vc.index.tolist()],
                            "values": [int(v) for v in vc.values.tolist()],
                        }
                    )
            else:
                detail["top_values"] = []

        columns_detail.append(detail)

    return {
        "id": f"{source}::{sheet or 'dati'}",
        "source": source,
        "sheet": sheet,
        "rows": int(len(df)),
        "columns": list(df.columns.astype(str)),
        "summary": {
            "rows": int(len(df)),
            "columns": int(len(df.columns)),
            "numeric_columns": sum(1 for c in columns_detail if c["type"] == "numeric"),
            "categorical_columns": sum(1 for c in columns_detail if c["type"] == "categorical"),
        },
        "columns_detail": columns_detail,
        "charts": charts,
    }


def _read_csv(path: Path) -> list[tuple[str | None, pd.DataFrame]]:
    for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            df = pd.read_csv(path, encoding=enc, sep=None, engine="python")
            return [(None, df)]
        except Exception:
            continue
    raise ValueError("Impossibile leggere il CSV (encoding/separatore non riconosciuto).")


def _read_excel(path: Path) -> list[tuple[str | None, pd.DataFrame]]:
    ext = path.suffix.lower()
    engine = "openpyxl" if ext == ".xlsx" else "xlrd"
    try:
        book = pd.read_excel(path, sheet_name=None, engine=engine)
    except Exception:
        # fallback: lascia scegliere a pandas
        book = pd.read_excel(path, sheet_name=None)
    out = []
    for name, df in book.items():
        if isinstance(df, pd.DataFrame):
            out.append((str(name), df))
    return out


def _read_pdf(path: Path) -> list[tuple[str | None, pd.DataFrame]]:
    tables: list[tuple[str | None, pd.DataFrame]] = []
    with pdfplumber.open(path) as pdf:
        t_idx = 0
        for p_i, page in enumerate(pdf.pages, start=1):
            extracted = page.extract_tables() or []
            for table in extracted:
                if not table or len(table) < 2:
                    continue
                header = table[0]
                rows = table[1:]
                # se header tutto None, usa prima riga non vuota
                if not any(h is not None and str(h).strip() for h in header):
                    continue
                df = pd.DataFrame(rows, columns=[str(h) if h is not None else f"Col_{i}" for i, h in enumerate(header)])
                t_idx += 1
                tables.append((f"Pagina {p_i} — Tabella {t_idx}", df))
    if not tables:
        raise ValueError("Nessuna tabella rilevata nel PDF. Supportati PDF con tabelle testuali (non scansioni OCR).")
    return tables


def _parse_file(path: Path, original_name: str) -> list[dict[str, Any]]:
    ext = path.suffix.lower()
    if ext == ".csv":
        parts = _read_csv(path)
    elif ext in (".xlsx", ".xls"):
        parts = _read_excel(path)
    elif ext == ".pdf":
        parts = _read_pdf(path)
    else:
        raise ValueError(f"Formato non supportato: {ext}")

    datasets = []
    for sheet, df in parts:
        datasets.append(_analyze_dataframe(df, source=original_name, sheet=sheet))
    return datasets


@app.get("/api/analisi/health")
def health():
    return {"ok": True}


@app.post("/api/analisi/analyze")
async def analyze(files: list[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="Nessun file caricato.")

    all_datasets: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []

    for upload in files:
        name = upload.filename or "file"
        ext = Path(name).suffix.lower()
        if ext not in ALLOWED_EXT:
            errors.append({"file": name, "error": f"Estensione non supportata ({ext}). Usa CSV, Excel o PDF."})
            continue

        data = await upload.read()
        if len(data) > MAX_BYTES:
            errors.append({"file": name, "error": "File troppo grande (max 25 MB)."})
            continue
        if not data:
            errors.append({"file": name, "error": "File vuoto."})
            continue

        suffix = ext or ".bin"
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(data)
                tmp_path = Path(tmp.name)
            datasets = _parse_file(tmp_path, name)
            if not datasets:
                errors.append({"file": name, "error": "Nessun dataset estratto dal file."})
            else:
                all_datasets.extend(datasets)
        except Exception as e:
            errors.append({"file": name, "error": str(e)})
        finally:
            if tmp_path and tmp_path.exists():
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

    if not all_datasets and errors:
        raise HTTPException(status_code=400, detail={"message": "Analisi fallita.", "errors": errors})

    return {
        "datasets": all_datasets,
        "errors": errors,
        "count": len(all_datasets),
    }
