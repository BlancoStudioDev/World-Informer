"""Classificazione in 15 event_type tramite lessico pesato (en+it).

score(type) = somma dei pesi dei termini distinti trovati; titolo x2, summary x1; le ripetizioni
dello stesso termine nello stesso campo valgono 0.4. Vince il massimo se >= MIN_SCORE, altrimenti ``other``.
Termini con prefisso ``re:`` sono espressioni regolari (applicate al testo foldato minuscolo).
"""
from __future__ import annotations

import json
import os
import re
from functools import lru_cache

from . import text as T
from .config import ALL_EVENT_TYPES, EVENT_LABELS_IT

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
TITLE_MULT = 2.0
SUMMARY_MULT = 1.0
REPEAT_FACTOR = 0.4
MIN_SCORE = 3.5
MIN_STRONG = 2.0   # serve almeno un termine di peso >= 2 per assegnare un tipo diverso da other


class _Lexicon:
    def __init__(self, path: str | None = None):
        path = path or os.path.join(DATA_DIR, "event_lexicon.json")
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh)
        self.labels_it = doc.get("labels_it", EVENT_LABELS_IT)
        self.matcher = T.TermMatcher()
        self.regexes: list[tuple[re.Pattern, str, float, str]] = []
        self.sizes: dict[str, int] = {}
        for etype, terms in doc["types"].items():
            self.sizes[etype] = len(terms)
            for term, w in terms:
                if term.startswith("re:"):
                    self.regexes.append((re.compile(term[3:]), etype, float(w), term))
                else:
                    self.matcher.add(term, (etype, float(w), term))


_LEX: _Lexicon | None = None


def lexicon() -> _Lexicon:
    global _LEX
    if _LEX is None:
        _LEX = _Lexicon()
    return _LEX


def _scan(text: str, mult: float, scores: dict, matched: dict):
    if not text:
        return
    lx = lexicon()
    orig = T.tokenize(text)
    low = [t.lower() for t in orig]
    seen = set()
    for _, _, seq, payloads in lx.matcher.scan(low, orig):
        for etype, w, term in payloads:
            f = REPEAT_FACTOR if (etype, term) in seen else 1.0
            seen.add((etype, term))
            s = w * mult * f
            scores[etype] = scores.get(etype, 0.0) + s
            if f == 1.0:
                matched.setdefault(etype, []).append((s, term, w))
    if lx.regexes:
        flat = " ".join(low)
        for rx, etype, w, term in lx.regexes:
            if rx.search(flat):
                s = w * mult
                scores[etype] = scores.get(etype, 0.0) + s
                matched.setdefault(etype, []).append((s, term, w))


@lru_cache(maxsize=40000)
def _classify(title: str, summary: str):
    scores: dict[str, float] = {}
    matched: dict[str, list] = {}
    _scan(title, TITLE_MULT, scores, matched)
    _scan(summary, SUMMARY_MULT, scores, matched)
    return scores, matched


def scores(title: str, summary: str = "") -> dict[str, float]:
    """Punteggi grezzi per tipo (debug / uso interno)."""
    return dict(_classify(title or "", summary or "")[0])


def classify(title: str, summary: str = ""):
    """-> (event_type, confidence 0..1, matched_terms[list[str]])"""
    sc, matched = _classify(title or "", summary or "")
    if not sc:
        return "other", 0.1, []
    ranked = sorted(sc.items(), key=lambda kv: (-kv[1], ALL_EVENT_TYPES.index(kv[0]) if kv[0] in ALL_EVENT_TYPES else 99))
    best, top = ranked[0]
    second = ranked[1][1] if len(ranked) > 1 else 0.0
    strong = max((w for _, _, w in matched.get(best, [])), default=0.0)
    if top < MIN_SCORE or (best != "other" and strong < MIN_STRONG):
        return "other", round(max(0.05, 0.3 * min(top, MIN_SCORE) / MIN_SCORE), 3), []
    margin = (top - second) / top if top else 0.0
    conf = 0.5 * min(1.0, top / 10.0) + 0.5 * margin
    conf = round(min(0.99, max(0.05, conf)), 3)
    terms = [t for _, t, _ in sorted(matched.get(best, []), key=lambda x: -x[0])]
    return best, conf, terms[:8]


def label_it(event_type: str) -> str:
    return lexicon().labels_it.get(event_type, EVENT_LABELS_IT.get(event_type, event_type))
