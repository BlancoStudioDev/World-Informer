from engine import sentiment as S


def test_negative_positive_neutral():
    assert S.sentiment("Missile strike kills 40") < -0.4
    assert S.sentiment("Raid su Beirut, 25 morti") < -0.4
    assert S.sentiment("Peace deal reached, ceasefire holds") > 0.3
    assert S.sentiment("Accordo raggiunto, tregua e ripresa dei colloqui") > 0.3
    assert abs(S.sentiment("Il tram è alla stazione")) < 0.05


def test_range():
    for t in ("war war war killed killed massacre", "peace peace deal success victory", ""):
        assert -1.0 <= S.sentiment(t) <= 1.0
