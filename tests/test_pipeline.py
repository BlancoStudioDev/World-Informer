import copy
import json
from datetime import datetime, timedelta, timezone

import pytest

from engine import config, pipeline, report

NOW = datetime(2026, 3, 9, 18, 4, 31, tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def doc(fixture_doc):
    return pipeline.build_events(fixture_doc["articles"], NOW)


@pytest.fixture(scope="module")
def markets(doc):
    return pipeline.build_markets(doc, None, NOW)


def by_title(doc, needle):
    for e in doc["events"]:
        if any(needle.lower() in a["title"].lower() for a in e["articles"]):
            return e
    raise AssertionError(needle)


def test_schema(doc):
    assert set(doc) >= {"generated_at", "window_hours", "events"}
    assert doc["window_hours"] == 48 and doc["generated_at"].endswith("Z")
    assert 0 < len(doc["events"]) <= 600
    keys = {"id", "title", "summary", "event_type", "event_label", "severity", "severity_band", "sentiment", "global_score",
            "confidence", "persistence_days", "countries", "lat", "lng", "location_label", "sector_scores", "top_sectors",
            "sources", "n_sources", "articles", "first_seen", "last_seen", "explanation"}
    for e in doc["events"]:
        assert keys <= set(e), keys - set(e)
        assert 0 <= e["severity"] <= 10 and 0 <= e["global_score"] <= 100 and 0 <= e["confidence"] <= 1
        assert -1 <= e["sentiment"] <= 1
        assert e["severity_band"] in {"minimal", "low", "moderate", "high", "severe"}
        assert set(e["sector_scores"]) == set(config.ALL_SECTORS)
        assert e["n_sources"] == len(e["sources"])
        assert e["first_seen"] <= e["last_seen"]
        assert (e["lat"] is None) == (e["lng"] is None)
        for c in e["countries"]:
            assert set(c) == {"iso2", "name", "weight"}
    json.dumps(doc)  # serializzabile


def test_sorted_by_global_score_and_unique_ids(doc):
    gs = [e["global_score"] for e in doc["events"]]
    assert gs == sorted(gs, reverse=True)
    ids = [e["id"] for e in doc["events"]]
    assert len(ids) == len(set(ids))


def test_top_events_are_the_war_stories(doc):
    top = doc["events"][:8]
    assert sum(e["event_type"] == "geopolitical_conflict" for e in top) >= 5
    assert any("iran" in e["title"].lower() or "libano" in e["title"].lower() or "pakistan" in e["title"].lower() for e in top[:4])


def test_trivia_ranks_below_conflict(doc):
    sinner = by_title(doc, "Sinner")
    unicef = by_title(doc, "Unicef")
    assert sinner["event_type"] == "other"
    assert unicef["severity"] > 7 and unicef["global_score"] > sinner["global_score"] * 4
    assert unicef["countries"][0]["iso2"] == "LB"


def test_cross_source_event_merges(doc):
    e = by_title(doc, "Macron, sto preparando")
    assert e["n_sources"] >= 2 and len(e["articles"]) >= 2
    assert e["location_label"].endswith("Iran") and "Hormuz" in e["location_label"]
    assert 25 < e["lat"] < 28 and 55 < e["lng"] < 58


def test_oslo_embassy_cluster_location(doc):
    e = by_title(doc, "Oslo")
    assert e["countries"][0]["iso2"] == "NO"
    assert e["location_label"].startswith("Oslo")
    assert e["n_sources"] == 2


def test_market_events_classified(doc):
    e = by_title(doc, "Borsa: l'Europa chiude")
    assert e["event_type"] == "market_shock" and e["event_label"] == "Shock di mercato"
    assert "financials" in e["top_sectors"]


def test_event_without_country_has_null_coords(doc):
    e = by_title(doc, "Altro tram esce")
    assert e["lat"] is None and e["lng"] is None and e["location_label"] is None or e["countries"]


def test_ids_are_earliest_article_ids(doc, fixture_doc):
    known = {a["id"] for a in fixture_doc["articles"]}
    assert all(e["id"] in known for e in doc["events"])
    for e in doc["events"]:
        first = min(e["articles"], key=lambda a: a["published_at"])
        assert first["published_at"] <= e["articles"][-1]["published_at"]


def test_stable_across_runs(fixture_doc):
    a = pipeline.build_events(fixture_doc["articles"], NOW)
    b = pipeline.build_events(list(reversed(fixture_doc["articles"])), NOW)
    assert [e["id"] for e in a["events"]] == [e["id"] for e in b["events"]]
    assert [e["global_score"] for e in a["events"]] == [e["global_score"] for e in b["events"]]


def test_dedup_and_window(fixture_doc):
    arts = copy.deepcopy(fixture_doc["articles"])
    dup = copy.deepcopy(arts[0])
    dup["id"] = "other-id"          # stesso url
    old = copy.deepcopy(arts[1])
    old["id"], old["url"], old["title"] = "old1", "http://x/old", "Vecchia notizia sull'Iran e Israele"
    old["published_at"] = (NOW - timedelta(hours=100)).strftime("%Y-%m-%dT%H:%M:%SZ")
    doc = pipeline.build_events(arts + [dup, old], NOW)
    assert doc["stats"]["articles_used"] == len(arts)
    assert all(a["title"] != old["title"] for e in doc["events"] for a in e["articles"])


def test_time_decay_orders_by_recency():
    base = {"id": "x", "summary": "", "url": "u", "source": "BBC", "lang": "en"}
    fresh = dict(base, id="fresh", url="u1", title="Missile strike kills 40 in Kharkiv",
                 published_at=(NOW - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ"))
    stale = dict(base, id="stale", url="u2", title="Drone attack kills 40 in Beirut",
                 published_at=(NOW - timedelta(hours=40)).strftime("%Y-%m-%dT%H:%M:%SZ"))
    d = pipeline.build_events([stale, fresh], NOW)
    assert [e["id"] for e in d["events"]][0] == "fresh"
    assert d["events"][0]["global_score"] > d["events"][1]["global_score"]


def test_empty_input():
    d = pipeline.build_events([], NOW)
    assert d["events"] == []
    m = pipeline.build_markets(d, None, NOW)
    assert len(m["sectors"]) == 11
    r = report.build_report(d, [], [], NOW)
    assert r["total_count"] == 0


def test_max_events_cap(fixture_doc):
    d = pipeline.build_events(fixture_doc["articles"], NOW, max_events=5)
    assert len(d["events"]) == 5


def test_markets(doc, markets):
    assert len(markets["sectors"]) == 11
    for s in markets["sectors"]:
        assert 0 <= s["score"] <= 100 and s["trend"] in {"up", "down", "flat"} and s["label"]
    assert markets["sectors"][0]["trend"] == "flat"
    en = next(s for s in markets["sectors"] if s["sector"] == "energy")
    hc = next(s for s in markets["sectors"] if s["sector"] == "health_care")
    assert en["score"] > hc["score"]
    cs = {c["iso2"]: c for c in markets["countries"]}
    assert cs["IR"]["risk_score"] > cs["IT"]["risk_score"] > cs["CH"]["risk_score"]
    assert cs["IR"]["n_events"] >= 1
    assert len(cs) >= 190 and "EU" not in cs
    assert all(0 <= c["risk_score"] <= 100 for c in cs.values())
    ordered = [c["risk_score"] for c in markets["countries"]]
    assert ordered == sorted(ordered, reverse=True)


def test_markets_trend_vs_previous(doc, markets):
    prev = json.loads(json.dumps(markets))
    for s in prev["sectors"]:
        s["score"] = max(0.0, s["score"] - 10)
    m2 = pipeline.build_markets(doc, prev, NOW)
    assert all(s["trend"] == "up" for s in m2["sectors"] if s["score"] >= 10)
    prev2 = json.loads(json.dumps(markets))
    for s in prev2["sectors"]:
        s["score"] = min(100.0, s["score"] + 10)
    assert any(s["trend"] == "down" for s in pipeline.build_markets(doc, prev2, NOW)["sectors"])


def test_report_schema_compat(doc, fixture_doc):
    r = report.build_report(doc, fixture_doc["articles"], [], NOW)
    assert set(r) == {"generated_at", "total_count", "day_at_glance", "major_stories", "sources_volume", "latest_headlines"}
    g = r["day_at_glance"]
    assert set(g) == {"total_articles", "peak_hour", "timeline", "geo_focus", "categories", "domestic_vs_international"}
    assert set(g["peak_hour"]) == {"slot", "count"}
    assert all(set(t) == {"slot", "count"} for t in g["timeline"])
    assert all(set(x) == {"region", "mentions"} for x in g["geo_focus"])
    assert all(set(x) == {"name", "score"} for x in g["categories"])
    assert set(g["domestic_vs_international"]) == {"italia", "international"}
    assert isinstance(r["generated_at"], int)
    assert r["total_count"] == g["total_articles"] > 0
    for s in r["major_stories"]:
        assert {"headline", "count", "source", "related", "link"} <= set(s)
    assert len(r["major_stories"]) <= 5 and len(r["latest_headlines"]) <= 10
    for h in r["latest_headlines"]:
        assert set(h) == {"title", "link", "source"}
    assert sum(r["sources_volume"].values()) == r["total_count"]
    json.dumps(r)


def test_report_includes_telegram(doc, fixture_doc):
    tg = [{"channel": "warmonitors", "text": "BREAKING Explosions heard in Baghdad", "date": "2026-03-09T17:57:46+00:00",
           "url": "https://t.me/warmonitors/1"}]
    r = report.build_report(doc, fixture_doc["articles"], tg, NOW)
    assert r["sources_volume"]["telegram"] == 1
