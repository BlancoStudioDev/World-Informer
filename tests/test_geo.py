import pytest

from engine import geo


def top(title, summary="", hint=None, n=1):
    return [h.iso2 for h in geo.locate(title, summary, hint)[:n]]


def isos(title, summary=""):
    return {h.iso2 for h in geo.locate(title, summary) if h.weight >= 0.3}


def test_gazetteer_coverage():
    cs = geo.all_countries()
    assert len(cs) >= 195
    codes = {c["iso2"] for c in cs}
    for c in ("IT", "US", "RU", "UA", "IL", "PS", "XK", "TW", "HK", "EU", "VA", "KP", "KR", "CD", "CG"):
        assert c in codes
    for c in cs:
        assert -90 <= c["lat"] <= 90 and -180 <= c["lng"] <= 180
        assert c["region"] in {"europe", "americas", "asia", "middle_east", "africa", "oceania"}
        assert c["name_it"] and c["name_en"]


@pytest.mark.parametrize("title,expected", [
    ("Missile hits Kyiv as Zelensky urges allies", "UA"),
    ("Putin e Xi Jinping si incontrano a Pechino", "CN"),
    ("Il Cremlino respinge la proposta", "RU"),
    ("Netanyahu vows to continue offensive", "IL"),
    ("Casa Bianca: Trump firma l'ordine", "US"),
    ("Iranian missile hits tanker near Hormuz", "IR"),
    ("Raid iraniano contro basi americane", "IR"),
    ("Meloni a Palazzo Chigi incontra Tajani", "IT"),
    ("Hamas e Israele: tregua a Gaza", "PS"),
])
def test_top_country(title, expected):
    got = geo.locate(title)
    assert got and expected in [h.iso2 for h in got[:2]], got


def test_italian_demonyms_and_gender_forms():
    for w in ("iraniano", "iraniana", "iraniani", "iraniane"):
        assert top(f"Il governo {w} annuncia") == ["IR"], w
    for w in ("ucraino", "ucraina", "ucraini", "ucraine"):
        assert "UA" in isos(f"Le forze {w} avanzano") or w == "ucraina"  # 'ucraina' = paese


def test_city_point_and_label():
    h = geo.locate("Esplosioni a Kharkiv, la citta' sotto attacco")[0]
    assert h.iso2 == "UA"
    lat, lng, label = h.point()
    assert abs(lat - 49.99) < 0.5 and abs(lng - 36.23) < 0.5
    assert label.endswith("Ucraina") and "," in label


def test_country_only_uses_centroid():
    h = geo.locate("Elections in Brazil next week")[0]
    assert h.iso2 == "BR" and h.city is None
    lat, lng, label = h.point()
    assert label == "Brasile" and -35 < lat < 6 and -75 < lng < -30


def test_us_and_ambiguous_georgia():
    assert top("Georgia Senate runoff in Atlanta draws record turnout") == ["US"]
    assert top("Protests in Tbilisi as Georgia's government suspends EU talks") == ["GE"]
    assert top("Georgia: proteste a Tbilisi contro il governo") == ["GE"]


def test_jordan_person_vs_country():
    assert "JO" not in isos("Michael Jordan documentary breaks viewing records")
    assert "JO" not in isos("Jordan Bardella attacca il governo")
    assert "JO" in isos("King of Jordan meets Trump")
    assert top("La Giordania chiude il confine") == ["JO"]


def test_chad_person_vs_country():
    assert "TD" not in isos("Chad Smith joins band for reunion tour")
    assert "TD" in isos("Army attack in Chad leaves dozens dead")
    assert "TD" in isos("Ciad, golpe sventato a N'Djamena")


def test_turkey_country_vs_food():
    assert "TR" not in isos("Thanksgiving turkey prices rise")
    assert "TR" in isos("Turkey and Syria hit by earthquake")
    assert top("Erdogan: la Turchia pronta a mediare") == ["TR"]
    assert top("Türkiye summons Iranian ambassador") == ["TR"]


def test_niger_vs_nigeria():
    assert top("Niger junta expels ambassador") == ["NE"]
    assert top("Nigeria floods displace thousands") == ["NG"]
    s = isos("Niger and Nigeria agree on border patrols")
    assert {"NE", "NG"} <= s


def test_guinea_family():
    assert top("Papua New Guinea landslide") == ["PG"]
    assert top("Equatorial Guinea elections") == ["GQ"]
    assert top("Guinea-Bissau coup attempt") == ["GW"]
    assert top("Guinea junta leader sworn in") == ["GN"]


def test_sudan_south_sudan():
    assert top("South Sudan oil exports halted") == ["SS"]
    assert top("Sud Sudan, scontri a Juba") == ["SS"]
    assert top("Sudan army retakes Khartoum") == ["SD"]


def test_dominica_vs_dominican():
    assert top("Dominican Republic braces for hurricane") == ["DO"]
    assert top("Dominica wins aid after storm") == ["DM"]


def test_korea_disambiguation():
    assert top("North Korea fires ballistic missile") == ["KP"]
    assert top("Pyongyang lancia un missile") == ["KP"]
    assert top("Corea del Nord, nuovo test") == ["KP"]
    assert top("South Korea holds military drill") == ["KR"]
    assert {"KR", "JP"} <= isos("South Korea and Japan hold talks")
    assert top("Seoul raises alert") == ["KR"]
    assert top("Korea exports hit record") == ["KR"]
    assert top("Corea del Sud: Yoon incriminato") == ["KR"]


def test_congo_both():
    h = {x.iso2: x.weight for x in geo.locate("Congo: M23 rebels take Goma")}
    assert h["CD"] > h.get("CG", 0)
    assert top("Brazzaville hosts summit") == ["CG"]
    assert top("Democratic Republic of the Congo declares Ebola outbreak") == ["CD"]


def test_eu_and_institutions():
    assert top("Lagarde: la BCE lascia i tassi invariati") == ["EU"]
    assert "US" in isos("Fed holds rates steady as Powell warns on tariffs")
    assert "EU" in isos("Von der Leyen presenta il piano della Commissione europea")


def test_new_mexico_is_us_not_mexico():
    assert top("New Mexico governor declares emergency") == ["US"]
    assert top("Messico: Sheinbaum annuncia nuove misure") == ["MX"]


def test_munich_vs_monaco():
    assert "DE" in isos("Bayern Monaco batte l'Inter")
    assert "DE" in isos("Conferenza di Monaco: Vance attacca l'Europa")
    assert top("Principato di Monaco, Gran Premio") == ["MC"]


def test_title_weighs_more_than_summary():
    in_summary = {h.iso2: h.weight for h in geo.locate("Markets slide", "Investors worry about Germany.")}
    in_title = {h.iso2: h.weight for h in geo.locate("Germany markets slide", "Investors worry.")}
    assert in_title["DE"] > in_summary["DE"]
    assert in_title["DE"] == 1.0


def test_geo_hint_adds_weight():
    base = {h.iso2: h.weight for h in geo.locate("Elections announced", "")}
    hinted = {h.iso2: h.weight for h in geo.locate("Elections announced", "", hint="Africa Nigeria")}
    assert "NG" in hinted and "NG" not in base


def test_accents_and_apostrophes():
    assert top("Dell'Ucraina l'attacco, nell'Iran la risposta") in (["UA"], ["IR"])
    assert top("Citta del Messico, terremoto") == ["MX"]
    assert top("U.S. forces strike targets") == ["US"]


def test_no_countries():
    assert geo.locate("Il tram esce dai binari") == []
    assert geo.primary_point([]) is None
