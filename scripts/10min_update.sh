#!/bin/bash

# Define project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Navigate to project root
cd "$PROJECT_ROOT"

# Logs directory
mkdir -p logs

# Timestamp for log
echo "=================================================="
echo "Starting 10-minute update at $(date)"

# Activate Venv if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
    PYTHON_CMD="python3"
else
    PYTHON_CMD="python3"
fi

echo "Running NASA FIRMS Scraper..."
$PYTHON_CMD scraper/scraper_firms.py

echo "Running OpenSky Scraper..."
$PYTHON_CMD scraper/scraper_opensky.py

echo "Running AIS Ships Scraper..."
$PYTHON_CMD scraper/scraper_ships.py

echo "Running GPS Jamming Scraper..."
$PYTHON_CMD scraper/scraper_gpsjam.py

echo "--- NEWS SCRAPERS ---"
echo "Running Scraper ANSA..."
$PYTHON_CMD scraper/scraper_ansa.py

echo "Running Scraper Corriere..."
$PYTHON_CMD scraper/scraper_corriere.py

echo "Running Scraper Sole 24 Ore..."
$PYTHON_CMD scraper/scraper_sole24ore.py

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

echo "Running Scraper ANSA Ultima Ora..."
$PYTHON_CMD scraper/scraper_ansa_ultima_ora.py

echo "Running Telegram OSINT Scraper..."
$PYTHON_CMD scraper/scraper_telegram.py

echo "Generating Daily News Report..."
$PYTHON_CMD scripts/generate_report.py

echo "10-minute update finished at $(date)"
echo "=================================================="
