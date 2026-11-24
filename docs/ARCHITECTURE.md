# World-Informer v2 — Architettura

Sito statico (globo 3D) + pipeline Python eseguita da cron che riscrive file JSON in `data/`.
**Nessun LLM in nessun punto**: tutta la valutazione delle notizie è algoritmica (keyword, gazetteer, formule).
Deploy: Apache serve la cartella del progetto su `https://blancostudio.dev/investment/` (nessun backend live).

## Layout

```
engine/                 # pacchetto Python, PURO (no rete, no I/O tranne lettura dei propri file dati)
  __init__.py
  data/gazetteer.json   # paesi: iso2, nomi en/it, demonimi, capitali, città, centroide, regione
  data/event_lexicon.json  # keyword/regex per event_type, en+it
  config.py             # SECTOR_SENSITIVITY, COUNTRY_RISK (per iso2), PERSISTENCE_DAYS, SEVERITY_PRIOR
  text.py               # normalizzazione, tokenizzazione, stopword en/it, shingle
  geo.py                # locate(title, summary, hint=None) -> list[CountryHit]
  classify.py           # classify(title, summary) -> (event_type, confidence, matched_terms)
  severity.py           # severity(title, summary, event_type) -> float 0..10
  sentiment.py          # lessico en/it -> float -1..1
  cluster.py            # raggruppa articoli simili in eventi (MinHash/TF-IDF cosine, puro python)
  scoring.py            # sector_scores, global_score, persistence, confidence
  pipeline.py           # build_events(articles: list[Article], now) -> list[Event]
  report.py             # build_report(events, articles, telegram, now) -> dict (report 24h)
tests/                  # pytest per engine
collectors/             # I/O di rete: ogni modulo espone collect() -> list[Article] o scrive un file layer
  news_rss.py           # feed RSS (BBC, CNN, Al Jazeera, Guardian, ANSA, Corriere, Sole24Ore, DW, France24, NYT, AP via RSS...)
  ansa_ultima_ora.py
  telegram.py
  firms.py, ships.py, gpsjam.py, satellites.py, nuclear.py, flights.py
scripts/
  run.py                # entrypoint: `python scripts/run.py fast|news|daily` con lock file
  10min_update.sh       # wrapper cron (nome invariato: il crontab sul server punta qui)
  daily_update.sh       # wrapper cron (nome invariato)
  deploy.sh             # rsync verso blancostudio:/var/www/blancostudio.dev/public_html/investment
web/                    # frontend React (Vite): src/ → build in web/dist (index.html + assets/), servito accanto a data/
data/                   # output generati (gitignored)
```

## Schemi (contratto tra engine, collectors e frontend)

### Article (input engine, prodotto dai collectors)
```json
{"id": "sha1(url)[:16]", "title": "...", "summary": "testo breve (<=600 char, no HTML)",
 "url": "https://...", "source": "BBC", "lang": "en|it",
 "published_at": "ISO8601 UTC", "geo_hint": "stringa opzionale (es. sezione/kicker)"}
```

### data/events.json (letto dal frontend, layer News)
```json
{
  "generated_at": "ISO8601",
  "window_hours": 48,
  "events": [{
    "id": "hash stabile del cluster (id del primo articolo)",
    "title": "titolo rappresentativo",
    "summary": "...",
    "event_type": "geopolitical_conflict",
    "event_label": "Conflitto geopolitico",
    "severity": 7.4,                 // 0..10
    "severity_band": "high",         // minimal|low|moderate|high|severe
    "sentiment": -0.6,
    "global_score": 0..100,          // per dimensione/colore marker e ordinamento
    "confidence": 0..1,
    "persistence_days": 90,
    "countries": [{"iso2": "UA", "name": "Ucraina", "weight": 0.8}],
    "lat": 48.4, "lng": 31.2,        // posizione primaria (paese con peso maggiore, o città se trovata)
    "location_label": "Kyiv, Ucraina",
    "sector_scores": {"energy": 0.62, "materials": ..., 11 settori GICS},
    "top_sectors": ["energy", "financials"],
    "sources": ["BBC", "Al Jazeera"],
    "n_sources": 2,
    "articles": [{"title":"...","url":"...","source":"BBC","published_at":"..."}],
    "first_seen": "ISO8601", "last_seen": "ISO8601",
    "explanation": ["keyword: missile, strike", "paese: Ucraina (rischio 6.0)", "2 fonti"]
  }]
}
```
Eventi senza paese individuato: inclusi con `lat/lng = null` (solo feed, niente marker).

### data/markets.json (pannello impatto mercati)
```json
{"generated_at": "...",
 "sectors": [{"sector":"energy","label":"Energia","score":0..100,"trend":"up|down|flat","top_events":["id",...]}],
 "countries": [{"iso2":"IR","name":"Iran","risk_score":0..100,"n_events":5,"lat":..,"lng":..}]}
```
`risk_score` per paese alimenta la colorazione dei poligoni (sostituisce data_conflicts.json statico, che resta come fallback).

### data/report_daily.json
Stesse chiavi di prima: `generated_at,total_count,day_at_glance,major_stories,sources_volume,latest_headlines`
(major_stories = top eventi per global_score nelle 24h).

### Layer OSINT (schemi invariati rispetto alla v1)
`data_firms.json`, `data_ships.json`, `data_gpsjam.json`, `data_satellites.json`, `data_nuclear.json`,
`data_telegram.json`, `data_ansa_ultima_ora.json`, più nuovo `data_flights.json` = `{"timestamp", "aircraft":[{hex,flight,lat,lng,alt,gs,track,type,squawk,category:"mil|emergency"}]}`
(scaricato lato server da adsb.lol: niente proxy CORS).

## API Python dell'engine (usata da scripts/run.py)

```python
from engine.pipeline import build_events, build_markets   # build_events(articles: list[dict], now: datetime) -> dict (events.json)
                                                          # build_markets(events_doc: dict, prev_markets: dict|None, now) -> dict (markets.json)
from engine.report import build_report                    # build_report(events_doc, articles, telegram: list[dict], now) -> dict
```
`scripts/run.py news` mantiene uno storico articoli in `data/articles_store.json` (ultime 72h, dedup per id) e passa a build_events le ultime 48h.

## Algoritmi (engine)

1. **Geo**: gazetteer con nomi/alias en+it, demonimi ("iraniano", "Iranian"), capitali e ~3 città principali per paese, alias speciali (Gaza→PS, Kyiv/Kiev→UA, Washington/Casa Bianca→US, Cremlino→RU, Bruxelles/UE→BE con flag EU).
   Match su confini di parola, case-insensitive, gestione ambiguità (es. "Georgia", "Jordan", "Turkey" come tacchino, "Chad" nome). Peso titolo 3x, summary 1x; normalizzato 0..1.
2. **Classificazione**: lessico pesato per 15 event_type (stessi di News-Evaluator) + `other`; score = somma pesi termini matchati (titolo x2); vince il massimo se ≥ soglia, altrimenti `other`.
3. **Severity**: prior per event_type + boost lessicali (morti/vittime con numero estratto via regex in scala log, "guerra", "crollo", "record", "emergenza", magnitudo terremoto) − attenuatori ("colloqui", "accordo", "tregua" riducono), clamp 0..10.
4. **Clustering**: shingle di parole (stopword rimosse) → Jaccard/MinHash + cosine TF-IDF sui titoli; soglia ~0.5; finestra 48h; union-find. Evento = cluster.
5. **Scoring** (da News-Evaluator, senza PESTLE):
   `sector[s] = min(1, sev/10 × SENS[type][s] × geo_factor × (0.5+0.5|sent|))`, `geo_factor = 1 + mean(risk)/10`
   `global_score = 100 × min(1, sev/10 × breadth × geo_factor × source_boost)`, `breadth = 1+(n_settori>0.3 −1)/10`, `source_boost = 1 + 0.15·ln(n_sources)`
   `confidence = 0.5·min(1,n_sources/5) + 0.3·class_conf + 0.2·(1 se paese trovato)`.
6. **Decadimento temporale**: score eventi × exp(−età_ore / (24·persistence_scale)) per ranking.
