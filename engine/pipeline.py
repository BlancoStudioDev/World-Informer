"""Pipeline principale: articoli -> eventi (events.json) -> mercati (markets.json).

Input ``articles``: lista di dict (schema Article: id,title,summary,url,source,lang,published_at,geo_hint).

build_events:
  1. normalizzazione + filtro finestra (48h) + dedup (id, url, fonte+titolo normalizzato);
  2. per articolo: classify, locate, severity, sentiment (cache);
  3. cluster (TF-IDF/union-find, finestra 48h);
  4. per cluster: aggregazione (event_type per voto pesato, severita' = max, paesi = 0.6*max+0.4*media,
     posizione = citta' piu' forte del paese principale, altrimenti centroide);
     titolo rappresentativo = articolo con punteggio autorevolezza fonte (+ lunghezza titolo informativa,
     + anzianita' lieve), cioe' di norma il titolo BBC/Reuters/AP/ANSA piu' completo;
  4b. quality: titoli generici scartati (config.GENERIC_*), prefissi "Watch:" tolti, opinioni/analisi/podcast
     severita' x OPINION_SEVERITY_FACTOR; punto primario = luogo/bersaglio (non l'attore) via geo.primary_hit;
  5. scoring + decadimento temporale; ordinamento per global_score (decaduto) desc, cap 600.
"""
from __future__ import annotations

import hashlib
import math
from datetime import datetime, timezone

from . import classify as K
from . import cluster as CL
from . import config as C
from . import geo as G
from . import quality as Q
from . import scoring as S
from . import sentiment as SE
from . import severity as SV
from . import text as T

MAX_ARTICLES_PER_EVENT = 15
MIN_COUNTRY_WEIGHT = 0.15
MAX_COUNTRIES = 6
CLUSTER_COUNTRY_WEIGHT = 0.3
CASUALTY_SEV = 4.5      # evento 'other' con severita' >= e paese primario con rischio >= -> geopolitical_conflict
CASUALTY_RISK = 6.5


class _Art:
    __slots__ = ("id", "title", "summary", "url", "source", "lang", "ts", "dt", "hint", "etype", "conf", "terms",
                 "cscore", "sev", "sent", "hits", "reasons", "opinion")


def _make_id(a: dict) -> str:
    key = a.get("url") or a.get("title") or ""
    return hashlib.sha1(key.encode("utf-8", "ignore")).hexdigest()[:16]


def _normalize(articles: list[dict], now: datetime, window_hours: float, stats: dict | None = None):
    lo = now.timestamp() - window_hours * 3600.0
    hi = now.timestamp() + 2 * 3600.0
    out: list[_Art] = []
    seen_id, seen_url, seen_title = set(), set(), set()
    for a in articles:
        title = T.strip_html(a.get("title") or "").strip()
        title = Q.clean_title(title)
        if not title:
            continue
        if Q.is_generic(title):
            if stats is not None:
                stats["generic"] = stats.get("generic", 0) + 1
            if C.GENERIC_TITLE_ACTION == "drop":
                continue
            generic = True
        else:
            generic = False
        summary = T.strip_html(a.get("summary") or a.get("content") or "")[:600]
        dt = T.parse_dt(a.get("published_at") or a.get("date"), default=now)
        if dt.timestamp() > hi:
            dt = now
        if dt.timestamp() < lo:
            continue
        aid = str(a.get("id") or _make_id({"url": a.get("url") or a.get("link"), "title": title}))
        url = a.get("url") or a.get("link") or ""
        src = str(a.get("source") or "unknown")
        tkey = (src.lower(), T.normalize(title))
        if aid in seen_id or (url and url in seen_url) or tkey in seen_title:
            continue
        seen_id.add(aid)
        seen_title.add(tkey)
        if url:
            seen_url.add(url)
        r = _Art()
        r.id, r.title, r.summary, r.url, r.source = aid, title, summary, url, src
        r.lang = a.get("lang") or T.detect_lang(title + " " + summary)
        r.dt, r.ts = dt, dt.timestamp()
        r.hint = a.get("geo_hint") or None
        r.opinion = Q.is_opinion(title, r.hint)
        if generic:
            r.opinion = "generic"
        out.append(r)
    return out


def _quality_factor(r: _Art) -> float:
    if r.opinion == "generic":
        return C.GENERIC_TITLE_FACTOR
    return C.OPINION_SEVERITY_FACTOR if r.opinion else 1.0


def _sev_max(members: list[_Art], et: str) -> float:
    return max(SV.severity(m.title, m.summary, et) * _quality_factor(m) for m in members)


def analyze(r: _Art):
    r.etype, r.conf, r.terms = K.classify(r.title, r.summary)
    sc = K.scores(r.title, r.summary)
    r.cscore = sc.get(r.etype, 0.0)
    r.hits = G.locate(r.title, r.summary, r.hint)
    r.sev = SV.severity(r.title, r.summary, r.etype) * _quality_factor(r)
    r.sent = SE.sentiment(r.title, r.summary)


def _authority(source: str) -> float:
    s = source.lower().strip()
    if s in C.SOURCE_AUTHORITY:
        return C.SOURCE_AUTHORITY[s]
    for k, v in C.SOURCE_AUTHORITY.items():
        if k in s:
            return v
    return C.DEFAULT_SOURCE_AUTHORITY


def representative(members: list[_Art]) -> _Art:
    """Articolo rappresentativo: massima autorevolezza della fonte, titolo informativo (~60-110 car.), poi il piu' vecchio."""
    def key(a: _Art):
        info = min(len(a.title), 110) / 110.0
        pen = 0.5 if a.opinion else 0.0   # evita titoli di opinioni/podcast se c'e' una notizia
        return (round(_authority(a.source) + 0.3 * info - pen, 4), -a.ts)
    return max(members, key=key)


def _aggregate_countries(members: list[_Art]):
    n = len(members)
    agg: dict[str, dict] = {}
    for m in members:
        for h in m.hits:
            a = agg.setdefault(h.iso2, {"max": 0.0, "sum": 0.0, "hit": h, "cities": {}, "fmax": 0.0, "fsum": 0.0,
                                        "weak": True, "pos": h.first_pos})
            a["max"] = max(a["max"], h.weight)
            a["sum"] += h.weight
            f = min(2.0, h.focus / G.NORM)
            a["fmax"] = max(a["fmax"], f)
            a["fsum"] += f
            a["weak"] = a["weak"] and h.actor_only
            a["pos"] = min(a["pos"], h.first_pos)
            if h.city:
                c = a["cities"].setdefault(h.city, [0.0, h.city_lat, h.city_lng])
                c[0] += h.city_score
    rows = []
    for iso, a in agg.items():
        w = 0.6 * a["max"] + 0.4 * (a["sum"] / n)
        a["focus"] = 0.6 * a["fmax"] + 0.4 * (a["fsum"] / n)
        rows.append((iso, w, a))
    rows.sort(key=lambda r: (-r[1], r[0]))
    return rows


def _primary_row(rows):
    """Paese dove avviene l'evento: luogo/bersaglio > attore (a parita' di peso minimo)."""
    cand = [r for r in rows if r[1] >= MIN_COUNTRY_WEIGHT]
    if not cand:
        return None
    return max(cand, key=lambda r: (not r[2]["weak"], round(r[2]["focus"], 4), round(r[1], 4), -r[2]["pos"]))


def _event_type(members: list[_Art]):
    votes: dict[str, float] = {}
    for m in members:
        if m.etype != "other":
            votes[m.etype] = votes.get(m.etype, 0.0) + max(m.cscore, 1.0) * _authority(m.source)
    if not votes:
        return "other", sum(m.conf for m in members) / len(members)
    et = sorted(votes.items(), key=lambda kv: (-kv[1], C.ALL_EVENT_TYPES.index(kv[0])))[0][0]
    confs = [m.conf for m in members if m.etype == et]
    return et, sum(confs) / len(confs)


def _build_event(members: list[_Art], cid: str, now: datetime):
    n = len(members)
    et, class_conf = _event_type(members)
    rep = representative(members)
    rows = _aggregate_countries(members)
    countries = [(iso, w) for iso, w, _ in rows if w >= MIN_COUNTRY_WEIGHT][:MAX_COUNTRIES]
    sev = _sev_max(members, et)
    prow = _primary_row(rows)
    pri_iso = prow[0] if prow else None
    if et == "other" and pri_iso and sev >= CASUALTY_SEV and S.country_risk(pri_iso) >= CASUALTY_RISK:
        # bilancio di vittime in un'area ad alto rischio senza altre parole chiave -> conflitto
        et, class_conf = "geopolitical_conflict", 0.35
        sev = _sev_max(members, et)
    sent = sum(m.sent for m in members) / n
    country_out = []
    lat = lng = None
    label = None
    for iso, w in countries:
        country_out.append({"iso2": iso, "name": G.country_name(iso, "it"), "weight": round(w, 2)})
    if prow:
        iso, w, a = prow
        h = a["hit"]
        if a["cities"]:
            cname, (cs, clat, clng) = max(a["cities"].items(), key=lambda kv: kv[1][0])
            lat, lng = clat, clng
            cn = G.country_name(iso, "it")
            label = cn if cname == cn else f"{cname}, {cn}"
        else:
            lat, lng, label = h.lat, h.lng, G.country_name(iso, "it")
    sectors = S.sector_scores(et, sev, sent, countries)
    sources = sorted({m.source for m in members}, key=str.lower)
    n_src = len({m.source.lower() for m in members})
    gscore, x = S.global_score(sev, sectors, countries, n_src, n)
    conf = S.confidence(n_src, class_conf, bool(countries))
    first = min(members, key=lambda m: m.ts)
    last = max(members, key=lambda m: m.ts)
    age_h = max(0.0, (now.timestamp() - last.ts) / 3600.0)
    decay = S.time_decay(age_h, et)
    # spiegazione leggibile
    expl = []
    terms = []
    for m in members:
        if m.etype == et:
            for t in m.terms:
                if t not in terms:
                    terms.append(t)
    if terms:
        expl.append("keyword: " + ", ".join(t.rstrip("*") for t in terms[:5]))
    _, sreasons = SV.explain(rep.title, rep.summary, et)
    if sreasons:
        expl.append("gravita " + f"{sev:.1f}: " + "; ".join(sreasons[:3]))
    if countries:
        iso0 = pri_iso or countries[0][0]
        expl.append(f"paese: {G.country_name(iso0, 'it')} (rischio {S.country_risk(iso0):.1f})")
    expl.append(f"{n_src} font{'e' if n_src == 1 else 'i'}, {n} articol{'o' if n == 1 else 'i'}")
    summary = rep.summary or next((m.summary for m in members if m.summary), "")
    if len(summary) > 320:
        summary = summary[:317].rsplit(" ", 1)[0] + "..."
    arts = sorted(members, key=lambda m: (m.ts, m.id))
    ev = {
        "id": cid,
        "title": rep.title,
        "summary": summary,
        "event_type": et,
        "event_label": K.label_it(et),
        "severity": round(sev, 2),
        "severity_band": SV.band(sev),
        "sentiment": round(sent, 3),
        "global_score": round(gscore * decay, 2),
        "global_score_raw": gscore,
        "confidence": conf,
        "persistence_days": S.persistence_days(et),
        "countries": country_out,
        "lat": lat, "lng": lng,
        "location_label": label,
        "sector_scores": sectors,
        "top_sectors": S.top_sectors(sectors),
        "sources": sources,
        "n_sources": n_src,
        "n_articles": n,
        "articles": [{"title": m.title, "url": m.url, "source": m.source, "published_at": T.iso(m.dt)}
                     for m in arts[:MAX_ARTICLES_PER_EVENT]],
        "first_seen": T.iso(first.dt),
        "last_seen": T.iso(last.dt),
        "explanation": expl,
    }
    return ev, x * decay


def build_events(articles: list[dict], now: datetime | None = None, window_hours: float = C.WINDOW_HOURS,
                 max_events: int = C.MAX_EVENTS) -> dict:
    """Articoli -> documento events.json."""
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    qstats: dict = {}
    arts = _normalize(articles, now, window_hours, qstats)
    for r in arts:
        analyze(r)
    items = [
        CL.Item(id=r.id, title=r.title, summary=r.summary, ts=r.ts, lang=r.lang,
                countries=frozenset(h.iso2 for h in r.hits if h.weight >= CLUSTER_COUNTRY_WEIGHT),
                event_type=r.etype)
        for r in arts
    ]
    groups = CL.cluster(items, window_hours=window_hours)
    events = []
    for g in groups:
        members = [arts[i] for i in g]
        ev, rank_x = _build_event(members, CL.cluster_id(items, g), now)
        events.append((ev, rank_x))
    events.sort(key=lambda e: (-e[0]["global_score"], -e[1], -e[0]["severity"], e[0]["last_seen"], e[0]["id"]))
    events = [e for e, _ in events][:max_events]
    return {
        "generated_at": T.iso(now),
        "window_hours": int(window_hours),
        "events": events,
        "stats": {"articles_in": len(articles), "articles_used": len(arts), "clusters": len(groups),
                  "generic_dropped": qstats.get("generic", 0) if C.GENERIC_TITLE_ACTION == "drop" else 0},
    }


def build_markets(events_doc: dict, prev_markets: dict | None = None, now: datetime | None = None) -> dict:
    """events.json -> markets.json (score settori 0..100 con trend, rischio per paese 0..100)."""
    now = now or datetime.now(timezone.utc)
    events = events_doc.get("events", [])
    prev_sec = {s["sector"]: s.get("score", 0.0) for s in (prev_markets or {}).get("sectors", [])}

    raw = {s: 0.0 for s in C.ALL_SECTORS}
    contrib: dict[str, list] = {s: [] for s in C.ALL_SECTORS}
    for e in events:
        w = e.get("global_score", 0.0) / 100.0
        if w <= 0:
            continue
        for s, v in e.get("sector_scores", {}).items():
            if s in raw and v > 0:
                raw[s] += w * v
                contrib[s].append((w * v, e["id"]))
    sectors = []
    for s in C.ALL_SECTORS:
        score = round(100.0 * (1.0 - math.exp(-raw[s] / C.MARKET_SECTOR_K)), 1)
        p = prev_sec.get(s)
        trend = "flat"
        if p is not None:
            d = score - p
            trend = "up" if d >= C.TREND_DELTA else ("down" if d <= -C.TREND_DELTA else "flat")
        top = [i for _, i in sorted(contrib[s], key=lambda t: (-t[0], t[1]))[:3]]
        sectors.append({"sector": s, "label": C.SECTOR_LABELS_IT[s], "score": score, "trend": trend, "top_events": top})

    act: dict[str, float] = {}
    nev: dict[str, int] = {}
    for e in events:
        w = e.get("global_score", 0.0) / 100.0
        sev = e.get("severity", 0.0) / 10.0
        for c in e.get("countries", []):
            iso = c["iso2"]
            act[iso] = act.get(iso, 0.0) + w * c["weight"] * (0.5 + 0.5 * sev)
            if c["weight"] >= 0.3:
                nev[iso] = nev.get(iso, 0) + 1
    countries = []
    for c in G.all_countries():
        iso = c["iso2"]
        if iso == "EU":
            continue
        base = S.country_risk(iso) * 10.0
        activity = 100.0 * (1.0 - math.exp(-act.get(iso, 0.0) / C.MARKET_COUNTRY_K))
        risk = 0.3 * base + 0.7 * activity
        countries.append({"iso2": iso, "name": c["name_it"], "risk_score": round(risk, 1), "n_events": nev.get(iso, 0),
                          "lat": c["lat"], "lng": c["lng"]})
    countries.sort(key=lambda r: (-r["risk_score"], r["iso2"]))
    return {"generated_at": T.iso(now), "sectors": sectors, "countries": countries}
