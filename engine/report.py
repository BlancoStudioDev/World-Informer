"""Report giornaliero (24h) compatibile con il modale report del frontend (js/script.js).

Chiavi: generated_at (epoch s), total_count, day_at_glance{total_articles, peak_hour{slot,count}, timeline[{slot,count}],
geo_focus[{region,mentions}], categories[{name,score}], domestic_vs_international{italia,international}},
major_stories[{headline,count,source,related[],link}], sources_volume{source:n}, latest_headlines[{title,link,source}].
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone

from . import classify as K
from . import geo as G
from . import text as T

try:
    from zoneinfo import ZoneInfo
    _TZ = ZoneInfo("Europe/Rome")
except Exception:  # tzdata assente
    _TZ = timezone.utc

CATEGORY_OF_TYPE = {
    "geopolitical_conflict": "Geopolitica", "sanctions": "Geopolitica",
    "trade_policy": "Economia", "monetary_policy": "Economia", "fiscal_policy": "Economia", "market_shock": "Economia",
    "corporate_event": "Economia", "supply_chain_disruption": "Economia",
    "regulatory_change": "Politica", "labor_social": "Società",
    "technology_disruption": "Tecnologia",
    "natural_disaster": "Emergenze", "pandemic_health": "Emergenze", "environmental_climate": "Emergenze",
    "other": "Cronaca e società",
}
# regioni "focus": paesi singoli rilevanti + macro-regioni
FOCUS_COUNTRIES = {"IT": "Italia", "US": "USA", "RU": "Russia", "CN": "Cina"}
FOCUS_REGIONS = {"europe": "Europa", "middle_east": "Medio Oriente", "asia": "Asia", "africa": "Africa",
                 "americas": "Americhe", "oceania": "Oceania"}


def _slot(dt: datetime) -> str:
    h = dt.astimezone(_TZ).hour
    a = (h // 3) * 3
    return f"{a:02d}:00-{a + 2:02d}:59"


def _title_of(a: dict) -> str:
    return T.strip_html(a.get("title") or a.get("text") or "")[:160]


def _prepare(articles: list[dict], telegram: list[dict], now: datetime):
    lo = now - timedelta(hours=24)
    out = []
    for a in articles or []:
        dt = T.parse_dt(a.get("published_at") or a.get("date"), default=now)
        if dt < lo or dt > now + timedelta(hours=2):
            continue
        out.append({"title": _title_of(a), "summary": T.strip_html(a.get("summary") or a.get("content") or "")[:400],
                    "link": a.get("url") or a.get("link") or "", "source": str(a.get("source") or "unknown"), "dt": dt,
                    "hint": a.get("geo_hint")})
    for t in telegram or []:
        dt = T.parse_dt(t.get("date") or t.get("published_at"), default=now)
        if dt < lo or dt > now + timedelta(hours=2):
            continue
        out.append({"title": _title_of(t), "summary": "", "link": t.get("url") or "", "source": "telegram", "dt": dt, "hint": None})
    return [o for o in out if o["title"]]


def build_report(events_doc: dict, articles: list[dict], telegram: list[dict] | None = None,
                 now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    items = _prepare(articles, telegram or [], now)
    if not items:
        return {"generated_at": int(now.timestamp()), "total_count": 0, "day_at_glance": None, "major_stories": [],
                "sources_volume": {}, "latest_headlines": []}

    # --- Day at a glance
    slots = Counter(_slot(i["dt"]) for i in items)
    peak = slots.most_common(1)[0]
    timeline = [{"slot": s, "count": c} for s, c in sorted(slots.items())]
    geo_mentions: Counter = Counter()
    cats: Counter = Counter()
    for i in items:
        hits = G.locate(i["title"], i["summary"], i["hint"])
        seen = set()
        for h in hits:
            if h.weight < 0.3:
                continue
            lab = FOCUS_COUNTRIES.get(h.iso2) or FOCUS_REGIONS.get(h.region)
            if h.iso2 == "EU":
                lab = "Europa"
            if lab and lab not in seen:
                seen.add(lab)
                geo_mentions[lab] += 1
        et = K.classify(i["title"], i["summary"])[0]
        cats[CATEGORY_OF_TYPE.get(et, "Cronaca e società")] += 1
    geo_focus = [{"region": r, "mentions": c} for r, c in geo_mentions.most_common(6)]
    categories = [{"name": n, "score": c} for n, c in cats.most_common()]
    italia = geo_mentions.get("Italia", 0)
    intl = sum(v for k, v in geo_mentions.items() if k != "Italia")

    glance = {
        "total_articles": len(items),
        "peak_hour": {"slot": peak[0], "count": peak[1]},
        "timeline": timeline,
        "geo_focus": geo_focus,
        "categories": categories,
        "domestic_vs_international": {"italia": italia, "international": intl},
    }

    # --- Major stories: top eventi (global_score) con attivita' nelle ultime 24h
    stories = []
    lo = now - timedelta(hours=24)
    for e in sorted(events_doc.get("events", []), key=lambda e: -e.get("global_score", 0)):
        last = T.parse_dt(e.get("last_seen"), default=now)
        if last < lo:
            continue
        arts = e.get("articles", [])
        rep = next((a for a in arts if a.get("title") == e.get("title")), arts[0] if arts else {})
        related = [a["title"] for a in arts if a.get("title") != e.get("title")][:3]
        stories.append({
            "headline": e.get("title"),
            "count": e.get("n_sources", 1),
            "source": rep.get("source", (e.get("sources") or ["?"])[0]),
            "related": related,
            "link": rep.get("url") or "",
            "event_id": e.get("id"),
            "event_type": e.get("event_type"),
            "severity": e.get("severity"),
            "global_score": e.get("global_score"),
            "location_label": e.get("location_label"),
        })
        if len(stories) >= 5:
            break

    volume = Counter(i["source"] for i in items)
    latest = sorted(items, key=lambda i: i["dt"], reverse=True)[:10]
    return {
        "generated_at": int(now.timestamp()),
        "total_count": len(items),
        "day_at_glance": glance,
        "major_stories": stories,
        "sources_volume": dict(volume),
        "latest_headlines": [{"title": i["title"], "link": i["link"], "source": i["source"]} for i in latest],
    }
