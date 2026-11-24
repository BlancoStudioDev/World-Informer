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
- **frontend** (`web/`): app React 19 + TypeScript + Tailwind v4 + shadcn/ui compilata in file statici (`web/dist`). Globo 3D in scala di grigi, feed notizie con filtri, layer OSINT, Mercati, Telegram, Report 24h, dirette e mappa 2D. Ricarica i dati ogni 60 s.

Dettagli e formule: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Avvio locale

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env          # NASA_FIRMS_API_KEY, AISSTREAM_API_KEY
.venv/bin/python scripts/run.py fast
cd web && npm install && npm run dev   # http://localhost:5173 (Vite serve ../data su /data)
```

Test: `python3 -m pytest -q`

## Frontend (`web/`)

Stack: Vite + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui (base neutral), zustand, globe.gl, satellite.js, Leaflet.
Design minimale: sfondo chiaro, scala di grigi, il colore compare solo per la gravità (alta/media/bassa).

```bash
cd web
npm install
npm run dev        # sviluppo: Vite serve ../data su /data (nessuna copia dei dati)
npm run build      # produce web/dist (index.html + assets/)
npm run preview    # prova la build, sempre con ../data su /data
```

- Percorsi relativi (`data/events.json`, …) e `base: './'`: funziona sotto `https://blancostudio.dev/investment/`, dove `index.html` sta accanto a `data/`.
- Globo, mappa 2D, dirette, Mercati/TradingView, Telegram e Report si caricano a richiesta (code splitting); FIRMS e satelliti girano in Web Worker.
- Con `?debug` l'app espone `window.__wi` (istanza del globo, store, `bench()` per misurare il render, contatori di render React).
- Scorciatoie: `J`/`K` evento successivo/precedente, `/` cerca, `Esc` chiude il dettaglio.

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

Lo script compila il frontend (`npm ci && npm run build` in `web/`), poi fa rsync verso `blancostudio:/var/www/blancostudio.dev/public_html/investment/`: backend Python, `web/dist/` nella radice (`index.html`, `assets/`) e dati statici (`countries*.geojson`, `data_conflicts.json`). Infine installa le dipendenze in `.venv` sul server. `--dry-run` compila e mostra solo cosa verrebbe copiato; `--skip-build` riusa `web/dist`.
Il file `.env` non viene mai copiato dallo script: va creato a mano sul server.
Il `.htaccess` blocca l'accesso pubblico a `.env`, codice, log e archivio articoli.
