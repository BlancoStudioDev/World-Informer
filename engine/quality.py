"""Qualita' dei titoli: non-notizie generiche, pezzi d'opinione/analisi, prefissi di formato.

Tutto deterministico e configurabile in ``config.py`` (GENERIC_TITLES_EXACT, GENERIC_TITLE_PREFIX,
OPINION_*, DISPLAY_STRIP_PREFIX).
"""
from __future__ import annotations

import re

from . import config as C
from . import text as T

_STRIP_RX = re.compile(C.DISPLAY_STRIP_PREFIX, re.I)
_GEN_PREFIX = [re.compile(p) for p in C.GENERIC_TITLE_PREFIX]
_RX_OP_LABEL = re.compile(r"^\s*(?:" + "|".join(C.OPINION_TITLE_PREFIX) + r")\s*[:|\u2013\u2014-]", re.I)
_OP_SUFFIX = [re.compile(p) for p in C.OPINION_TITLE_SUFFIX]
_MONTHS = ("january february march april may june july august september october november december "
           "gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre novembre dicembre "
           "monday tuesday wednesday thursday friday saturday sunday lunedi martedi mercoledi giovedi venerdi sabato domenica "
           "mon tue wed thu fri sat sun gen feb mar apr mag giu lug ago set ott nov dic").split()
_DATEISH = frozenset(_MONTHS)
_RX_SEP_SUFFIX = re.compile(r"\s*[-–—|:]+\s*(?:a\s+)?(?:podcast|video|opinion|analysis|editorial|review)\s*$", re.I)


def clean_title(title: str) -> str:
    """Toglie i prefissi di formato ("Watch:", "Video:", "Ascolta:") dal titolo mostrato."""
    if not title:
        return ""
    out = _STRIP_RX.sub("", title, count=1).strip()
    return out or title


def _norm_generic(title: str) -> str:
    toks = T.tokens_lower(title)
    while toks and (toks[-1].isdigit() or toks[-1] in _DATEISH):
        toks.pop()
    return " ".join(toks)


def is_generic(title: str) -> bool:
    """True per titoli non-notizia ("Morning update", "Live updates", "Oroscopo", "Le notizie del giorno"...)."""
    n = _norm_generic(clean_title(title))
    if not n:
        return True
    if n in C.GENERIC_TITLES_EXACT:
        return True
    return any(rx.match(n) for rx in _GEN_PREFIX)


def is_opinion(title: str, hint: str | None = None) -> bool:
    """True per opinioni/analisi/podcast ("- podcast", "Opinion:", "Analisi:", titoli-domanda)."""
    if not title:
        return False
    t = title.strip()
    if C.OPINION_QUESTION_TITLES and t.endswith("?"):
        return True
    if _RX_SEP_SUFFIX.search(t):
        return True
    ct = clean_title(t)
    if _RX_OP_LABEL.match(ct):
        return True
    first = T.tokens_lower(ct)[:1]
    if first and first[0] in C.OPINION_BARE_WORDS:
        return True
    if hint and any(w in C.OPINION_HINTS for w in T.tokens_lower(hint)):
        return True
    return False
