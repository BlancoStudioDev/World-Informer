"""Sentiment lessicale en/it -> [-1, 1] (negativo = cattive notizie)."""
from __future__ import annotations

from functools import lru_cache

from . import text as T

NEG = """
3: killed, kills, dead, death, deaths, died, massacre*, genocid*, war, wars, attack*, bomb*, missile*, strike*, explosion*, terror*, crash*, collapse*, plunge*, crisis, catastroph*, disaster*, devastat*,
   tragedy, tragic, victims, casualties, hostages, murder*, shot, shooting, famine, pandemic, outbreak, coup, assassinat*, invasion, bloodbath, slaughter,
   morti, morto, morta, uccisi, ucciso, uccisa, vittime, strage, stragi, massacro, guerra, guerre, attacco, attacchi, attentato, bomba, bombe, bombardament*, missili, esplosione, terroris*, crollo, crolla*,
   catastrof*, disastro, devastazion*, tragedia, tragico, ostaggi, omicidio, carestia, pandemia, focolaio, invasione, carneficina, tonfo, tracollo
2: threat*, minaccia*, warns, warning, avverte, sanction*, sanzion*, fear*, paura, panic, panico, fall, falls, fell, cade, cala, calo, crolla, losses, perdite, loses, perde, decline, drop*, slump*, plummet*, tumble*, recession,
   recessione, inflation, inflazione, unemployment, disoccupazione, layoffs, licenziamenti, protest*, proteste, riot*, rivolta, unrest, tensions, tensioni, tension, escalat*, clash*, scontri, fighting, combattimenti, violence,
   violenza, injured, feriti, wounded, evacuat*, sfollati, refugees, rifugiati, fire, incendio, flood*, alluvione, earthquake*, terremoto, storm*, tempesta, hurricane*, uragano, bankruptcy, bancarotta, fallimento, default, debt, debito,
   deficit, tariff*, dazi, embargo, blockade, blocco, ban, divieto, arrested, arrestato, accused, accusato, scandal*, scandalo, fraud*, frode, hack*, cyberattack*, breach, outage, shortage*, carenza, disruption*, interruzione, delays, ritardi
1: concern*, preoccupazione, risk*, rischio, rischi, worry, worries, uncertain*, incertezza, doubt*, dubbi, trouble, problem*, problemi, struggle*, difficolta, strain*, hit, colpito, cut*, tagli, taglio, lawsuit, causa, probe, indagine
"""
POS = """
3: peace, pace, ceasefire, cease fire, cessate il fuoco, truce, tregua, agreement, accordo, intesa, deal, rescued, salvati, salvato, freed, liberati, liberato, released, rilasciati, recovery, ripresa, rebound, rimbalzo,
   record high, massimi storici, breakthrough, svolta, success*, successo, victory, vittoria, wins, vince, won, celebrate*, celebra*, relief, sollievo, hope, speranza, reopen*, riapre, riaprono, resume*, riprende, riprendono,
   approved, approvato, approva, approves, cure, cura, vaccine, vaccino, discovery, scoperta, boom, rally, impennata
2: growth, crescita, rise, rises, rose, sale, aumenta, gain*, guadagn*, profit*, utili, rialzo, rialzi, rimbalza*, surge*, soar*, balza, vola, improve*, miglior*, boost*, rilancio, invest*, investimenti, expansion, espansione,
   cooperation, cooperazione, talks, colloqui, negotiat*, negoziat*, dialogue, dialogo, support, sostegno, aid, aiuti, rescue, soccorsi, reform*, riforma, riforme, stimulus, stimoli, relief efforts, welcome*, accoglie, praise*, elogia,
   launch*, lancia, innovation, innovazione, award, premio, wins, record, upgrade, rialzo del rating, easing, allentamento, de-escalat*, distensione, truce
1: optimis*, ottimismo, positive, positivo, positiva, strong, forte, stable, stabile, stabilita, steady, calm, calma, safe, sicuro, sicura, help*, aiuto, solidarity, solidarieta, unity, unita
"""


def _build():
    m = T.TermMatcher()
    for polarity, block in ((-1.0, NEG), (1.0, POS)):
        w = 1.0
        for line in block.strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            head = line.split(":", 1)[0]
            if head.isdigit():
                w = float(head)
                rest = line.split(":", 1)[1]
            else:
                rest = line
            for t in rest.split(","):
                t = t.strip().lower()
                if t:
                    m.add(t, polarity * w)
    return m


_M: T.TermMatcher | None = None


def _matcher():
    global _M
    if _M is None:
        _M = _build()
    return _M


def _field_score(text: str, mult: float):
    if not text:
        return 0.0, 0.0
    orig = T.tokenize(text)
    low = [t.lower() for t in orig]
    pos = neg = 0.0
    for i, j, seq, payloads in _matcher().scan(low, orig):
        # negazione semplice: "no"/"non"/"not" subito prima inverte il segno
        neg_prev = i > 0 and low[i - 1] in ("no", "non", "not", "senza", "without", "nessun", "nessuna")
        for w in payloads:
            if neg_prev:
                w = -w * 0.7
            if w > 0:
                pos += w * mult
            else:
                neg += -w * mult
    return pos, neg


@lru_cache(maxsize=40000)
def _sentiment(title: str, summary: str) -> float:
    p1, n1 = _field_score(title, 2.0)
    p2, n2 = _field_score(summary, 1.0)
    pos, neg = p1 + p2, n1 + n2
    tot = pos + neg
    if tot == 0:
        return 0.0
    # (pos-neg)/(tot+k): piu' segnali -> piu' vicino a +-1
    return round(max(-1.0, min(1.0, (pos - neg) / (tot + 4.0))), 3)


def sentiment(title: str, summary: str = "") -> float:
    """-1 (molto negativo) .. +1 (molto positivo); 0 = neutro/nessun segnale."""
    return _sentiment(title or "", summary or "")
