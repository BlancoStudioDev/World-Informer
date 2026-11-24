"""Scoring degli eventi (formule da News-Evaluator, senza PESTLE). Vedi docs/ARCHITECTURE.md.

    sector[s]   = min(1, CAL_S * sev/10 * SENS[type][s] * geo_factor * (0.5 + 0.5*|sentiment|))
    geo_factor  = 1 + mean(risk)/10                       (media pesata dei rischi paese, default 2.0)
    breadth     = 1 + (n_settori con score > 0.3 - 1)/10
    source_boost= 1 + 0.15 * ln(n_sources)
    global      = 100 * min(1, CAL_G * sev/10 * breadth * geo_factor * source_boost)
    (source_boost include anche un piccolo termine sul numero di articoli del cluster)
    confidence  = 0.5*min(1, n_sources/5) + 0.3*class_conf + 0.2*(paese trovato)
    ranking     = global * exp(-eta_ore / (24 * persistence_scale))

CAL_S / CAL_G (config.SECTOR_SCORE_CALIB / GLOBAL_SCORE_CALIB) sono costanti di calibrazione che evitano
la saturazione a 100 della formula originale mantenendo la discriminazione tra eventi.
"""
from __future__ import annotations

import math

from . import config as C


def country_risk(iso2: str) -> float:
    return C.COUNTRY_RISK.get(iso2, C.COUNTRY_RISK["default"])


def mean_risk(countries) -> float:
    """Rischio medio pesato. ``countries``: lista di (iso2, weight)."""
    tot = sum(w for _, w in countries)
    if tot <= 0:
        return C.COUNTRY_RISK["default"]
    return sum(country_risk(i) * w for i, w in countries) / tot


def geo_factor(countries) -> float:
    return 1.0 + mean_risk(countries) / 10.0


def sector_scores(event_type: str, severity: float, sentiment: float, countries) -> dict:
    sens = C.SECTOR_SENSITIVITY.get(event_type, C.SECTOR_SENSITIVITY["other"])
    gf = geo_factor(countries)
    sf = 0.5 + 0.5 * abs(sentiment)
    out = {}
    for s in C.ALL_SECTORS:
        v = C.SECTOR_SCORE_CALIB * (severity / 10.0) * sens.get(s, 1.0) * gf * sf
        out[s] = round(min(1.0, v), 3)
    return out


def source_boost(n_sources: int, n_articles: int = 1) -> float:
    """1 + 0.15 ln(n_fonti) (formula originale) + COVERAGE_COEF * ln(n_articoli) per premiare le storie molto coperte."""
    return 1.0 + 0.15 * math.log(max(1, n_sources)) + C.COVERAGE_COEF * math.log(max(1, n_articles))


def global_score(severity: float, sectors: dict, countries, n_sources: int, n_articles: int = 1):
    """-> (score 0..100, x non clampato). ``x`` serve da tie-break nel ranking."""
    n_sec = sum(1 for v in sectors.values() if v > 0.3)
    breadth = 1.0 + max(0, n_sec - 1) / 10.0
    x = C.GLOBAL_SCORE_CALIB * (severity / 10.0) * breadth * geo_factor(countries) * source_boost(n_sources, n_articles)
    return round(100.0 * min(1.0, x), 2), x


def confidence(n_sources: int, class_conf: float, has_country: bool) -> float:
    c = 0.5 * min(1.0, n_sources / 5.0) + 0.3 * class_conf + 0.2 * (1.0 if has_country else 0.0)
    return round(max(0.0, min(1.0, c)), 3)


def persistence_days(event_type: str) -> int:
    return C.PERSISTENCE_DAYS.get(event_type, C.PERSISTENCE_DAYS["other"])


def persistence_scale(event_type: str) -> float:
    """Scala di decadimento: eventi che persistono (guerre, clima) decadono piu' lentamente."""
    return 0.75 + 0.25 * math.log(1.0 + persistence_days(event_type) / 7.0)


def time_decay(age_hours: float, event_type: str) -> float:
    return math.exp(-max(0.0, age_hours) / (24.0 * persistence_scale(event_type)))


def top_sectors(sectors: dict, n: int = 3, min_score: float = 0.15) -> list:
    ranked = sorted(sectors.items(), key=lambda kv: (-kv[1], kv[0]))
    return [k for k, v in ranked[:n] if v >= min_score]
