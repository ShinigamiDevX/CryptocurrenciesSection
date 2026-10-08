#!/usr/bin/env python3
"""Riordina facce nell'ordine CLDR/WhatsApp.

Match visuale vs asset Apple (stesso stile del pack Telegram).
Assegnazione greedy per confidenza (gap 1°/2°) così le emoji distintive
non vengono rubate da match ambigui tra faccine simili.
"""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
ORDER_JSON = ROOT / "order.json"
EMOJI_TEST = Path(
    r"C:\Users\Admin\.cursor\projects\c-Users-Admin-Desktop-Portale\agent-tools\e99b775f-821e-48d0-9626-3312682789c8.txt"
)
REF_DIR = ROOT / "_apple_refs"
REF_DIR.mkdir(exist_ok=True)

FACE_SUBGROUPS = {
    "face-smiling",
    "face-affection",
    "face-tongue",
    "face-hand",
    "face-neutral-skeptical",
    "face-sleepy",
    "face-unwell",
    "face-hat",
    "face-glasses",
    "face-concerned",
    "face-negative",
    "face-costume",
    "cat-face",
    "monkey-face",
}

HAND_SUBGROUPS = {
    "hand-fingers-open",
    "hand-fingers-partial",
    "hand-single-finger",
    "hand-fingers-closed",
    "hands",
    "body-parts",
}


def parse_cldr_order(path: Path) -> tuple[list[str], list[str]]:
    faces: list[str] = []
    hands: list[str] = []
    group = ""
    subgroup = ""
    seen_f: set[str] = set()
    seen_h: set[str] = set()
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("# group:"):
            group = line.split(":", 1)[1].strip()
            continue
        if line.startswith("# subgroup:"):
            subgroup = line.split(":", 1)[1].strip()
            continue
        if "; fully-qualified #" not in line:
            continue
        code = line.split(";", 1)[0].strip()
        eid = "-".join(p.lower() for p in code.split())
        if group.startswith("Smileys") and subgroup in FACE_SUBGROUPS:
            if eid not in seen_f:
                faces.append(eid)
                seen_f.add(eid)
        elif subgroup in HAND_SUBGROUPS:
            if eid not in seen_h:
                hands.append(eid)
                seen_h.add(eid)
    return faces, hands


def download_ref(eid: str) -> Path | None:
    dest = REF_DIR / f"{eid}.png"
    if dest.exists() and dest.stat().st_size > 50:
        return dest
    url = f"https://cdn.jsdelivr.net/gh/realityripple/emoji@master/apple/{eid}.png"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=25) as r:
            data = r.read()
        if len(data) < 50:
            raise RuntimeError("empty")
        dest.write_bytes(data)
        return dest
    except Exception:
        if "-fe0f" in eid:
            return download_ref(eid.replace("-fe0f", ""))
        return None


def prep_arr(path: Path, size: int = 96) -> np.ndarray:
    im = Image.open(path).convert("RGBA")
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    w, h = im.size
    side = max(w, h)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - w) // 2, (side - h) // 2))
    bg = Image.new("RGBA", (side, side), (255, 255, 255, 255))
    bg.alpha_composite(canvas)
    return np.asarray(bg.convert("RGB").resize((size, size), Image.Resampling.LANCZOS), dtype=np.float32)


def shape_stats(path: Path) -> dict:
    im = Image.open(path).convert("RGBA")
    bbox = im.getbbox() or (0, 0, im.size[0], im.size[1])
    x0, y0, x1, y1 = bbox
    bw, bh = max(1, x1 - x0), max(1, y1 - y0)
    aspect = bw / bh
    crop = im.crop(bbox)
    arr = np.asarray(crop)
    opaque = arr[:, :, 3] >= 40
    n = int(opaque.sum()) or 1
    rgb = arr[:, :, :3][opaque]
    r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    yellow = float(((r > 180) & (g > 140) & (b < 120) & (r > b + 40)).mean())
    fill = n / float(bw * bh)
    return {"aspect": aspect, "yellow": yellow, "fill": float(fill)}


def mse(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.mean((a - b) ** 2))


def confidence_assign(
    eids: list[str],
    refs: dict[str, np.ndarray],
    pool: list[str],
    local_arr: dict[str, np.ndarray],
    max_mse: float,
    min_gap: float,
) -> tuple[dict[str, str], set[str], list[str]]:
    """Assegna prima le coppie più distintive (gap alto, mse basso)."""
    pool_set = [n for n in pool if n in local_arr]
    used: set[str] = set()
    eid_to_file: dict[str, str] = {}
    log: list[str] = []

    # Precompute all distances
    dist: dict[str, list[tuple[float, str]]] = {}
    for eid in eids:
        rh = refs.get(eid)
        if rh is None:
            log.append(f"{eid}\t-1\tMISS_REF")
            continue
        ranked = sorted(((mse(local_arr[n], rh), n) for n in pool_set), key=lambda x: x[0])
        dist[eid] = ranked

    pending = set(dist.keys())
    while pending:
        best_choice = None  # (gap, -mse, eid, name, mse)
        for eid in list(pending):
            ranked = [(d, n) for d, n in dist[eid] if n not in used]
            if not ranked:
                pending.discard(eid)
                log.append(f"{eid}\t-1\tNO_CAND")
                continue
            d0, n0 = ranked[0]
            d1 = ranked[1][0] if len(ranked) > 1 else d0 + 1e6
            gap = d1 - d0
            if d0 > max_mse or gap < min_gap:
                continue
            cand = (gap, -d0, eid, n0, d0)
            if best_choice is None or cand > best_choice:
                best_choice = cand
        if best_choice is None:
            # nessun altro match sicuro: logga i restanti
            for eid in sorted(pending, key=lambda e: eids.index(e)):
                ranked = [(d, n) for d, n in dist[eid] if n not in used]
                if ranked:
                    d0, n0 = ranked[0]
                    d1 = ranked[1][0] if len(ranked) > 1 else -1
                    log.append(f"{eid}\t{d0:.1f}\tgap={(d1-d0) if d1>=0 else -1:.1f}\tREJECT")
                else:
                    log.append(f"{eid}\t-1\tNO_CAND")
            break
        gap, _neg, eid, name, d0 = best_choice
        eid_to_file[eid] = name
        used.add(name)
        pending.discard(eid)
        log.append(f"{eid}\t{d0:.1f}\tgap={gap:.1f}\tOK\t{name}")

    return eid_to_file, used, log


def main() -> None:
    faces, hands = parse_cldr_order(EMOJI_TEST)
    print(f"CLDR faces={len(faces)} hands={len(hands)}")

    order = json.loads(ORDER_JSON.read_text(encoding="utf-8"))
    facce_cat = next(c for c in order["categories"] if c["id"] == "facce")
    local_files = list(facce_cat["files"])

    local_meta: dict[str, dict] = {}
    local_arr: dict[str, np.ndarray] = {}
    for i, name in enumerate(local_files):
        p = ROOT / name
        if not p.exists():
            continue
        try:
            local_meta[name] = shape_stats(p)
            local_arr[name] = prep_arr(p)
        except Exception as e:
            print("skip", name, e)
        if (i + 1) % 50 == 0:
            print(f"  loaded {i+1}/{len(local_files)}")

    face_cands = [
        n
        for n, m in local_meta.items()
        if m["yellow"] >= 0.28 and 0.72 <= m["aspect"] <= 1.40 and m["fill"] >= 0.40
    ]
    hand_cands = [n for n in local_meta if n not in face_cands]
    print(f"face_cands={len(face_cands)} handish={len(hand_cands)}")

    ref_face: dict[str, np.ndarray] = {}
    ref_hand: dict[str, np.ndarray] = {}
    for eid in faces:
        p = download_ref(eid)
        if p:
            try:
                ref_face[eid] = prep_arr(p)
            except Exception:
                pass
    for eid in hands:
        p = download_ref(eid)
        if p:
            try:
                ref_hand[eid] = prep_arr(p)
            except Exception:
                pass
    print(f"refs faces={len(ref_face)} hands={len(ref_hand)}")

    # Faccine: soglia larga-ish ma gap obbligatorio (😂 gap~2388, 🤙~2546)
    face_map, used, log_f = confidence_assign(
        faces, ref_face, face_cands, local_arr, max_mse=2500, min_gap=350
    )
    hand_pool = hand_cands + [n for n in face_cands if n not in used]
    hand_map, used_h, log_h = confidence_assign(
        hands, ref_hand, hand_pool, local_arr, max_mse=2000, min_gap=500
    )
    used |= used_h

    matched_faces = [face_map[e] for e in faces if e in face_map]
    matched_hands = [hand_map[e] for e in hands if e in hand_map]

    leftovers = [f for f in local_files if f not in used]
    left_faces_raw = [f for f in leftovers if f in set(face_cands)]
    left_other = [f for f in leftovers if f not in set(face_cands)]

    # Colloca ogni faccina residua vicino allo slot WhatsApp a cui assomiglia di più
    from collections import defaultdict

    soft_at: dict[int, list[tuple[float, str]]] = defaultdict(list)
    soft_tail: list[tuple[float, str]] = []
    for name in left_faces_raw:
        best_i, best_d = 0, 1e18
        for i, eid in enumerate(faces):
            rh = ref_face.get(eid)
            if rh is None:
                continue
            d = mse(local_arr[name], rh)
            if d < best_d:
                best_d = d
                best_i = i
        # Solo soft-placement se il match e' abbastanza vicino; altrimenti in coda faccine
        if best_d <= 2400:
            soft_at[best_i].append((best_d, name))
        else:
            soft_tail.append((best_d, name))

    interleaved_faces: list[str] = []
    placed: set[str] = set()
    for i, eid in enumerate(faces):
        for _d, name in sorted(soft_at.get(i, []), key=lambda t: t[0]):
            if name not in placed:
                interleaved_faces.append(name)
                placed.add(name)
        if eid in face_map:
            interleaved_faces.append(face_map[eid])
            placed.add(face_map[eid])
    for _d, name in sorted(soft_tail, key=lambda t: t[0]):
        if name not in placed:
            interleaved_faces.append(name)
            placed.add(name)
    for name in left_faces_raw:
        if name not in placed:
            interleaved_faces.append(name)

    matched_faces = interleaved_faces
    left_faces = []
    new_files = matched_faces + matched_hands + left_other
    assert len(new_files) == len(set(new_files)) == len(local_files)

    facce_cat["files"] = new_files
    ORDER_JSON.write_text(json.dumps(order, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    header = (
        f"matched_faces={len(matched_faces)} left_faces={len(left_faces)} "
        f"matched_hands={len(matched_hands)} left_other={len(left_other)}\n"
    )
    (ROOT / "_facce_wa_match_log.txt").write_text(
        header + "\n".join(log_f + log_h) + "\n", encoding="utf-8"
    )
    print(header.strip())

    joy = "CAACAgIAAxUAAWq_iV2XVCnmSrPkNAX4JfsUFUaDAAInMwAC_UrJSuyrprPOG16fPQQ.png"
    callme = "CAACAgIAAxUAAWq_iV2zTm5ECCbHAlaojzPxdnwQAAKrMAACqsXJStEtKKB6PWbTPQQ.png"
    print("1f602->", next((e for e, f in face_map.items() if f == joy), None), "idx", matched_faces.index(joy) if joy in matched_faces else "MISS")
    print("callme hand idx", matched_hands.index(callme) if callme in matched_hands else "MISS")
    print("first 12 WA-matched eids:", [e for e in faces if e in face_map][:12])
    for e in [e for e in faces if e in face_map][:15]:
        print(f"  {e}")


if __name__ == "__main__":
    main()
