import pytest

from engine import classify
from engine.config import ALL_EVENT_TYPES
import json, os


@pytest.mark.parametrize("title,expected", [
    ("Missile strike kills 40 in Kharkiv", "geopolitical_conflict"),
    ("Raid israeliano su Beirut: 12 morti", "geopolitical_conflict"),
    ("Iran, nuovi bombardamenti ed esplosioni in tutto il Paese", "geopolitical_conflict"),
    ("Trump announces new tariffs on EU steel", "trade_policy"),
    ("Dazi Usa, la Ue prepara la risposta", "trade_policy"),
    ("Fed cuts interest rates by 25 basis points", "monetary_policy"),
    ("La Bce lascia i tassi invariati, Lagarde cauta", "monetary_policy"),
    ("EU adopts new sanctions package against Russia", "sanctions"),
    ("Nuove sanzioni Usa contro la flotta ombra russa", "sanctions"),
    ("Ebola outbreak declared in Congo", "pandemic_health"),
    ("Focolaio di morbillo, 30 nuovi casi in Lombardia", "pandemic_health"),
    ("Earthquake of magnitude 7.1 hits Japan", "natural_disaster"),
    ("Alluvione in Emilia, migliaia di sfollati", "natural_disaster"),
    ("Borsa: Europa chiude in calo, in fumo 116 miliardi", "market_shock"),
    ("Stocks plunge as oil prices surge", "market_shock"),
    ("Nvidia unveils new AI chip as hackers target cloud", "technology_disruption"),
    ("Sciopero generale dei trasporti, treni fermi", "labor_social"),
    ("Cop30: accordo sul clima, emissioni di CO2 e rinnovabili", "environmental_climate"),
    ("Intel to acquire rival in $5bn merger as CEO steps down", "corporate_event"),
    ("Legge di bilancio: manovra, taglio delle tasse e deficit", "fiscal_policy"),
    ("Antitrust fines Google over new regulation breach", "regulatory_change"),
    ("Ships stranded as Suez canal shortage hits supply chains", "supply_chain_disruption"),
    ("Sinner batte Alcaraz in finale", "other"),
    ("Svelato il cast del Gf Vip", "other"),
])
def test_event_type(title, expected):
    et, conf, terms = classify.classify(title, "")
    assert et == expected, (et, terms)
    assert 0 < conf <= 1


def test_returns_matched_terms():
    et, conf, terms = classify.classify("Trump announces new tariffs on EU steel", "")
    assert any("tariff" in t for t in terms)


def test_unknown_is_other_low_conf():
    et, conf, terms = classify.classify("Qual e' la capitale", "")
    assert et == "other" and conf < 0.5 and terms == []


def test_summary_contributes():
    et, _, _ = classify.classify("Verso il vertice", "Si discute di dazi e guerra commerciale con la Cina")
    assert et == "trade_policy"


def test_lexicon_size_and_labels():
    path = os.path.join(os.path.dirname(classify.__file__), "data", "event_lexicon.json")
    doc = json.load(open(path, encoding="utf-8"))
    assert set(doc["types"]) == set(ALL_EVENT_TYPES)
    for t, terms in doc["types"].items():
        assert len(terms) >= 30, t
    assert set(doc["labels_it"]) == set(ALL_EVENT_TYPES)
    assert classify.label_it("sanctions") == "Sanzioni"


def test_stems_and_accents():
    assert classify.classify("Tariffs and counter-tariffs escalate", "")[0] == "trade_policy"
    assert classify.classify("SANZIONI contro l'Iran: e' l'ora delle SANZIONI", "")[0] == "sanctions"
