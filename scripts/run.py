#!/usr/bin/env python3
"""World-Informer pipeline entrypoint.

    python3 scripts/run.py fast|news|daily|all

  news   news_rss + ansa_ultima_ora + telegram -> articles_store -> engine (events, markets, report)
  fast   news  +  flights, gpsjam, ships              (cron: every 10 min)
  daily  fast  +  firms, satellites, nuclear, radiation          (cron: once a day)
  all    same as daily

Every job holds an fcntl lock (logs/<job>.lock) and every step a per-step lock, so overlapping
cron invocations skip instead of piling up. A failing step is logged and never stops the run.
"""
import fcntl
import json
import logging
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from logging.handlers import RotatingFileHandler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from collectors.common import DATA_DIR, LOG_DIR, atomic_write_json, data_path, iso, read_json  # noqa: E402

log = logging.getLogger("wi.run")

STORE_FILE = "articles_store.json"
STORE_HOURS = 72
ENGINE_HOURS = 48


# ---------------------------------------------------------------- infrastructure
def setup_logging():
    os.makedirs(LOG_DIR, exist_ok=True)
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s", "%Y-%m-%dT%H:%M:%S")
    fh = RotatingFileHandler(os.path.join(LOG_DIR, "run.log"), maxBytes=1_000_000, backupCount=5, encoding="utf-8")
    fh.setFormatter(fmt)
    root.addHandler(fh)
    if sys.stderr.isatty() or os.environ.get("WI_VERBOSE"):
        sh = logging.StreamHandler()
        sh.setFormatter(fmt)
        root.addHandler(sh)
    logging.getLogger("websocket").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)


@contextmanager
def lock(name):
    """Non-blocking exclusive lock; yields True if acquired, False if another process holds it."""
    os.makedirs(LOG_DIR, exist_ok=True)
    f = open(os.path.join(LOG_DIR, f"{name}.lock"), "w")
    try:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        f.close()
        yield False
        return
    try:
        yield True
    finally:
        try:
            fcntl.flock(f, fcntl.LOCK_UN)
        finally:
            f.close()


def step(name, fn, *args, **kw):
    """Run fn under a per-step lock with timing; swallow and log any exception. Returns fn's result or None."""
    with lock("step_" + name) as ok:
        if not ok:
            log.warning("step %s already running elsewhere; skipped", name)
            return None
        t0 = time.time()
        try:
            res = fn(*args, **kw)
            log.info("step %-14s ok   %6.1fs", name, time.time() - t0)
            return res
        except Exception:
            log.exception("step %-14s FAILED after %.1fs", name, time.time() - t0)
            return None


def utcnow():
    return datetime.now(timezone.utc)


def parse_iso(s):
    try:
        return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------- events.json slimming (solo in scrittura)
EVENTS_CAP = 400            # max eventi scritti in data/events.json (i migliori per global_score)
EVENT_MAX_ARTICLES = 5      # max articoli per evento
EVENT_SUMMARY_MAX = 280     # max caratteri del riassunto
EVENT_ARTICLE_KEYS = ("title", "url", "source", "published_at")
EVENTS_TARGET_BYTES = 600_000   # budget: se superato, scarta gli eventi a punteggio piu basso (min EVENTS_MIN)
EVENTS_MIN = 150
EVENT_MIN_SECTOR_SCORE = 0.2   # settori sotto soglia omessi (il frontend li tratta come 0)
EVENT_MAX_EXPLANATION = 3
EVENT_EXPLANATION_CHARS = 140
EVENT_MAX_COUNTRIES = 5
EVENT_DROP_KEYS = ("global_score_raw",)   # non usato dal frontend


def _round_floats(obj, nd=2):
    """Arrotonda ricorsivamente i float (le coordinate a 2 decimali bastano per il globo)."""
    if isinstance(obj, float):
        return round(obj, nd)
    if isinstance(obj, dict):
        return {k: _round_floats(v, nd) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_round_floats(v, nd) for v in obj]
    return obj


def _truncate(text, limit):
    if not isinstance(text, str) or len(text) <= limit:
        return text
    cut = text[: limit - 1].rsplit(" ", 1)[0].rstrip(" ,;:.-")
    return (cut or text[: limit - 1]) + "\u2026"


def slim_events_doc(doc):
    """Copia ridotta di events_doc per il frontend (schema invariato, meno byte).

    - massimo EVENTS_CAP eventi (top per global_score, ordine originale preservato)
    - massimo EVENT_MAX_ARTICLES articoli per evento, solo title/url/source/published_at
    - summary troncato, float a 2 decimali
    Il doc completo resta in memoria per markets e report.
    """
    events = list(doc.get("events", []))
    total = len(events)
    if total > EVENTS_CAP:
        keep = {id(e) for e in sorted(events, key=lambda e: e.get("global_score") or 0, reverse=True)[:EVENTS_CAP]}
        events = [e for e in events if id(e) in keep]
    slim = []
    for e in events:
        e = dict(e)
        e["summary"] = _truncate(e.get("summary"), EVENT_SUMMARY_MAX)
        e["articles"] = [{k: a.get(k) for k in EVENT_ARTICLE_KEYS if k in a}
                         for a in (e.get("articles") or [])[:EVENT_MAX_ARTICLES] if isinstance(a, dict)]
        for a in e["articles"]:   # titolo identico a quello dell'evento: il frontend usa quello dell'evento
            if a.get("title") == e.get("title"):
                del a["title"]
        if isinstance(e.get("sector_scores"), dict):
            e["sector_scores"] = {k: v for k, v in e["sector_scores"].items()
                                  if isinstance(v, (int, float)) and v >= EVENT_MIN_SECTOR_SCORE}
        e["explanation"] = [_truncate(x, EVENT_EXPLANATION_CHARS) for x in (e.get("explanation") or [])[:EVENT_MAX_EXPLANATION]]
        e["countries"] = (e.get("countries") or [])[:EVENT_MAX_COUNTRIES]
        for k in EVENT_DROP_KEYS:
            e.pop(k, None)
        slim.append(_round_floats(e))
    out = {k: v for k, v in doc.items() if k != "events"}
    # budget in byte: tiene gli eventi con global_score piu alto finche' il file resta sotto EVENTS_TARGET_BYTES
    sizes = {id(e): len(json.dumps(e, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) + 1 for e in slim}
    if sum(sizes.values()) > EVENTS_TARGET_BYTES:
        keep, used = set(), 0
        for e in sorted(slim, key=lambda e: e.get("global_score") or 0, reverse=True):
            if used + sizes[id(e)] > EVENTS_TARGET_BYTES and len(keep) >= EVENTS_MIN:
                break
            keep.add(id(e))
            used += sizes[id(e)]
        slim = [e for e in slim if id(e) in keep]
    out["events"] = slim
    stats = dict(out.get("stats") or {})
    stats["events_total"] = total
    stats["events_written"] = len(slim)
    out["stats"] = stats
    return out


# ---------------------------------------------------------------- articles store + engine
def update_store(new_articles, now):
    """Merge into data/articles_store.json (dedup by id, keep last 72h). Returns the stored list."""
    store = read_json(data_path(STORE_FILE), {}) or {}
    by_id = {a["id"]: a for a in store.get("articles", []) if isinstance(a, dict) and "id" in a}
    for a in new_articles:
        old = by_id.get(a["id"])
        if old is None or len(a.get("summary", "")) > len(old.get("summary", "")):
            by_id[a["id"]] = a
    cutoff = now - timedelta(hours=STORE_HOURS)
    kept = []
    for a in by_id.values():
        dt = parse_iso(a.get("published_at"))
        if dt and dt >= cutoff:
            kept.append(a)
    kept.sort(key=lambda a: a["published_at"], reverse=True)
    atomic_write_json(data_path(STORE_FILE), {"updated_at": iso(now), "window_hours": STORE_HOURS, "articles": kept})
    return kept


def run_engine(articles, telegram, now):
    """events -> markets -> report. Each stage is independent so one failure keeps the others' files."""
    cutoff = now - timedelta(hours=ENGINE_HOURS)
    recent = [a for a in articles if (parse_iso(a.get("published_at")) or now) >= cutoff]
    log.info("engine input: %d articles (last %dh) of %d stored", len(recent), ENGINE_HOURS, len(articles))

    events_doc = None
    try:
        from engine.pipeline import build_events, build_markets
        from engine.report import build_report
    except Exception:
        log.exception("engine import failed; skipping events/markets/report")
        return

    def _events():
        nonlocal events_doc
        events_doc = build_events(recent, now)
        atomic_write_json(data_path("events.json"), slim_events_doc(events_doc))
        log.info("events.json: %d events", len(events_doc.get("events", [])))

    step("build_events", _events)
    if events_doc is None:
        events_doc = read_json(data_path("events.json"))
    if events_doc is None:
        return

    def _markets():
        prev = read_json(data_path("markets.json"))
        doc = build_markets(events_doc, prev, now)
        atomic_write_json(data_path("markets.json"), doc)
        log.info("markets.json: %d sectors, %d countries", len(doc.get("sectors", [])), len(doc.get("countries", [])))

    def _report():
        doc = build_report(events_doc, recent, telegram, now)
        atomic_write_json(data_path("report_daily.json"), doc)
        log.info("report_daily.json: %s stories", len(doc.get("major_stories", [])))

    step("build_markets", _markets)
    step("build_report", _report)


def news_phase():
    from collectors import ansa_ultima_ora, news_rss, telegram

    now = utcnow()
    arts = step("news_rss", news_rss.collect) or []
    ultima = step("ansa_ultima_ora", ansa_ultima_ora.collect)
    if ultima:
        try:
            arts = arts + ansa_ultima_ora.to_articles(ultima, now)
        except Exception:
            log.exception("ansa_ultima_ora conversion failed")
    tg = step("telegram", telegram.collect)
    if tg is None or not tg:
        tg = read_json(data_path("data_telegram.json"), []) or []
    stored = step("articles_store", update_store, arts, now)
    if stored is None:
        stored = (read_json(data_path(STORE_FILE), {}) or {}).get("articles", [])
    run_engine(stored, tg, now)


def adsb_layers():
    from collectors import flights, gpsjam

    step("flights", flights.collect)
    step("gpsjam", gpsjam.collect)


def ships_layer():
    from collectors import ships

    step("ships", ships.collect)


def daily_layers():
    from collectors import firms, nuclear, radiation, satellites

    step("firms", firms.collect)
    step("satellites", satellites.collect)
    step("nuclear", nuclear.collect)
    step("radiation", radiation.collect)


# ---------------------------------------------------------------- jobs
def run_job(job):
    os.makedirs(DATA_DIR, exist_ok=True)
    t0 = time.time()
    log.info("=== job %s start ===", job)
    # network-bound layers run in parallel with the news/engine phase (ships alone listens ~45-60s)
    with ThreadPoolExecutor(max_workers=4) as ex:
        futs = []
        if job in ("fast", "daily", "all"):
            futs.append(ex.submit(adsb_layers))
            futs.append(ex.submit(ships_layer))
        if job in ("daily", "all"):
            futs.append(ex.submit(daily_layers))
        if job in ("news", "fast", "daily", "all"):
            step("news_phase", news_phase)
        for f in futs:
            try:
                f.result()
            except Exception:
                log.exception("layer thread crashed")
    log.info("=== job %s done in %.1fs ===", job, time.time() - t0)


def main(argv):
    jobs = ("fast", "news", "daily", "all")
    if len(argv) != 2 or argv[1] not in jobs:
        print(f"usage: run.py {'|'.join(jobs)}", file=sys.stderr)
        return 2
    job = argv[1]
    setup_logging()
    with lock("job_" + job) as ok:
        if not ok:
            log.warning("job %s already running; exiting", job)
            return 0
        try:
            run_job(job)
        except Exception:
            log.exception("job %s crashed", job)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
