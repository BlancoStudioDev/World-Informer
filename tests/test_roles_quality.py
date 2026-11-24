"""Ruolo geografico (attore vs luogo/bersaglio), titoli generici, opinioni/analisi."""
import time
from datetime import datetime, timezone

import pytest

from engine import config as C
from engine import geo
from engine import quality as Q
from engine.pipeline import build_events

NOW = datetime(2026, 11, 24, 12, 0, tzinfo=timezone.utc)
TS = "2026-11-24T10:00:00Z"


def primary(title, summary="", hint=None):
    return geo.primary_hit(geo.locate(title, summary, hint)).iso2


def art(i, title, summary="", source="BBC", **kw):
    d = {"id": f"a{i}", "title": title, "summary": summary, "url": f"https://x.test/{i}", "source": source,
         "published_at": TS}
    d.update(kw)
    return d


# ---------------------------------------------------------------- 1. attore vs luogo/bersaglio
@pytest.mark.parametrize("title,expected", [
    ("Saudi strikes on Yemen buses and trucks leave 25 dead or missing: Report", "YE"),
    ("Israel kills at least 10 Palestinians over past 24 hours", "PS"),
    ("Il Pakistan bombarda Kabul", "AF"),
    ("Zelenskyy hails Ukraine's attack on a Russian warship docked at a naval base in Libya", "LY"),
    ("Russian strike kills two in Ukraine, days after ship attack off Libya", "UA"),
    ("US strikes Iran nuclear sites", "IR"),
    ("Israele uccide 10 palestinesi a Gaza", "PS"),
    ("La Russia attacca l'Ucraina con droni", "UA"),
    ("Raid dell'Arabia Saudita contro lo Yemen", "YE"),
    ("Spain hit by floods, France sends help", "ES"),
    ("Zelenskyy Confirms Ukraine Hit Russian Ship in Gulf of Finland", "FI"),
    ("Putin warns Kyiv over new missiles", "UA"),
])
def test_primary_is_place_or_target(title, expected):
    assert primary(title) == expected


def test_actor_still_listed_in_countries():
    isos = {h.iso2 for h in geo.locate("Saudi strikes on Yemen buses and trucks leave 25 dead") if h.weight >= 0.3}
    assert {"SA", "YE"} <= isos


def test_weights_unchanged_by_roles():
    # i pesi (countries[]) restano quelli del match lessicale: nome nel titolo = 1.0
    hits = {h.iso2: h for h in geo.locate("Saudi strikes on Yemen")}
    assert hits["YE"].weight == 1.0 and hits["SA"].weight > 0.7


def test_city_beats_actor_country():
    h = geo.primary_hit(geo.locate("Israel strikes Beirut as ceasefire collapses"))
    assert h.iso2 == "LB" and h.point()[2].startswith("Beirut")


def test_single_country_unaffected():
    assert primary("Russian attack kills 2") == "RU"
    assert primary("Il Cremlino respinge la proposta") == "RU"


def test_pipeline_location_target_not_actor():
    arts = [art(1, "Saudi strikes on Yemen buses and trucks leave 25 dead or missing: Report"),
            art(2, "Israel kills at least 10 Palestinians over past 24 hours", source="Guardian"),
            art(3, "Il Pakistan bombarda Kabul", source="ANSA", lang="it"),
            art(4, "Zelenskyy hails Ukraine's attack on a Russian warship docked at a naval base in Libya", source="CNN")]
    doc = build_events(arts, NOW)
    by = {e["articles"][0]["url"].rsplit("/", 1)[1]: e for e in doc["events"]}
    assert by["1"]["location_label"] == "Yemen"
    assert by["2"]["location_label"].endswith("Palestina")
    assert by["3"]["location_label"].endswith("Afghanistan")
    assert by["4"]["location_label"].endswith("Libia")
    assert {c["iso2"] for c in by["1"]["countries"]} >= {"SA", "YE"}
    assert {c["iso2"] for c in by["2"]["countries"]} >= {"IL", "PS"}


# ---------------------------------------------------------------- 2. titoli generici
@pytest.mark.parametrize("title", [
    "Morning update", "Live updates", "Evening briefing", "Newsletter", "Podcast", "Quiz", "Crossword",
    "Oroscopo", "Oroscopo di oggi 24 novembre", "Le notizie del giorno", "Evening briefing - 24 Nov",
    "Watch: Morning update", "Podcast: the week in review", "Quiz of the week: how well do you know Iran?",
])
def test_generic_titles_detected(title):
    assert Q.is_generic(title)


@pytest.mark.parametrize("title", [
    "Israel kills 10 Palestinians", "Live updates from Gaza: ceasefire collapses", "Russian attack kills 2 in Ukraine",
    "Morning update: Iran fires missiles at Israel",
])
def test_news_titles_not_generic(title):
    assert not Q.is_generic(title)


def test_generic_dropped_in_pipeline():
    arts = [art(1, "Morning update", "Iran missile attack kills dozens in Tehran"),
            art(2, "Le notizie del giorno", "Terremoto in Turchia, 200 morti", lang="it"),
            art(3, "Iran missile attack kills dozens in Tehran")]
    doc = build_events(arts, NOW)
    titles = [a["title"] for e in doc["events"] for a in e["articles"]]
    assert "Morning update" not in titles and "Le notizie del giorno" not in titles
    assert doc["stats"]["generic_dropped"] == 2


def test_generic_demote_mode(monkeypatch):
    monkeypatch.setattr(C, "GENERIC_TITLE_ACTION", "demote")
    doc = build_events([art(1, "Morning update", "Iran missile attack kills dozens in Tehran")], NOW)
    assert doc["events"] and doc["events"][0]["severity"] < 3.0


def test_watch_prefix_stripped():
    assert Q.clean_title("Watch: Three people killed in Israeli strike") == "Three people killed in Israeli strike"
    assert Q.clean_title("Video: Missile hits Kyiv") == "Missile hits Kyiv"
    assert Q.clean_title("Guarda: il video dell'attacco") == "il video dell'attacco"
    doc = build_events([art(1, "Watch: Three people killed in Israeli strike near police station in Gaza's Khan Younis")], NOW)
    assert doc["events"][0]["title"].startswith("Three people killed")
    assert not doc["events"][0]["articles"][0]["title"].startswith("Watch")


# ---------------------------------------------------------------- 3. opinioni / analisi
@pytest.mark.parametrize("title", [
    "Myanmar has been found guilty of genocide. Should Israel be worried? – podcast",
    "Opinion: Why the war in Ukraine will not end", "Comment: Trump's Iran gamble",
    "Analisi: cosa cambia dopo l'attacco in Libia", "Editoriale - la guerra infinita",
    "Why has Yemen's offensive against the Houthis stalled?", "L'Italia rischia la recessione?",
])
def test_opinion_detected(title):
    assert Q.is_opinion(title)


@pytest.mark.parametrize("title", [
    "Analysts say Russian attack kills 2 in Ukraine", "Israel kills at least 10 Palestinians",
    "Il Pakistan bombarda Kabul", "Commentators were killed in Gaza strike",
])
def test_not_opinion(title):
    assert not Q.is_opinion(title)


def test_opinion_hint():
    assert Q.is_opinion("Trump and Iran", hint="Opinion")


def test_opinion_severity_factor():
    news = build_events([art(1, "Israeli strike kills 30 in Gaza")], NOW)["events"][0]["severity"]
    op = build_events([art(1, "Israeli strike kills 30 in Gaza - podcast")], NOW)["events"][0]["severity"]
    q = build_events([art(1, "Israeli strike kills 30 in Gaza?")], NOW)["events"][0]["severity"]
    assert op == pytest.approx(news * C.OPINION_SEVERITY_FACTOR, rel=0.02)
    assert q == pytest.approx(news * C.OPINION_SEVERITY_FACTOR, rel=0.02)


def test_opinion_italian_severity_and_representative():
    arts = [art(1, "Analisi: attacco missilistico russo in Ucraina, 40 morti", source="ANSA", lang="it"),
            art(2, "Attacco missilistico russo in Ucraina, 40 morti", source="Corriere", lang="it")]
    ev = build_events(arts, NOW)["events"]
    assert len(ev) == 1
    assert not ev[0]["title"].startswith("Analisi")
    # la notizia vera non viene abbassata dall'opinione che la accompagna
    solo = build_events([arts[1]], NOW)["events"][0]["severity"]
    assert ev[0]["severity"] == pytest.approx(solo)


# ---------------------------------------------------------------- performance
def test_performance_5k_articles():
    titles = ["Saudi strikes on Yemen leave {n} dead", "Israel kills {n} Palestinians in Gaza", "Il Pakistan bombarda Kabul {n}",
              "Morning update {n}", "Opinion: oil prices after Iran talks {n}", "Fed holds rates as inflation hits {n}%",
              "Earthquake magnitude 6.{n} strikes Japan", "Russia attacks Ukraine energy grid, {n} killed"]
    arts = [art(i, titles[i % len(titles)].format(n=i % 97), f"Dettaglio {i % 13} sulla notizia")
            for i in range(5000)]
    t0 = time.time()
    doc = build_events(arts, NOW)
    assert time.time() - t0 < 10
    assert doc["events"]
