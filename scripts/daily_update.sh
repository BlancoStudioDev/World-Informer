#!/bin/bash

# Define project root (assuming script is in /scripts/ subdirectory)
# Resolve the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Navigate to project root
cd "$PROJECT_ROOT"

# Logs directory
mkdir -p logs

# Timestamp for log
echo "=================================================="
echo "Starting update at $(date)"
echo "Project Root: $PROJECT_ROOT"

# Activate Venv if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
    PYTHON_CMD="python3"
fi

# Run Scrapers
echo "Running Scraper ANSA..."
$PYTHON_CMD scraper/scraper_ansa.py

echo "Running Scraper Corriere..."
$PYTHON_CMD scraper/scraper_corriere.py

echo "Running Scraper Sole 24 Ore..."
$PYTHON_CMD scraper/scraper_sole24ore.py

# Run AI Updater
echo "Running Map AI Updater..."
$PYTHON_CMD scripts/update_map_ai.py

# Run Detailed Scraper for Video
echo "Running Detailed ANSA Scraper..."
$PYTHON_CMD scraper/scraper_ansa_detailed.py

echo "Running BBC Scraper..."
$PYTHON_CMD scraper/scraper_bbc.py

echo "Running CNN Scraper..."
$PYTHON_CMD scraper/scraper_cnn.py

echo "Running Al Jazeera Scraper..."
$PYTHON_CMD scraper/scraper_aljazeera.py

echo "Running Guardian Scraper..."
$PYTHON_CMD scraper/scraper_guardian.py

# NOTA: NASA FIRMS e OpenSky sono aggiornati ogni 10 minuti tramite lo script 10min_update.sh

echo "Running Telegram OSINT Scraper..."
$PYTHON_CMD scraper/scraper_telegram.py

echo "Running Satellites Scraper..."
$PYTHON_CMD scraper/scraper_satellites.py

echo "Update finished at $(date)"
echo "=================================================="
