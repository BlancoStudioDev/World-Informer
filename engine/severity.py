"""Severita' 0..10: prior per tipo + boost lessicali - attenuatori.

* vittime: numero estratto via regex, scala logaritmica (+2*log10(n+1), max +4.5); quantificatori
  vaghi ("dozens", "decine") valgono ~24, "hundreds/centinaia" ~250, "thousands/migliaia" ~2500.
* terremoti: magnitudo -> +1.2*(M-4) (max +4.5).
* mercati: variazione % nel titolo -> +0.35 per punto (max +3).
* boost lessicali (guerra, nucleare, massacro, crollo, record, emergenza, ...), max +3.
* attenuatori (colloqui, accordo, tregua, potrebbe, ...), max -3.
"""
from __future__ import annotations

import math
import re
from functools import lru_cache

from . import text as T
from .config import SEVERITY_BANDS, SEVERITY_PRIOR

_NUM = r"(?<![\w.,])(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)"
_DEATH = (r"(?:dead|killed|deaths?|died|dies|fatalities|casualties|victims|morti|mort[oae]|vittime|uccis[oei]|uccise|decessi|"
          r"dispersi|missing)")
_HURT = r"(?:feriti|wounded|injured|ferite|ferito|hurt)"
_DEATH_STRONG = r"(?:dead|killed|deaths?|died|fatalities|morti|mort[oae]|vittime|uccis[oei]|uccise|decessi)"
# "40 killed", "40 people killed", "almeno 12 morti", "12 civili uccisi"
_UNITS = r"(?!\s*(?:mila|migliaia|k\b|euro|eur|dollar|dollari|usd|milion\w*|miliard\w*|million|billion|bn\b|mln|mld|%|per cento|percent|anni|years|year|chili|kg|km|metri|mq))"
_RX_NUM_BEFORE = re.compile(_NUM + _UNITS + r"\s+(?:[a-z]+\s+){0,2}?" + _DEATH + r"\b")
_RX_HURT_BEFORE = re.compile(_NUM + _UNITS + r"\s+(?:[a-z]+\s+){0,2}?" + _HURT + r"\b")
# "kills 40", "death toll rises to 120", "morti: 40", "bilancio sale a 120", "dead at least 12"
_RX_NUM_AFTER = re.compile(
    r"\b(?:kill(?:s|ed|ing)?|death toll(?: (?:rises|climbs|reaches|hits|now))?(?: to)?|deaths?|dead|ucciso|uccide|uccidono|"
    r"morti|vittime|bilancio(?: (?:sale|salgono|e di|di|a))?|muoiono|muore|died)\D{0,22}?" + _NUM + _UNITS + r"\b")
_RX_AGE = re.compile(r"\b(?:aged|age|di|a)\s+\d+\s*(?:anni|years)|\b\d+\s*(?:anni|years|year old|year-old)\b")
_RX_QUANT = [
    (re.compile(r"\b(?:dozens?|decine|dozzine)\b[^.;]{0,30}?\b" + _DEATH_STRONG), 24),
    (re.compile(r"\b(?:hundreds?|centinaia)\b[^.;]{0,30}?\b" + _DEATH_STRONG), 250),
    (re.compile(r"\b(?:thousands?|migliaia)\b[^.;]{0,30}?\b" + _DEATH_STRONG), 2500),
]
_RX_MAG = re.compile(r"(?:magnitud[eo]|magnitudo|richter|\bm|\bmw|\bm\.)\s?(\d(?:[.,]\d)?)\b|\b(\d[.,]\d)\s*(?:magnitude|magnitudo|richter)")
_RX_PCT = re.compile(r"(\d+(?:[.,]\d+)?)\s?(?:%|per cento|percent|percento)")

# (regex su testo foldato minuscolo, boost, etichetta)
_BOOSTS = [
    (r"\b(?:war|guerra|invasion|invasione|invade[sd]?)\b", 1.0, "guerra"),
    (r"\b(?:nuclear|nucleare|atomic|atomica|radiological)\b", 1.0, "nucleare"),
    (r"\b(?:massacre|massacro|genocid\w*|ethnic cleansing|pulizia etnica|slaughter|strage|stragi)\b", 1.5, "massacro"),
    (r"\b(?:coup|colpo di stato|golpe)\b", 1.2, "colpo di stato"),
    (r"\b(?:collaps\w*|crollo|crolla\w*|tracollo|plunge\w*|crash\w*|tonfo|meltdown|bloodbath|carneficina|rout)\b", 0.9, "crollo"),
    (r"\b(?:panic|panico|sell off|selloff|black monday|lunedi nero)\b", 0.7, "panico"),
    (r"\b(?:record|storic\w*|historic|unprecedented|senza precedenti|worst|peggiore|biggest|maggiore)\b", 0.5, "record"),
    (r"\b(?:emergency|emergenza|state of emergency|stato di emergenza|martial law|legge marziale)\b", 0.6, "emergenza"),
    (r"\b(?:catastroph\w*|catastrof\w*|devastat\w*|devastazione|disaster|disastro|apocalyp\w*)\b", 1.0, "catastrofe"),
    (r"\b(?:hostages?|ostaggi\w*|abducted|rapit[oiae]|kidnapp\w*)\b", 0.6, "ostaggi"),
    (r"\b(?:missiles?|missili|airstrikes?|air strikes?|raid aere\w*|bombardament\w*|bombing|bomb\w*|shelling|drone attacks?|droni)\b", 0.6, "attacco militare"),
    (r"\b(?:escalat\w*|escalation|retaliat\w*|ritorsion\w*|rappresaglia)\b", 0.5, "escalation"),
    (r"\b(?:terror\w*|attentato|attentati|suicide|kamikaze|autobomba|car bomb)\b", 0.8, "terrorismo"),
    (r"\b(?:pandemic|pandemia|outbreak|focolaio|epidemic\w*|lockdown|quarantine|quarantena)\b", 0.6, "epidemia"),
    (r"\b(?:tsunami|maremoto|eruption|eruzione|hurricane|uragano|typhoon|tifone|earthquake|terremoto)\b", 0.6, "calamita"),
    (r"\b(?:crisis|crisi|shock|turmoil|fuga di capitali|bank run|default|insolvenza|bancarotta|bankruptcy)\b", 0.5, "crisi"),
    (r"\b(?:blockade|blocco navale|closure of the strait|chiusura dello stretto|stretto di hormuz|strait of hormuz|hormuz|ormuz)\b", 0.5, "chokepoint"),
    (r"\b(?:evacuat\w*|evacuazion\w*|sfollati|displaced|refugees|rifugiati)\b", 0.4, "sfollati"),
    (r"\b(?:ultimatum|threatens?|minaccia\w*|warns? of|avverte)\b", 0.3, "minaccia"),
    (r"\b(?:sanctions?|sanzioni)\b", 0.2, "sanzioni"),
    (r"\b(?:breaking|ultima ora|urgent|urgente|flash)\b", 0.3, "breaking"),
]
_BOOSTS_RX = [(re.compile(p), b, lab) for p, b, lab in _BOOSTS]

# attenuatori: notizie "di processo", ipotetiche o distensive
_DAMPERS = [
    (r"\b(?:talks?|negotiat\w*|colloqui|negoziat\w*|trattativ\w*|dialogue|dialogo)\b", 0.6, "colloqui"),
    (r"\b(?:agreement|accord\w*|deal|intesa|pact|patto|treaty|trattato)\b", 0.7, "accordo"),
    (r"\b(?:cease ?fire|truce|tregua|cessate il fuoco|peace|pace|de-escalat\w*|de escalat\w*|deescalat\w*|disgelo)\b", 0.9, "tregua/pace"),
    (r"\b(?:resum\w*|ripres\w*|riprend\w*|reopen\w*|riapr\w*|restor\w*|ripristin\w*)\b", 0.5, "ripresa"),
    (r"\b(?:meeting|meets?|incontro|incontra\w*|visit\w*|visita|summit|vertice|conference|conferenza)\b", 0.5, "incontro"),
    (r"\b(?:could|might|may|potrebbe|potrebbero|rischia|possible|possibile|plans?|piano|piani|proposal|proposta|expected|atteso|attesa|prevede)\b", 0.4, "ipotetico"),
    (r"\b(?:calls? for|urges?|chiede|chiedono|invita|appello|appeals?)\b", 0.3, "appello"),
    (r"\b(?:poll|sondaggio|analysis|analisi|opinion|commento|review|recensione|explained|spiegato|what to know|cosa sapere)\b", 0.5, "commento"),
    (r"\b(?:rescued|salvat\w*|freed|liberat\w*|released|rilasciat\w*|survive\w*|sopravvissut\w*)\b", 0.3, "esito positivo"),
]
_DAMPERS_RX = [(re.compile(p), d, lab) for p, d, lab in _DAMPERS]

_RX_OBIT = re.compile(r"\b(?:e morto|e morta|e scomparso|e scomparsa|muore|si spegne|addio a|dies aged|died aged|dies at|died at|obituary|necrologio|lutto per)\b")

_RX_HISTORY = re.compile(r"\b(?:19\d\d|20[01]\d|202[0-2])\b|\b(?:anniversar\w*|anni fa|years ago|memoriale|retrospective|decades? ago|decenni fa)\b")

BOOST_CAP = 3.0
DAMP_CAP = 3.0


def _to_int(s: str) -> float | None:
    s = s.strip()
    if re.fullmatch(r"\d{1,3}(?:[.,]\d{3})+", s):
        return float(re.sub(r"[.,]", "", s))
    s = s.replace(",", ".")
    try:
        v = float(s)
    except ValueError:
        return None
    return v


def _is_year(v: float) -> bool:
    return v == int(v) and 1900 <= v <= 2100


def extract_deaths(low: str) -> int:
    """Stima il numero di vittime citato nel testo (0 se nessuno)."""
    best = 0.0
    for m in _RX_NUM_BEFORE.finditer(low):
        v = _to_int(m.group(1))
        if v is None or v != int(v) or _is_year(v):
            continue
        # "40 anni" / eta' non conta; escludiamo se seguito da anni gia' dal pattern
        best = max(best, v)
    for m in _RX_NUM_AFTER.finditer(low):
        v = _to_int(m.group(1))
        if v is None or v != int(v) or _is_year(v):
            continue
        s = low[max(0, m.start() - 2):m.end() + 12]
        if _RX_AGE.search(s):
            continue
        best = max(best, v)
    for rx, v in _RX_QUANT:
        if rx.search(low):
            best = max(best, v)
    for m in _RX_HURT_BEFORE.finditer(low):   # i feriti pesano un terzo dei morti
        v = _to_int(m.group(1))
        if v is not None and v == int(v) and not _is_year(v):
            best = max(best, 0.35 * v)
    return int(min(best, 2_000_000))


def extract_magnitude(low: str) -> float:
    best = 0.0
    for m in _RX_MAG.finditer(low):
        g = m.group(1) or m.group(2)
        v = _to_int(g)
        if v and 4.0 <= v <= 10.0:
            best = max(best, v)
    return best


@lru_cache(maxsize=40000)
def _severity(title: str, summary: str, event_type: str):
    t_low = " ".join(T.tokens_lower(title or ""))
    s_low = " ".join(T.tokens_lower(summary or ""))
    both = f"{t_low} . {s_low}"
    # Il testo "foldato" per le regex dei numeri deve conservare i separatori decimali:
    raw_t = T.fold(title or "").lower()
    raw_s = T.fold(summary or "").lower()
    raw = f"{raw_t} . {raw_s}"
    prior = SEVERITY_PRIOR.get(event_type, SEVERITY_PRIOR["other"])
    sev = prior
    reasons = []

    deaths = extract_deaths(raw_t)
    d_sum = extract_deaths(raw_s)
    if d_sum > deaths:
        deaths = int(deaths + (d_sum - deaths) * 0.7) if deaths else int(d_sum * 0.8)
    death_boost = 0.0
    if deaths > 0:
        death_boost = min(4.5, 2.0 * math.log10(deaths + 1))
        reasons.append(f"vittime: {deaths}")
    elif not _RX_OBIT.search(t_low) and re.search(r"\b(?:killed|kills|dead|deaths?|morti|mort[oae]|vittime|uccis[oei]|uccise|feriti|wounded|injured|casualt\w*)\b", t_low):
        death_boost = 0.8
        reasons.append("vittime citate")
    sev += death_boost

    mag_boost = 0.0
    if event_type in ("natural_disaster", "other") or "quake" in both or "terremoto" in both or "earthquake" in both or "sisma" in both:
        mag = extract_magnitude(raw)
        if mag:
            mag_boost = min(4.5, 1.2 * (mag - 4.0))
            reasons.append(f"magnitudo {mag:g}")
    sev += mag_boost

    pct_boost = 0.0
    if event_type == "market_shock":
        pcts = [_to_int(x) for x in _RX_PCT.findall(raw_t)]
        pcts = [p for p in pcts if p is not None and p <= 100]
        if pcts:
            pmax = max(pcts)
            pct_boost = min(3.0, 0.35 * pmax) if pmax >= 1 else 0.0
            if pct_boost:
                reasons.append(f"variazione {pmax:g}%")
    sev += pct_boost

    boost = 0.0
    used = []
    for rx, b, lab in _BOOSTS_RX:
        in_t = rx.search(t_low)
        in_s = (not in_t) and rx.search(s_low)
        if in_t:
            boost += b
            used.append(lab)
        elif in_s:
            boost += b * 0.4
    boost = min(BOOST_CAP, boost)
    if used:
        reasons.append("segnali: " + ", ".join(used[:4]))
    sev += boost

    damp = 0.0
    dused = []
    for rx, d, lab in _DAMPERS_RX:
        if rx.search(t_low):
            damp += d
            dused.append(lab)
        elif rx.search(s_low):
            damp += d * 0.3
    damp = min(DAMP_CAP, damp)
    if death_boost >= 2.0:
        damp *= 0.4
    if dused:
        reasons.append("attenuanti: " + ", ".join(dused[:3]))
    if _RX_HISTORY.search(t_low):
        damp += 2.5
        reasons.append("riferimento storico")
    if _RX_OBIT.search(t_low) and deaths < 5:
        damp += 2.0
        reasons.append("necrologio")
    sev -= damp

    sev = max(0.0, min(10.0, sev))
    return round(sev, 2), tuple(reasons)


def severity(title: str, summary: str, event_type: str) -> float:
    """Severita' 0..10."""
    return _severity(title or "", summary or "", event_type)[0]


def explain(title: str, summary: str, event_type: str):
    """-> (severita', [motivi])"""
    s, r = _severity(title or "", summary or "", event_type)
    return s, list(r)


def band(sev: float) -> str:
    for hi, name in SEVERITY_BANDS:
        if sev < hi:
            return name
    return "severe"
