# World-Informer

Globo 3D con le notizie dal mondo aggiornate ogni 10 minuti, layer OSINT (incendi, voli militari, navi, satelliti, GPS jamming, terremoti, nucleare, radiazioni) e stima dell'impatto sui settori di mercato.
**La valutazione delle notizie è al 100% algoritmica: nessun LLM e nessun costo a token.**

Online: https://blancostudio.dev/investment/

## Come funziona

```
collectors/  ->  data/articles_store.json  ->  engine/  ->  data/events.json, markets.json, report_daily.json  ->  frontend statico
```

- **collectors/**: 55 feed RSS (internazionali, finanziari, italiani e regionali), ANSA ultima ora e 18 canali Telegram OSINT. Gestisce anche i layer FIRMS, AIS (aisstream), adsb.lol (voli e GPS jam), CelesTrak, Overpass e Safecast.
- **engine/**: Python puro, solo libreria standard, senza rete. Fa questi passaggi:
  - gazetteer it/en con 201 paesi, capitali, città e leader;
  - riconoscimento del paese colpito rispetto a quello che agisce;
  - classificazione a lessico pesato in 15 tipi di evento;
  - gravità da 0 a 10 da lessico, numero di vittime e prior per tipo;
  - clustering degli articoli sulla stessa notizia;
  - scoring per settore GICS e rischio paese, con le tabelle ereditate da News-Evaluator.
- **frontend** (`index.html`, `js/`, `css/`, `lib/`): è statico. Ricarica i dati ogni 60 s e offre filtri, scheda Mercati e mappa 2D.

Dettagli e formule: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Avvio locale

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env          # NASA_FIRMS_API_KEY, AISSTREAM_API_KEY
.venv/bin/python scripts/run.py fast
python3 -m http.server 8765   # http://localhost:8765
```

Test: `python3 -m pytest -q`

## Job

| Job | Cosa fa | Cron sul server |
|---|---|---|
| `scripts/run.py fast` | notizie + engine + voli, navi, GPS jam (~1 min) | `scripts/10min_update.sh`, ogni 10 min |
| `scripts/run.py daily` | fast + FIRMS, satelliti, nucleare, radiazioni | `scripts/daily_update.sh`, ogni giorno alle 07:00 |

Ogni job ha un lock, quindi non può partire due volte in contemporanea. I log sono in `logs/run.log`.

## Deploy

```bash
scripts/deploy.sh            # oppure --dry-run
```

Lo script fa rsync verso `blancostudio:/var/www/blancostudio.dev/public_html/investment/` e installa le dipendenze in `.venv` sul server.
Il file `.env` non viene mai copiato dallo script: va creato a mano sul server.
Il `.htaccess` blocca l'accesso pubblico a `.env`, codice, log e archivio articoli.
