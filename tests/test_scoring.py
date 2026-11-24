import math

from engine import config, scoring as S


def test_sector_scores_follow_sensitivity():
    sc = S.sector_scores("geopolitical_conflict", 7.0, -0.6, [("UA", 0.9)])
    assert set(sc) == set(config.ALL_SECTORS)
    assert sc["energy"] > sc["health_care"]
    assert all(0 <= v <= 1 for v in sc.values())
    assert S.sector_scores("monetary_policy", 6, -0.5, [("US", 1)])["financials"] > S.sector_scores("monetary_policy", 6, -0.5, [("US", 1)])["energy"]


def test_geo_factor_uses_risk():
    assert S.geo_factor([("US", 1.0)]) < S.geo_factor([("IR", 1.0)])
    assert math.isclose(S.geo_factor([]), 1.0 + config.COUNTRY_RISK["default"] / 10.0)


def test_global_score_monotonic_in_severity_and_sources():
    sc = S.sector_scores("geopolitical_conflict", 5, -0.5, [("IR", 1)])
    g1, _ = S.global_score(3.0, sc, [("IR", 1)], 1)
    g2, _ = S.global_score(6.0, sc, [("IR", 1)], 1)
    g3, _ = S.global_score(6.0, sc, [("IR", 1)], 4)
    assert g1 < g2 < g3 <= 100


def test_confidence_bounds():
    assert S.confidence(1, 0.1, False) < S.confidence(5, 0.9, True) <= 1.0


def test_persistence_and_decay():
    assert S.persistence_days("geopolitical_conflict") == 90
    assert S.persistence_days("natural_disaster") < S.persistence_days("sanctions")
    assert S.time_decay(0, "sanctions") == 1.0
    assert S.time_decay(24, "market_shock") < S.time_decay(24, "geopolitical_conflict") < 1.0


def test_config_integrity():
    from engine import geo
    codes = {c["iso2"] for c in geo.all_countries()}
    assert codes <= set(config.COUNTRY_RISK) | {"default"}
    assert set(config.SECTOR_SENSITIVITY) == set(config.ALL_EVENT_TYPES)
    for t, row in config.SECTOR_SENSITIVITY.items():
        assert set(row) == set(config.ALL_SECTORS)
    assert set(config.PERSISTENCE_DAYS) == set(config.ALL_EVENT_TYPES) == set(config.SEVERITY_PRIOR)
    assert len(config.SECTOR_LABELS_IT) == 11 and len(config.EVENT_LABELS_IT) == 15
    assert config.SECTOR_SENSITIVITY["trade_policy"]["materials"] == 1.8
