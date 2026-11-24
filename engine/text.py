"""Normalizzazione e matching di testo (stdlib pura).

* ``fold``: toglie accenti/diacritici, mantiene le maiuscole (serve per i termini case-sensitive).
* ``tokenize``: token alfanumerici (apostrofi e trattini = separatori).
* ``TermMatcher``: matcher greedy leftmost-longest su token, con prefissi (``stem*``),
  frasi e termini case-sensitive. Molto piu' veloce di una regex con centinaia di alternative.
"""
from __future__ import annotations

import html
import re
import unicodedata
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

STOPWORDS_EN = frozenset("""
a about above after again against all also am an and any are as at be because been before being below between both but by
can could did do does doing down during each few for from further had has have having he her here hers him his how i if in
into is it its just me more most my no nor not now of off on once only or other our out over own s same she should so some
such t than that the their them then there these they this those through to too under until up us very was we were what when
where which while who whom why will with would you your said says say new news after amid via per vs
""".split())
STOPWORDS_IT = frozenset("""
a ad al allo alla alle agli ai anche avere che chi ci come con contro cui da dal dallo dalla dalle dagli dai degli dei del
dell della delle dello di dopo dove e ed era erano essere fra gli ha hanno ho i il in io la le lei lo loro lui ma me mi
molto ne nel nella nelle nello nei negli noi non o per perche piu quale quali quando quanto quello questa queste questi
questo se sei si sia siamo sono su sul sulla sulle sullo sui sugli suo sua suoi sue tra tu tutti tutto un una uno vi voi
sara stato stata stati state puo dice dopo oggi ieri gia ancora solo ora anni anno nuovo nuova nuovi nuove
""".split())
STOPWORDS = STOPWORDS_EN | STOPWORDS_IT

_FOLD_CACHE: dict[str, str] = {}
_DOTTED = re.compile(r"\b(?:[A-Za-z]\.){2,}")
_TOKEN = re.compile(r"[0-9]+(?:[.,][0-9]+)*|[^\W_]+")
_HTML_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")
_QUOTES = str.maketrans({"’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-", " ": " "})


def strip_html(s: str) -> str:
    if not s:
        return ""
    s = _HTML_TAG.sub(" ", s)
    s = html.unescape(s)
    return _WS.sub(" ", s).strip()


def fold(s: str) -> str:
    """Rimuove accenti e collassa gli acronimi puntati (U.S. -> US). Le maiuscole restano."""
    if not s:
        return ""
    s = s.translate(_QUOTES)
    s = _DOTTED.sub(lambda m: m.group().replace(".", ""), s)
    if s.isascii():
        return s
    d = unicodedata.normalize("NFKD", s)
    return "".join(c for c in d if not unicodedata.combining(c))


def tokenize(s: str) -> list[str]:
    """Token (accenti rimossi, maiuscole mantenute)."""
    return _TOKEN.findall(fold(s))


def tokens_lower(s: str) -> list[str]:
    return [t.lower() for t in tokenize(s)]


def normalize(s: str) -> str:
    """Minuscolo, senza accenti, spazi singoli (per confronti/dedup)."""
    return " ".join(tokens_lower(s))


def content_tokens(s: str, min_len: int = 3) -> list[str]:
    """Token significativi: minuscoli, senza stopword, con stemming leggero."""
    out = []
    for t in tokens_lower(s):
        if len(t) < min_len and not t.isdigit():
            continue
        if t in STOPWORDS:
            continue
        out.append(stem(t))
    return out


def stem(t: str) -> str:
    """Stemming molto leggero en/it (plurali e desinenze comuni)."""
    n = len(t)
    if n <= 4 or t.isdigit():
        return t
    if t.endswith("ies") and n > 5:
        return t[:-3] + "y"
    if t.endswith("ing") and n > 6:
        return t[:-3]
    if t.endswith("ed") and n > 5:
        return t[:-2]
    if t.endswith("s") and not t.endswith("ss"):
        return t[:-1]
    if n >= 5 and t[-1] in "aeio":
        t = t[:-1]
        if t.endswith(("i", "h")) and len(t) > 4:  # amici -> amic
            t = t[:-1]
    return t


def first_sentence(s: str, maxlen: int = 220) -> str:
    s = strip_html(s)
    if not s:
        return ""
    m = re.search(r"(?<=[.!?])\s+(?=[A-ZÀ-Ý0-9\"'])", s)
    out = s[: m.start()] if m else s
    return out[:maxlen]


def shingles(tokens: list[str], k: int = 2) -> set[str]:
    if len(tokens) < k:
        return {" ".join(tokens)} if tokens else set()
    return {" ".join(tokens[i:i + k]) for i in range(len(tokens) - k + 1)}


_IT_HINT = frozenset("il lo la gli le un una dei delle della del di che per con sono non nel nella dopo anche piu questo".split())
_EN_HINT = frozenset("the of and to in for with that is are was after over says said from as by on an at".split())


def detect_lang(text: str) -> str:
    toks = tokens_lower(text)[:60]
    it = sum(1 for t in toks if t in _IT_HINT)
    en = sum(1 for t in toks if t in _EN_HINT)
    return "it" if it > en else "en"


def parse_dt(v, default: datetime | None = None) -> datetime | None:
    """Converte ISO8601 / RFC822 / epoch / datetime in datetime UTC aware."""
    if v is None or v == "":
        return default
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    if isinstance(v, (int, float)):
        try:
            return datetime.fromtimestamp(float(v), tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return default
    s = str(v).strip()
    try:
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except ValueError:
        pass
    try:
        d = parsedate_to_datetime(s)
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return default


def iso(d: datetime) -> str:
    return d.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class TermMatcher:
    """Matcher di termini su sequenze di token.

    Termini: ``"trade war"`` (frase), ``"tariff*"`` (prefisso sull'ultima parola), ``"=USA"``
    (case-sensitive). Match greedy leftmost-longest; ogni token appartiene a un solo match.
    """

    def __init__(self):
        self._exact: dict[str, dict[tuple, list]] = {}
        self._stem: dict[str, dict[tuple, list]] = {}
        self._stem_lens: set[int] = set()
        self.size = 0

    def add(self, term: str, payload, case_sensitive: bool = False) -> bool:
        if term.startswith("="):
            term, case_sensitive = term[1:], True
        toks = tokenize(term)
        if not toks:
            return False
        prefix = term.rstrip().endswith("*")
        low = tuple(t.lower() for t in toks)
        cs = tuple(toks) if case_sensitive else None
        key = (low, prefix, cs)
        first = low[0]
        if prefix and len(low) == 1:
            self._stem_lens.add(len(first))
            bucket = self._stem.setdefault(first, {})
        else:
            bucket = self._exact.setdefault(first, {})
        if key not in bucket:
            bucket[key] = []
            self.size += 1
        bucket[key].append(payload)
        return True

    def scan(self, low: list[str], orig: list[str] | None = None):
        """Ritorna [(start, end, term_tokens, payloads)] senza sovrapposizioni."""
        out = []
        n = len(low)
        i = 0
        exact, stemd, lens = self._exact, self._stem, sorted(self._stem_lens)
        while i < n:
            tok = low[i]
            cands = []
            b = exact.get(tok)
            if b:
                cands.extend(b.items())
            if lens:
                tl = len(tok)
                for L in lens:
                    if L > tl:
                        break
                    sb = stemd.get(tok[:L])
                    if sb:
                        cands.extend(sb.items())
            best_m = 0
            best_seq = None
            best_payloads: list = []
            for (seq, prefix, cs), payloads in cands:
                m = len(seq)
                if m < best_m or i + m > n:
                    continue
                ok = True
                for j in range(m):
                    t = low[i + j]
                    if j == m - 1 and prefix:
                        if not t.startswith(seq[j]):
                            ok = False
                            break
                    elif t != seq[j]:
                        ok = False
                        break
                if ok and cs is not None and (orig is None or tuple(orig[i:i + m]) != cs):
                    ok = False
                if not ok:
                    continue
                if m > best_m:
                    best_m, best_seq, best_payloads = m, seq, list(payloads)
                else:
                    best_payloads.extend(payloads)
            if best_m:
                out.append((i, i + best_m, best_seq, best_payloads))
                i += best_m
            else:
                i += 1
        return out
