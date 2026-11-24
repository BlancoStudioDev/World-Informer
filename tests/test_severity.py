import pytest

from engine import classify, severity


def sev(title, summary=""):
    et = classify.classify(title, summary)[0]
    return severity.severity(title, summary, et)


def test_attack_with_deaths_beats_talks():
    assert sev("Missile strike kills 40 in Kharkiv") > sev("Talks resume between Iran and US") + 3


def test_more_deaths_more_severe():
    assert sev("Airstrike kills 3 in Gaza") < sev("Airstrike kills 30 in Gaza") < sev("Airstrike kills 300 in Gaza")


def test_italian_deaths():
    assert sev("Raid su Beirut, almeno 25 morti") > sev("Raid su Beirut")


def test_earthquake_magnitude_scaling():
    assert sev("Terremoto di magnitudo 7.1 in Giappone") > sev("Terremoto di magnitudo 4.5 in Giappone")


def test_ceasefire_reduces():
    assert sev("Israel and Hezbollah agree ceasefire, talks continue") < sev("Israel and Hezbollah war escalates")


def test_market_percentage_move():
    assert sev("Borsa: Tokyo crolla del 6%") > sev("Borsa: Tokyo cala dello 0,3%")


def test_bounds_and_types():
    for t in ("Nuclear war: thousands killed in catastrophic massacre, hundreds of thousands displaced", "", "ok"):
        s = severity.severity(t, "", "geopolitical_conflict")
        assert 0.0 <= s <= 10.0
    assert severity.severity("Plane crash kills 1,200 people, worst disaster on record", "", "natural_disaster") >= 9.0


def test_money_and_years_not_victims():
    assert severity.extract_deaths("orso ucciso, chiesti 300mila euro") == 0
    assert severity.extract_deaths("la strage del 1985 si poteva evitare") == 0
    assert severity.extract_deaths("killed 40 people") == 40
    assert severity.extract_deaths("83 bambini uccisi") == 83


def test_obituary_not_severe():
    assert sev("E' morto Antonio Tejero, il volto del golpe del 1981") < 6.0


def test_band_names():
    assert severity.band(0.5) == "minimal"
    assert severity.band(3.0) == "low"
    assert severity.band(5.0) == "moderate"
    assert severity.band(7.0) == "high"
    assert severity.band(9.0) == "severe"


def test_explain_reasons():
    s, reasons = severity.explain("Missile strike kills 40 in Kharkiv", "", "geopolitical_conflict")
    assert s > 7 and any("vittime" in r for r in reasons)
