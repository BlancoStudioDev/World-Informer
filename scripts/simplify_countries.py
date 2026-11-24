#!/usr/bin/env python3
"""Semplifica data/countries.geojson -> data/countries.min.geojson (eseguire una volta, offline).

Douglas-Peucker in gradi, anelli minuscoli scartati, coordinate a 2 decimali, solo le proprieta' usate dal frontend.
Uso: python3 scripts/simplify_countries.py [tolleranza_gradi=0.08] [area_minima_gradi2=0.03]
"""
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "countries.geojson")
DST = os.path.join(ROOT, "data", "countries.min.geojson")
KEEP = ("ISO_A2", "WB_A2", "ADM0_A3", "ADMIN", "NAME", "MAPCOLOR7")   # MAPCOLOR7: tinta alternata per distinguere i confini senza linee


def _dist2(p, a, b):
    (x, y), (x1, y1), (x2, y2) = p, a, b
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return (x - x1) ** 2 + (y - y1) ** 2
    t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return (x - (x1 + t * dx)) ** 2 + (y - (y1 + t * dy)) ** 2


def dp(points, tol2):
    """Douglas-Peucker iterativo (nessun limite di ricorsione)."""
    n = len(points)
    if n < 3:
        return list(points)
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        best, idx = 0.0, -1
        for k in range(i + 1, j):
            d = _dist2(points[k], points[i], points[j])
            if d > best:
                best, idx = d, k
        if idx >= 0 and best > tol2:
            keep[idx] = True
            stack.append((i, idx))
            stack.append((idx, j))
    return [p for p, k in zip(points, keep) if k]


def ring_area(r):
    return abs(sum(r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1] for i in range(len(r) - 1))) / 2


def simplify_ring(ring, tol, min_area):
    if ring_area(ring) < min_area:
        return None
    out = dp(ring[:-1], tol * tol)
    out = [[round(x, 2), round(y, 2)] for x, y in out]
    dedup = [out[0]]
    for p in out[1:]:
        if p != dedup[-1]:
            dedup.append(p)
    if len(dedup) < 3:
        return None
    return dedup + [dedup[0]]


def simplify_geometry(geom, tol, min_area):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    res = []
    for poly in polys:
        outer = simplify_ring(poly[0], tol, min_area)
        if not outer:
            continue
        holes = [r for r in (simplify_ring(h, tol, min_area * 4) for h in poly[1:]) if r]
        res.append([outer] + holes)
    if not res:
        return None
    return {"type": "MultiPolygon", "coordinates": res} if len(res) > 1 else {"type": "Polygon", "coordinates": res[0]}


def main():
    tol = float(sys.argv[1]) if len(sys.argv) > 1 else 0.08
    min_area = float(sys.argv[2]) if len(sys.argv) > 2 else 0.03
    with open(SRC, encoding="utf-8") as f:
        geo = json.load(f)
    feats = []
    for ft in geo["features"]:
        g = simplify_geometry(ft["geometry"], tol, min_area)
        if g is None:  # paese minuscolo: tieni almeno l'anello piu' grande
            g = simplify_geometry(ft["geometry"], tol, 0)
        if g is None:
            continue
        props = {k: ft["properties"].get(k) for k in KEEP if ft["properties"].get(k) is not None}
        feats.append({"type": "Feature", "properties": props, "geometry": g})
    with open(DST, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": feats}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(feats)} feature, {os.path.getsize(SRC)//1024} KB -> {os.path.getsize(DST)//1024} KB")


if __name__ == "__main__":
    main()
