#!/bin/bash
# Cron wrapper (every 10 min). The server crontab calls this path; real logic lives in scripts/run.py.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT" || exit 1
mkdir -p logs data
PY=python3
[ -x ".venv/bin/python" ] && PY=".venv/bin/python"
exec "$PY" scripts/run.py fast
