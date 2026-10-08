#!/usr/bin/env python3
"""Classifica le PNG in emoji/ per tipo visivo e scrive order.json."""
from __future__ import annotations

import colorsys
import json
import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
EMOJI_DIR = ROOT / "emoji"

CATS = [
    ("facce", "Facce"),
    ("persone", "Persone"),
    ("gesti", "Gesti"),
    ("cuori", "Cuori e amore"),
    ("animali", "Animali"),
    ("cibo", "Cibo"),
    ("oggetti", "Oggetti"),
    ("simboli", "Simboli"),
    ("altro", "Altro"),
]


def sample(path: Path, step: int = 8):
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()
    opaque = []
    for y in range(0, h, step):
        for x in range(0, w, step):
            r, g, b, a = px[x, y]
            if a < 40:
                continue
            opaque.append((x, y, r, g, b))
    return w, h, opaque


def classify(path: Path):
    w, h, opaque = sample(path)
    if not opaque:
        return "altro", 0.0
    n = len(opaque)
    xs = [p[0] for p in opaque]
    ys = [p[1] for p in opaque]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    bw = max(1, maxx - minx)
    bh = max(1, maxy - miny)
    aspect = bh / bw
    cx, cy = (minx + maxx) / 2, (miny + maxy) / 2
    rad = math.hypot(bw, bh) / 2

    in_circle = yellow = pink = green = blue = gray = skin = bright_red = gold = 0
    for x, y, r, g, b in opaque:
        if math.hypot(x - cx, y - cy) <= rad * 0.55:
            in_circle += 1
        hue, sat, val = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        hue *= 360
        if 35 <= hue <= 65 and sat > 0.35 and val > 0.55 and r > 160 and g > 120:
            yellow += 1
        if (0 <= hue <= 20 or hue >= 340) and sat > 0.45 and val > 0.45 and r > 140:
            bright_red += 1
        if 300 <= hue <= 340 and sat > 0.25 and val > 0.5:
            pink += 1
        if 85 <= hue <= 160 and sat > 0.25 and g > r and g > b:
            green += 1
        if 190 <= hue <= 250 and sat > 0.25 and b > r:
            blue += 1
        if sat < 0.18 and 40 < val * 255 < 210:
            gray += 1
        if 15 <= hue <= 45 and sat > 0.2 and 80 < r < 220 and g < r:
            skin += 1
        if 40 <= hue <= 58 and sat > 0.4 and val > 0.55 and r > 150 and g > 100:
            gold += 1

    circ = in_circle / n
    yf = yellow / n
    rf = bright_red / n
    pf = pink / n
    gf = green / n
    bf = blue / n
    grayf = gray / n
    skinf = skin / n
    goldf = gold / n

    if circ > 0.62 and yf > 0.28 and aspect < 1.25:
        return "facce", yf + circ
    if circ > 0.55 and yf > 0.18 and aspect < 1.35 and bh / h > 0.45:
        return "facce", yf + circ
    if (rf > 0.22 or pf > 0.18) and aspect < 1.4 and circ > 0.35:
        return "cuori", rf + pf
    if aspect > 1.35 and (skinf > 0.08 or yf > 0.08 or grayf > 0.15):
        return "persone", aspect
    if aspect > 1.25 and bh / h > 0.55:
        return "persone", aspect
    if 0.85 < aspect < 1.35 and yf > 0.15 and circ < 0.55 and skinf + yf > 0.25:
        return "gesti", yf
    if yf + rf + goldf > 0.35 and circ < 0.4 and aspect < 1.3:
        return "cibo", yf + rf
    if gf > 0.3 and circ < 0.55:
        return "oggetti", gf
    if goldf > 0.25 and circ < 0.6:
        return "oggetti", goldf
    if grayf > 0.35:
        return "oggetti", grayf
    if bf > 0.25:
        return "simboli", bf
    if rf > 0.15 or pf > 0.12:
        return "simboli", rf + pf
    return "altro", 0.0


def main():
    files = sorted(EMOJI_DIR.glob("*.png"), key=lambda p: p.name.lower())
    grouped = {cid: [] for cid, _ in CATS}
    scores = {}
    for i, path in enumerate(files):
        cat, score = classify(path)
        grouped[cat].append(path.name)
        scores[path.name] = (cat, score)
        if (i + 1) % 100 == 0:
            print(f"classified {i + 1}/{len(files)}")

    for cid in grouped:
        grouped[cid].sort(key=lambda name: (-scores[name][1], name.lower()))

    order = {
        "version": 1,
        "categories": [
            {"id": cid, "label": label, "files": grouped[cid]}
            for cid, label in CATS
            if grouped[cid]
        ],
    }
    out = EMOJI_DIR / "order.json"
    out.write_text(json.dumps(order, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", out)
    for c in order["categories"]:
        print(f"  {c['label']}: {len(c['files'])}")
    print("total", sum(len(c["files"]) for c in order["categories"]))


if __name__ == "__main__":
    main()
