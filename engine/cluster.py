"""Clustering di articoli in "eventi" (puro python, deterministico).

Per ogni articolo: vettore TF-IDF (stem, titolo peso 1 + primo periodo del summary peso 0.5).
Candidati dalle posting list dei token "rari" (indice invertito), similarita' = coseno esatto
+ bonus per numeri condivisi e paesi in comune. Gli archi con sim >= soglia vengono uniti con union-find
in ordine di similarita' decrescente, rispettando: finestra temporale (span <= window_hours) e
dimensione massima del cluster.

Cross-lingua (IT <-> EN): bonus opzionale, solo se gli articoli condividono entita' nominate
(paesi/citta' dal gazetteer, numeri e nomi propri identici) e lo stesso event_type.

Il cluster id e' l'id dell'articolo piu' vecchio (stabile tra esecuzioni se l'articolo e' ancora in finestra).
"""
from __future__ import annotations

import math
import re
from collections import defaultdict
from dataclasses import dataclass, field

from . import text as T

DEFAULT_THRESHOLD = 0.5
MAX_CLUSTER = 40


@dataclass
class Item:
    """Rappresentazione minima di un articolo per il clustering."""
    id: str
    title: str
    summary: str = ""
    ts: float = 0.0                         # epoch secondi
    lang: str = "en"
    countries: frozenset = frozenset()      # iso2 (con peso rilevante)
    event_type: str = "other"
    # campi derivati (riempiti da prepare())
    vec: dict = field(default_factory=dict, repr=False)
    norm: float = 0.0
    nums: frozenset = frozenset()
    ents: frozenset = frozenset()


_NUMBER = re.compile(r"\b\d+[.,]\d+\b|\b\d{2,}\b")
_YEAR = re.compile(r"^(?:19|20)\d{2}$")


def _numbers(s: str) -> frozenset:
    out = set()
    for m in _NUMBER.findall(T.fold(s)):
        if _YEAR.match(m):
            continue
        out.add(m.replace(",", "").replace(".", ""))
    return frozenset(out)


def _proper_nouns(title: str) -> set:
    """Parole capitalizzate non iniziali (nomi propri), minuscole e senza accenti."""
    toks = T.tokenize(title)
    out = set()
    for i, t in enumerate(toks):
        if i == 0 or len(t) < 4 or not t[0].isupper() or t.isupper() and len(t) > 5:
            continue
        low = t.lower()
        if low in T.STOPWORDS:
            continue
        out.add(low)
    return out


def prepare(items: list[Item]):
    """Calcola vettori TF-IDF ed entita' (in place)."""
    n = len(items)
    toks_list = []
    df: dict[str, int] = defaultdict(int)
    for it in items:
        tt = T.content_tokens(it.title)
        lead = T.content_tokens(T.first_sentence(it.summary))
        tf: dict[str, float] = defaultdict(float)
        for t in tt:
            tf[t] += 1.0
        for t in lead:
            tf[t] += 0.5
        toks_list.append(tf)
        for t in tf:
            df[t] += 1
    for it, tf in zip(items, toks_list):
        vec = {}
        for t, c in tf.items():
            idf = math.log((n + 1) / (df[t] + 1)) + 1.0
            vec[t] = (1.0 + math.log(c)) * idf if c >= 1 else c * idf
        norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
        it.vec, it.norm = vec, norm
        it.nums = _numbers(it.title)
        ents = set(_proper_nouns(it.title))
        ents.update("c:" + c for c in it.countries)
        ents.update("n:" + x for x in it.nums)
        it.ents = frozenset(ents)
    return df


def _cos(a: Item, b: Item) -> float:
    va, vb = a.vec, b.vec
    if len(va) > len(vb):
        va, vb = vb, va
    dot = 0.0
    for t, w in va.items():
        w2 = vb.get(t)
        if w2:
            dot += w * w2
    return dot / (a.norm * b.norm)


def pair_similarity(a: Item, b: Item) -> float:
    """Similarita' 0..1 tra due articoli (stessa lingua o cross-lingua)."""
    if a.lang == b.lang:
        s = _cos(a, b)
        shared_nums = len(a.nums & b.nums)
        if shared_nums:
            s += min(0.15, 0.07 * shared_nums)
        sc = a.countries & b.countries
        if sc:
            s += 0.05
        elif a.countries and b.countries:
            s -= 0.1   # paesi diversi -> storie diverse (a meno di testo quasi identico)
        return max(0.0, min(1.0, s))
    return cross_lang_similarity(a, b)


def cross_lang_similarity(a: Item, b: Item) -> float:
    """Sim. per articoli in lingue diverse: solo entita' condivise + stesso event_type."""
    if a.event_type != b.event_type and "other" not in (a.event_type, b.event_type):
        return 0.0
    common = a.ents & b.ents
    countries = [e for e in common if e.startswith("c:")]
    nums = [e for e in common if e.startswith("n:")]
    names = [e for e in common if not e.startswith(("c:", "n:"))]
    if not countries:
        return 0.0
    # serve almeno un'entita' specifica (nome proprio/citta'/numero) oltre al paese e >= 3 entita' in comune
    # (oppure un numero + un paese)
    if not names and not nums:
        return 0.0
    if len(common) < 3 and not (nums and len(common) >= 2):
        return 0.0
    ratio = len(common) / max(1, min(len(a.ents), len(b.ents)))
    if ratio < 0.6:
        return 0.0
    # cap sotto soglia piena: serve ratio alto per arrivare a 0.5+
    return min(0.9, 0.2 + 0.7 * ratio)


class _UF:
    def __init__(self, n, ts):
        self.p = list(range(n))
        self.size = [1] * n
        self.tmin = list(ts)
        self.tmax = list(ts)

    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return ra
        if self.size[ra] < self.size[rb]:
            ra, rb = rb, ra
        self.p[rb] = ra
        self.size[ra] += self.size[rb]
        self.tmin[ra] = min(self.tmin[ra], self.tmin[rb])
        self.tmax[ra] = max(self.tmax[ra], self.tmax[rb])
        return ra


def cluster(items: list[Item], window_hours: float = 48.0, threshold: float = DEFAULT_THRESHOLD,
            cross_lang: bool = True, max_cluster: int = MAX_CLUSTER) -> list[list[int]]:
    """Raggruppa gli item. Ritorna liste di indici (ordinate per (ts, id)); cluster ordinati per primo (ts, id)."""
    n = len(items)
    if n == 0:
        return []
    prepare(items)
    win = window_hours * 3600.0
    ts = [it.ts for it in items]

    # indice invertito sui token "rari" (+ entita' per cross-lingua)
    cap = max(25, int(0.01 * n))
    post: dict[str, list[int]] = defaultdict(list)
    for i, it in enumerate(items):
        for t in it.vec:
            post[t].append(i)
    epost: dict[str, list[int]] = defaultdict(list)
    if cross_lang:
        for i, it in enumerate(items):
            for e in it.ents:
                epost[e].append(i)

    edges: list[tuple[float, int, int]] = []
    for i, it in enumerate(items):
        cnt: dict[int, int] = defaultdict(int)
        for t in it.vec:
            pl = post[t]
            if len(pl) > cap:
                continue
            for j in pl:
                if j > i and abs(ts[j] - ts[i]) <= win and items[j].lang == it.lang:
                    cnt[j] += 1
        cand = [j for j, c in cnt.items() if c >= 2]
        if cross_lang:
            ccnt: dict[int, int] = defaultdict(int)
            for e in it.ents:
                pl = epost[e]
                if len(pl) > cap * 2:
                    continue
                for j in pl:
                    if j > i and items[j].lang != it.lang and abs(ts[j] - ts[i]) <= win:
                        ccnt[j] += 1
            cand.extend(j for j, c in ccnt.items() if c >= 2)
        for j in cand:
            s = pair_similarity(it, items[j])
            if s >= threshold:
                edges.append((s, i, j))

    edges.sort(key=lambda e: (-e[0], e[1], e[2]))
    uf = _UF(n, ts)
    for s, i, j in edges:
        ri, rj = uf.find(i), uf.find(j)
        if ri == rj:
            continue
        if uf.size[ri] + uf.size[rj] > max_cluster:
            continue
        if max(uf.tmax[ri], uf.tmax[rj]) - min(uf.tmin[ri], uf.tmin[rj]) > win:
            continue
        if uf.size[ri] > 1 and uf.size[rj] > 1 and s < threshold + 0.1:
            continue   # per fondere due cluster gia' formati serve un legame piu' forte
        uf.union(i, j)

    groups: dict[int, list[int]] = defaultdict(list)
    for i in range(n):
        groups[uf.find(i)].append(i)
    out = [sorted(g, key=lambda k: (items[k].ts, items[k].id)) for g in groups.values()]
    out.sort(key=lambda g: (items[g[0]].ts, items[g[0]].id))
    return out


def cluster_id(items: list[Item], group: list[int]) -> str:
    """Id stabile del cluster: id dell'articolo piu' vecchio."""
    return items[group[0]].id
