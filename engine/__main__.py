"""CLI: ``python3 -m engine demo`` -> carica i data/data_*.json (formato v1), esegue la pipeline e scrive
data/events.json, data/markets.json, data/report_daily.json; stampa i top 15 eventi.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone

from . import pipeline, report, text as T

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
IT_SOURCES = {"ansa", "corriere", "sole24ore", "ansa_ultima_ora", "repubblica"}
NEWS_FILES = ["ansa", "aljazeera", "bbc", "cnn", "corriere", "guardian", "sole24ore", "ansa_ultima_ora"]


def _aid(url, title):
    return hashlib.sha1((url or title).encode("utf-8", "ignore")).hexdigest()[:16]


def load_v1(data_dir: str):
    """Converte i file v1 (dict titolo -> {link, content, source, date, category, scraped_at}) in Article."""
    arts, tg = [], []
    scraped = []
    for name in NEWS_FILES:
        path = os.path.join(data_dir, f"data_{name}.json")
        if not os.path.exists(path):
            continue
        try:
            doc = json.load(open(path, encoding="utf-8"))
        except Exception:
            continue
        rows = []
        if isinstance(doc, dict) and name == "ansa_ultima_ora":
            for cat, lst in doc.items():
                for r in lst if isinstance(lst, list) else []:
                    rows.append((r.get("title", ""), {"link": r.get("link"), "content": "", "category": cat,
                                                      "scraped_at": r.get("scraped_at"), "date": None, "source": name}))
        elif isinstance(doc, dict):
            rows = list(doc.items())
        elif isinstance(doc, list):
            rows = [(r.get("title", ""), r) for r in doc if isinstance(r, dict)]
        for title, info in rows:
            if not isinstance(info, dict):
                continue
            sc = info.get("scraped_at") or 0
            if sc:
                scraped.append(sc)
            dt = T.parse_dt(info.get("date"))
            scr = T.parse_dt(sc) if sc else None
            if scr and (dt is None or abs((scr - dt).total_seconds()) > 7 * 86400):
                dt = scr   # data feed assente o vecchia (es. CNN fixture 2023): usa scraped_at
            src = info.get("source") or name
            arts.append({
                "id": _aid(info.get("link"), title), "title": title, "summary": T.strip_html(info.get("content") or "")[:600],
                "url": info.get("link") or "", "source": {"aljazeera": "Al Jazeera", "bbc": "BBC", "cnn": "CNN", "ansa": "ANSA",
                                                         "ansa_ultima_ora": "ANSA", "corriere": "Corriere", "guardian": "Guardian",
                                                         "sole24ore": "Sole24Ore"}.get(src, src),
                "lang": "it" if name in IT_SOURCES else "en",
                "published_at": T.iso(dt) if dt else None, "geo_hint": info.get("category") if name not in IT_SOURCES else None,
            })
    tpath = os.path.join(data_dir, "data_telegram.json")
    if os.path.exists(tpath):
        try:
            tg = json.load(open(tpath, encoding="utf-8"))
        except Exception:
            tg = []
    scraped.sort()
    median = scraped[len(scraped) // 2] if scraped else 0
    return arts, tg, median


def demo(argv):
    ap = argparse.ArgumentParser(prog="python3 -m engine demo")
    ap.add_argument("--data", default=os.path.join(ROOT, "data"))
    ap.add_argument("--top", type=int, default=15)
    ap.add_argument("--now", default=None, help="ISO8601; default = mediana degli scraped_at dei file news")
    ap.add_argument("--no-write", action="store_true")
    a = ap.parse_args(argv)
    t0 = time.time()
    arts, tg, mx = load_v1(a.data)
    now = T.parse_dt(a.now) if a.now else (datetime.fromtimestamp(mx, tz=timezone.utc) if mx else datetime.now(timezone.utc))
    t1 = time.time()
    prev = None
    mpath = os.path.join(a.data, "markets.json")
    if os.path.exists(mpath):
        try:
            prev = json.load(open(mpath, encoding="utf-8"))
        except Exception:
            prev = None
    doc = pipeline.build_events(arts, now)
    t2 = time.time()
    markets = pipeline.build_markets(doc, prev, now)
    t3 = time.time()
    rep = report.build_report(doc, arts, tg, now)
    t4 = time.time()
    if not a.no_write:
        for fn, obj in (("events.json", doc), ("markets.json", markets), ("report_daily.json", rep)):
            with open(os.path.join(a.data, fn), "w", encoding="utf-8") as fh:
                json.dump(obj, fh, ensure_ascii=False, indent=1)
    print(f"{len(arts)} articoli ({len(tg)} telegram) -> {len(doc['events'])} eventi  [now={T.iso(now)}]")
    print(f"timing: load {t1 - t0:.2f}s | build_events {t2 - t1:.2f}s | build_markets {t3 - t2:.2f}s | report {t4 - t3:.2f}s | totale {t4 - t0:.2f}s")
    print(f"{'#':>2} {'score':>5} {'sev':>4} {'type':<24} {'src':>3} {'n':>3}  {'location':<28} title")
    for i, e in enumerate(doc["events"][: a.top], 1):
        print(f"{i:>2} {e['global_score']:>5.1f} {e['severity']:>4.1f} {e['event_type']:<24} {e['n_sources']:>3} {e['n_articles']:>3}  "
              f"{(e['location_label'] or '-')[:28]:<28} {e['title'][:90]}")
    sec = sorted(markets["sectors"], key=lambda s: -s["score"])[:5]
    print("settori:", ", ".join(f"{s['label']} {s['score']}" for s in sec))
    print("rischio paesi:", ", ".join(f"{c['name']} {c['risk_score']}" for c in markets["countries"][:8]))
    return 0


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv or argv[0] in ("-h", "--help"):
        print("uso: python3 -m engine demo [--data DIR] [--top N] [--no-write]")
        return 0
    if argv[0] == "demo":
        return demo(argv[1:])
    print("comando sconosciuto:", argv[0])
    return 2


if __name__ == "__main__":
    sys.exit(main())
