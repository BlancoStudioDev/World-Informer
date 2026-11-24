#!/bin/bash
# Deploy World-Informer to the Apache server. Usage: scripts/deploy.sh [--dry-run]
# Needs ssh host alias `blancostudio`. Never copies .env (create it on the server once), data/ or logs/.
set -euo pipefail

HOST="blancostudio"
REMOTE_DIR="/var/www/blancostudio.dev/public_html/investment"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

DRY=""
[ "${1:-}" = "--dry-run" ] && DRY="--dry-run"

echo ">> Syncing code to $HOST:$REMOTE_DIR"
ssh "$HOST" "mkdir -p '$REMOTE_DIR/data' '$REMOTE_DIR/logs'"
rsync -az $DRY --delete --itemize-changes \
  --exclude '.git/' --exclude '.gitignore' --exclude '.env' --exclude '.venv/' --exclude 'venv/' \
  --exclude '/data/' --exclude '/logs/' --exclude 'node_modules/' --exclude 'tests/' --exclude 'docs/' \
  --exclude '__pycache__/' --exclude '*.pyc' --exclude '.pytest_cache/' --exclude '/media/' \
  --exclude '.DS_Store' --exclude '.claude/' --exclude 'package*.json' \
  ./ "$HOST:$REMOTE_DIR/"

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
