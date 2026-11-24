#!/bin/bash
# Deploy World-Informer to the Apache server. Usage: scripts/deploy.sh [--dry-run] [--skip-build]
#   1. builds the React frontend (web/ -> web/dist)
#   2. rsyncs the Python backend (no frontend sources, no node_modules)
#   3. rsyncs web/dist: assets/ first (hashed files, old ones pruned), index.html last (atomic switch to the new build)
#   4. syncs the static data files and sets up the venv on the server
# Needs ssh host alias `blancostudio`. Never copies .env (create it on the server once), data/ or logs/.
set -euo pipefail

HOST="blancostudio"
REMOTE_DIR="/var/www/blancostudio.dev/public_html/investment"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

DRY=""
SKIP_BUILD=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY="--dry-run" ;;
    --skip-build) SKIP_BUILD=1 ;;
    *) echo "Unknown option: $arg (use --dry-run, --skip-build)" >&2; exit 2 ;;
  esac
done

if [ -z "$SKIP_BUILD" ]; then
  echo ">> Building frontend (web/)"
  command -v npm >/dev/null || { echo "!! npm not found: install Node.js or use --skip-build with an existing web/dist" >&2; exit 1; }
  (
    cd web
    if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
      npm ci --no-audit --no-fund
      touch node_modules
    fi
    npm run build
  )
fi
[ -f web/dist/index.html ] && [ -d web/dist/assets ] || { echo "!! web/dist missing: run the build (or drop --skip-build)" >&2; exit 1; }

echo ">> Syncing backend to $HOST:$REMOTE_DIR"
[ -n "$DRY" ] || ssh "$HOST" "mkdir -p '$REMOTE_DIR/data' '$REMOTE_DIR/logs' '$REMOTE_DIR/assets'"
# --delete removes the old vanilla frontend (index.html, js/, css/, lib/) from the server;
# the new build (/index.html, /assets/) is excluded here, so it is neither copied nor deleted by this step.
rsync -az $DRY --delete --itemize-changes \
  --exclude '.git/' --exclude '.gitignore' --exclude '.env' --exclude '.venv/' --exclude 'venv/' \
  --exclude '/data/' --exclude '/logs/' --exclude 'node_modules/' --exclude 'tests/' --exclude 'docs/' \
  --exclude '__pycache__/' --exclude '*.pyc' --exclude '.pytest_cache/' --exclude '/media/' \
  --exclude '.DS_Store' --exclude '.claude/' --exclude 'package*.json' \
  --exclude '/web/' --exclude '/index.html' --exclude '/assets/' \
  ./ "$HOST:$REMOTE_DIR/"

echo ">> Syncing frontend build (assets/, then index.html)"
rsync -az $DRY --delete --itemize-changes web/dist/assets/ "$HOST:$REMOTE_DIR/assets/"
rsync -az $DRY --itemize-changes --exclude '/assets/' web/dist/ "$HOST:$REMOTE_DIR/"

# Static (non-generated) data files the frontend needs; generated JSON in data/ is produced by cron on the server.
echo ">> Syncing static data files"
STATIC=()
for f in countries.geojson countries.min.geojson data_conflicts.json; do
  [ -f "data/$f" ] && STATIC+=("data/$f")
done
if [ ${#STATIC[@]} -gt 0 ]; then
  rsync -az $DRY --itemize-changes "${STATIC[@]}" "$HOST:$REMOTE_DIR/data/"
fi

[ -n "$DRY" ] && { echo ">> dry run: skipping remote setup"; exit 0; }

echo ">> Remote setup (venv, deps, perms)"
ssh "$HOST" bash -s <<REMOTE
set -euo pipefail
cd '$REMOTE_DIR'
mkdir -p data logs
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r requirements.txt
chmod +x scripts/*.sh scripts/run.py
if [ ! -f .env ]; then
  echo "!! .env missing on server: copy .env.example to .env and fill NASA_FIRMS_API_KEY / AISSTREAM_API_KEY"
fi
REMOTE

echo ">> Done. First run on server: cd $REMOTE_DIR && scripts/10min_update.sh"
