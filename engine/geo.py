"""Geolocalizzazione algoritmica di un testo tramite gazetteer en+it.

``locate(title, summary, hint)`` -> lista di ``CountryHit`` ordinata per peso.

Pesi per tipo di match: nome/alias 1.0 (0.9 alias), demonimo 0.8, capitale 0.7, citta' 0.6, leader/istituzioni 0.4
(override con ``~peso`` nel gazetteer). Moltiplicatore per campo: titolo 3, hint (sezione/kicker) 2,
summary 1; i ripetuti dello stesso termine nello stesso campo valgono 0.3.
``weight = min(1, raw/3)``: un nome di paese nel titolo da solo vale 1.0.

Ambiguita' (Georgia, Jordan, Chad, Turkey, Congo, Korea, Monaco, Brussels...) risolte da regole in
``gazetteer.json["ambiguous"]`` (contesto, case-sensitivity, vicinanza a nomi propri).
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from functools import lru_cache

from . import config as C
from . import text as T

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

KIND_WEIGHT = {"name": 1.0, "alias": 0.9, "demonym": 0.8, "capital": 0.7, "city": 0.6, "leader": 0.4}
FIELD_MULT = {"title": 3.0, "hint": 2.0, "summary": 1.0}
REPEAT_FACTOR = 0.3
NORM = 3.0  # raw/NORM -> weight (clamp 1)


@dataclass
class CountryHit:
    iso2: str
    name: str            # nome italiano
    name_en: str
    weight: float        # 0..1
    raw: float
    lat: float           # centroide del paese
    lng: float
    region: str
    city: str | None = None
    city_lat: float | None = None
    city_lng: float | None = None
    city_score: float = 0.0
    terms: list = field(default_factory=list)
    focus: float = 0.0       # raw ripesato per ruolo (luogo/bersaglio > neutro > attore): sceglie il punto primario
    first_pos: int = 10 ** 6  # posizione del primo match (titolo prima di summary)
    actor_only: bool = False  # tutti i match sono "attore" (soggetto di un'azione)

    def point(self):
        """(lat, lng, label): citta' se trovata, altrimenti centroide del paese."""
        if self.city is not None and self.city_lat is not None:
            lab = self.name if self.city == self.name else f"{self.city}, {self.name}"
            return self.city_lat, self.city_lng, lab
        return self.lat, self.lng, self.name

    def to_dict(self):
        return {"iso2": self.iso2, "name": self.name, "weight": round(self.weight, 3)}


class Gazetteer:
    def __init__(self, path: str | None = None):
        path = path or os.path.join(DATA_DIR, "gazetteer.json")
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh)
        self.countries: dict[str, dict] = {c["iso2"]: c for c in doc["countries"]}
        self.rules: list[dict] = doc.get("ambiguous", [])
        self.matcher = T.TermMatcher()
        self._build()

    @staticmethod
    def _split_w(term: str):
        if "~" in term:
            t, w = term.rsplit("~", 1)
            try:
                return t.strip(), float(w)
            except ValueError:
                pass
        return term.strip(), None

    def _build(self):
        amb_keys = {}
        for idx, r in enumerate(self.rules):
            amb_keys[" ".join(T.tokens_lower(r["term"].lstrip("=")))] = idx
        self._amb_keys = amb_keys
        for idx, r in enumerate(self.rules):
            self.matcher.add(r["term"], ("amb", idx))

        def reg(term, iso, kind, w=None, city=None):
            term, w2 = self._split_w(term)
            w = w2 if w2 is not None else (w if w is not None else KIND_WEIGHT[kind])
            key = " ".join(T.tokens_lower(term.lstrip("=").rstrip("*")))
            if not key or key in amb_keys:
                return
            self.matcher.add(term, ("c", iso, kind, w, city, term.lstrip("=")))

        for iso, c in self.countries.items():
            reg(c["name_en"], iso, "name")
            reg(c["name_it"], iso, "name")
            for a in c.get("aliases", []):
                reg(a, iso, "alias")
            for lang in ("en", "it"):
                for d in c.get("demonyms", {}).get(lang, []):
                    reg(d, iso, "demonym")
            cap = c.get("capital")
            if cap:
                cd = self._place_display(cap)
                for n in cap["names"]:
                    reg(n, iso, "capital", cap.get("weight"), (cd, cap["lat"], cap["lng"]))
            for city in c.get("cities", []):
                cd = self._place_display(city)
                for n in city["names"]:
                    reg(n, iso, "city", city.get("weight"), (cd, city["lat"], city["lng"]))
            for k in c.get("leaders", []):
                reg(k, iso, "leader")

    @staticmethod
    def _place_display(p):
        n = p["names"]
        return n[1] if len(n) > 1 else n[0]


_GAZ: Gazetteer | None = None


def gazetteer() -> Gazetteer:
    global _GAZ
    if _GAZ is None:
        _GAZ = Gazetteer()
    return _GAZ


def country_info(iso2: str) -> dict | None:
    return gazetteer().countries.get(iso2)


def all_countries() -> list[dict]:
    return list(gazetteer().countries.values())


def country_name(iso2: str, lang: str = "it") -> str:
    c = gazetteer().countries.get(iso2)
    if not c:
        return iso2
    return c["name_it"] if lang == "it" else c["name_en"]


# ----------------------------------------------------------------------------------------------------
# Ruoli: luogo / bersaglio / vittime / attore
# ----------------------------------------------------------------------------------------------------
_W = lambda s: frozenset(s.split())  # noqa: E731
_SKIP_BACK = _W("the a an il lo la l gli le i un una uno northern southern eastern western central north south east west "
                "nord sud est ovest settentrionale meridionale orientale occidentale centrale greater occupied "
                "occupato occupata territorio territory part parts parte")
_SKIP_FWD = _W("the a an il lo la l gli le i un una uno live breaking watch video exclusive update flash urgent ultima ora")
_PLACE_PREP = _W("in at near off across outside inside within throughout nel nella nello nei nelle negli nell presso "
                 "dentro fuori lungo ad")
_TARGET_PREP = _W("on against over onto toward towards su sul sulla sullo sui sulle sugli sull contro verso sopra")
_ATTACK_VERBS = _W("bomb bombs bombed bombing strike strikes struck hit hits attack attacks attacked invade invades invaded "
                   "shell shells shelled target targets targeted raid raids raided pound pounds pounded bombard bombards "
                   "bombarded sanction sanctions sanctioned threatens threaten threatened "
                   "bombarda bombardano bombardare bombardato colpisce colpiscono colpire attacca attaccano attaccare "
                   "invade invadono invadere minaccia minacciano sanziona sanzionano")
_ACTION_NEXT = _W("strike strikes attack attacks attacked attacking kill kills killed killing bomb bombs bombed bombing "
                  "shell shells shelling hit hits target targets targeted invade invades invaded invasion raid raids launch "
                  "launches launched fire fires fired destroy destroys sanction sanctions sink sinks sank seize seizes "
                  "missile missiles drone drones airstrike airstrikes jets warplanes forces troops army military soldiers "
                  "navy offensive operation bombardment artillery rockets rocket tanks "
                  "attacca attaccano attacco attacchi bombarda bombardano bombardamento bombardamenti colpisce colpiscono "
                  "uccide uccidono invade invadono invasione lancia lanciano raid offensiva esercito forze truppe missili "
                  "missile droni drone aerei caccia soldati militari marina artiglieria razzi razzo spara sparano distrugge "
                  "distruggono affonda sequestra sanziona sanzionano")
_SPEECH_NEXT = _W("says say said warns warn threatens vows denies claims orders hails confirms announces calls urges "
                  "dice dicono avverte minaccia nega accusa ordina annuncia conferma chiede")
_PASSIVE = _W("hit struck attacked bombed invaded targeted shelled rocked battered colpito colpita colpiti colpite "
              "attaccato attaccata bombardato bombardata invaso invasa devastato devastata")
_LOCAL_NEXT = _W("media officials official ministry authorities sources health civil defence defense rescuers hospital "
                 "hospitals residents governor mayor city cities town towns village villages territory soil border coast "
                 "waters province region airspace port ports capital government president prime minister police "
                 "citta cittadina villaggio villaggi confine confini territorio spazio aereo porto capitale governatore "
                 "sindaco ministero autorita fonti soccorritori ospedale ospedali residenti")
_VICTIM_AFTER = _W("killed dead wounded injured die died dies starve starving displaced uccisi uccise morti feriti muoiono "
                   "sfollati")
_KILL_VERBS = _W("kill kills killed killing wound wounds wounded injure injures injured murder murders uccide uccidono "
                 "uccisi ferisce feriscono")
_QUANT = _W("dozens hundreds thousands scores many several least about over nearly almost at oltre almeno decine centinaia "
            "migliaia")
_TOPIC_NEXT = _W("war conflict crisis talks deal peace ceasefire negotiations tensions guerra conflitto crisi colloqui accordo "
                 "pace tregua negoziati tensioni")
_SUBORD = _W("after following since dopo mentre while")
_REFERENT_VERBS = _W("blames blame blamed accuses accuse accused condemns condemned slams slam denounces accusa accusano "
                     "condanna condannano incolpa")
_THING_NEXT = _W("cargo ship ships warship warships vessel vessels tanker tankers boat boats plane planes aircraft jet jets helicopter "
                 "helicopters embassy ambassador citizen citizens national nationals nave navi petroliera aereo aerei "
                 "ambasciata ambasciatore cittadino cittadini connazionali")


def _is_numlike(t: str) -> bool:
    return t[:1].isdigit() or t in _NUMWORDS


_NUMWORDS = _W("one two three four five six seven eight nine ten eleven twelve un due tre quattro cinque sei sette otto nove "
               "dieci undici dodici venti trenta")


def _dateline_end(text: str) -> int:
    """Numero di token del prefisso "X:" (<=4 token, ':' nei primi 40 car.), 0 altrimenti."""
    k = text.find(":")
    if 0 < k <= 40:
        n = len(T.tokenize(text[:k]))
        if 0 < n <= 4:
            return n
    return 0


def _role(low: list[str], i: int, j: int, kind: str, it: bool, dl_end: int, subj: int, sub_at: int) -> tuple[str, bool]:
    """Ruolo del match low[i:j] -> (nome ruolo, e' attore forte)."""
    n = len(low)
    if dl_end and j <= dl_end and kind in ("name", "alias", "city", "capital"):
        role = "place"
    else:
        role = None
        # ---- cue a sinistra (saltando articoli e aggettivi direzionali)
        k = i - 1
        skipped = 0
        while k >= 0 and low[k] in _SKIP_BACK and skipped < 3:
            k -= 1
            skipped += 1
        if k >= 0:
            p = low[k]
            if p in _PLACE_PREP or (p == "a" and it and (skipped == 0 or low[i - 1] in _SKIP_BACK)):
                role = "place"
            elif p in _TARGET_PREP:
                role = "target"
            elif p in _ATTACK_VERBS:
                role = "target"
            elif kind == "demonym" and (_is_numlike(p) or (p in _QUANT)) and not (j < n and low[j] in _ACTION_NEXT):
                role = "target"          # "10 Palestinians", "at least 12 Ukrainians"
            elif p in _REFERENT_VERBS:
                role = "referent"        # "Poland blames Russia": paese citato, non luogo dell'evento
            elif kind == "demonym" and low[i - 1:i] and any(w in _KILL_VERBS for w in low[max(0, i - 3):i]) \
                    and low[j - 1].endswith(("s", "i", "e")) and not (j < n and low[j] in _ACTION_NEXT):
                role = "target"          # "Israel kills Palestinians"
        if role in ("target", "place") and kind == "demonym" and j < n and low[j] in _THING_NEXT:
            role = "neutral"             # "hit Russian ship": nazionalita' dell'oggetto, non luogo
        if role == "target" and j + 1 < n and low[j] == "s":
            role = "neutral"             # "against Moscow's invasion": possessivo, non e' il bersaglio
        if role is None and j < n:
            nx = low[j]
            nx2 = low[j + 1] if j + 1 < n else ""
            if nx == "s" and nx2:        # possessivo "Ukraine's attack"
                nx, nx2 = nx2, (low[j + 2] if j + 2 < n else "")
                poss = True
            else:
                poss = False
            if nx in _PASSIVE and nx2 in ("by", "da"):
                role = "target"          # "Spain hit by floods", "colpita da"
            elif kind == "demonym" and nx in _VICTIM_AFTER:
                role = "target"          # "Palestinians killed"
            elif nx in _ACTION_NEXT:
                return "actor", True
            elif nx in _TOPIC_NEXT and kind in ("name", "alias"):
                role = "topic"
            elif nx in _LOCAL_NEXT and kind in ("demonym", "name", "alias"):
                role = "local"
            elif nx in _SPEECH_NEXT and not poss:
                role = "subject"
        if role is None and i == subj and kind not in ("city", "capital"):
            role = "subject"
    if role is None:
        role = "neutral"
    return role, False


def _mult(role: str, after_sub: bool) -> float:
    m = 1.0 if role == "neutral" else C.GEO_ROLE_MULT[role]
    if after_sub:
        m *= C.GEO_ROLE_MULT["subordinate"]
    return m


def _is_cap_word(t: str) -> bool:
    return len(t) > 1 and t[0].isupper() and t[1:].islower() and t.lower() not in T.STOPWORDS


def _resolve(rule: dict, i: int, j: int, low: list[str], orig: list[str], tokset: set, title_case: bool):
    if rule.get("forbid_any") and any(w in tokset for w in rule["forbid_any"]):
        return []
    if rule.get("reject_if_name_neighbor") and not title_case:
        prev = orig[i - 1] if i > 0 else ""
        nxt = orig[j] if j < len(orig) else ""
        if (prev and _is_cap_word(prev)) or (nxt and _is_cap_word(nxt)):
            return []
    for ctx in rule.get("context", []):
        if any(w in tokset for w in ctx["any"]):
            return list(ctx["targets"].items())
    return list(rule["targets"].items())


def _is_title_case(orig: list[str]) -> bool:
    words = [t for t in orig if t.isalpha() and len(t) > 2]
    if len(words) < 6:
        return False
    return sum(1 for t in words if t[0].isupper()) / len(words) >= 0.7


def _scan_field(text: str, mult: float, acc: dict, order: int = 0, tokset_extra: set | None = None):
    if not text:
        return
    g = gazetteer()
    orig = T.tokenize(text)
    low = [t.lower() for t in orig]
    tokset = set(low)
    if tokset_extra:
        tokset |= tokset_extra
    title_case = _is_title_case(orig)
    it = T.detect_lang(text) == "it"
    dl_end = _dateline_end(text)
    subj = dl_end
    while subj < len(low) and low[subj] in _SKIP_FWD:
        subj += 1
    sub_at = next((x for x, t in enumerate(low) if t in _SUBORD), 10 ** 6)
    seen: set = set()
    for i, j, seq, payloads in g.matcher.scan(low, orig):
        roles: dict = {}
        for p in payloads:
            if p[0] == "amb":
                rule = g.rules[p[1]]
                for iso, w in _resolve(rule, i, j, low, orig, tokset, title_case):
                    if iso not in g.countries:
                        continue
                    r = roles.get("alias") or roles.setdefault("alias", _role(low, i, j, "alias", it, dl_end, subj, sub_at))
                    _add(acc, g, iso, "alias", w, None, " ".join(seq), mult, seen, r, i, i >= sub_at, order)
            else:
                _, iso, kind, w, city, term = p
                r = roles.get(kind) or roles.setdefault(kind, _role(low, i, j, kind, it, dl_end, subj, sub_at))
                _add(acc, g, iso, kind, w, city, " ".join(seq), mult, seen, r, i, i >= sub_at, order)


def _add(acc, g, iso, kind, w, city, termkey, mult, seen, role=("neutral", False), pos=0, after_sub=False, order=0):
    key = (iso, termkey)
    f = REPEAT_FACTOR if key in seen else 1.0
    seen.add(key)
    s = w * mult * f
    a = acc.get(iso)
    if a is None:
        a = acc[iso] = {"raw": 0.0, "terms": [], "city": None, "city_score": 0.0, "focus": 0.0,
                        "first_pos": 10 ** 6, "strong": 0, "n": 0}
    a["raw"] += s
    rname, strong = role
    a["focus"] += s * _mult(rname, after_sub)
    a["first_pos"] = min(a["first_pos"], order * 1000 + pos)
    a["n"] += 1
    a["strong"] += 1 if strong else 0
    if f == 1.0 and termkey not in a["terms"]:
        a["terms"].append(termkey)
    if city is not None and s > a["city_score"]:
        a["city"], a["city_score"] = city, s


def locate_cached(title: str, summary: str = "", hint: str | None = None):
    return _locate_cached(title or "", summary or "", hint or "")


@lru_cache(maxsize=40000)
def _locate_cached(title: str, summary: str, hint: str) -> tuple:
    g = gazetteer()
    acc: dict = {}
    _scan_field(title, FIELD_MULT["title"], acc, 0)
    if hint:
        _scan_field(hint, FIELD_MULT["hint"], acc, 1)
    _scan_field(summary, FIELD_MULT["summary"], acc, 2)
    hits = []
    for iso, a in acc.items():
        c = g.countries[iso]
        h = CountryHit(
            iso2=iso, name=c["name_it"], name_en=c["name_en"], weight=min(1.0, a["raw"] / NORM), raw=a["raw"],
            lat=c["lat"], lng=c["lng"], region=c["region"], terms=a["terms"],
            focus=a["focus"], first_pos=a["first_pos"], actor_only=a["strong"] == a["n"],
        )
        if a["city"]:
            h.city, h.city_lat, h.city_lng = a["city"]
            h.city_score = a["city_score"]
            if h.city == c["name_it"]:
                h.city = c["name_it"]
        hits.append(h)
    hits.sort(key=lambda h: (-h.weight, -h.raw, h.iso2))
    return tuple(hits)


def locate(title: str, summary: str = "", hint: str | None = None) -> list[CountryHit]:
    """Paesi menzionati con peso 0..1 (ordinati). Ogni hit porta il punto primario (``hit.point()``)."""
    return [CountryHit(**{**h.__dict__, "terms": list(h.terms)}) for h in _locate_cached(title or "", summary or "", hint or "")]


def focus_key(h: CountryHit):
    """Ordine per il punto primario: non-attore > focus (luogo/bersaglio) > peso > menzione piu' precoce."""
    return (not h.actor_only, round(h.focus, 6), round(h.weight, 6), -h.first_pos)


def primary_hit(hits: list[CountryHit]) -> CountryHit | None:
    """Paese dove si svolge l'evento: luogo/bersaglio batte attore ("Saudi strikes on Yemen" -> Yemen)."""
    if not hits:
        return None
    return max(hits, key=focus_key)


def primary_point(hits: list[CountryHit]):
    """(lat, lng, label) del paese principale per ruolo (citta' se disponibile), oppure None."""
    h = primary_hit(hits)
    return h.point() if h else None
