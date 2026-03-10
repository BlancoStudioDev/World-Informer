"""
NASA FIRMS Fire Hotspot Scraper — GLOBAL COVERAGE
Fetches active fire/thermal anomaly data from VIIRS and MODIS sensors.
Uses the MAP_KEY from .env for authentication.
Covers the entire world using multiple bounding-box tiles.
"""
import requests
import json
import os
import csv
from io import StringIO

# Load .env manually
def load_env():
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env')
    env_vars = {}
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, val = line.split('=', 1)
                    env_vars[key.strip()] = val.strip()
    return env_vars

def scrape_firms():
    env = load_env()
    MAP_KEY = env.get('NASA_FIRMS_API_KEY', '')
    
    if not MAP_KEY:
        print("ERROR: NASA_FIRMS_API_KEY not found in .env")
        return

    # Global bounding boxes (west,south,east,north)
    # Split the world into tiles to stay within API limits
    areas = [
        {"name": "Europe & N.Africa",   "bbox": "-15,25,45,72"},
        {"name": "Middle East",          "bbox": "25,10,65,55"},
        {"name": "East Asia",            "bbox": "65,10,150,55"},
        {"name": "SE Asia & Oceania",    "bbox": "90,-50,180,10"},
        {"name": "Sub-Sahara Africa",    "bbox": "-20,-40,55,25"},
        {"name": "North America",        "bbox": "-170,10,-50,72"},
        {"name": "Central America",      "bbox": "-120,-5,-60,30"},
        {"name": "South America",        "bbox": "-85,-60,-30,15"},
        {"name": "Russia & N.Asia",      "bbox": "45,50,180,80"},
    ]
    
    # Sensors to query (NRT = Near Real Time)
    sensors = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'MODIS_NRT']
    
    # Fetch last 2 days for more coverage
    days = 2
    
    all_hotspots = []
    seen = set()  # de-duplicate by lat/lng/date
    
    for area in areas:
        for sensor in sensors:
            url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{sensor}/{area['bbox']}/{days}"
            
            print(f"  [{sensor}] {area['name']}...", end=" ")
            
            try:
                response = requests.get(url, timeout=45)
                
                if response.status_code != 200 or 'Invalid' in response.text[:50]:
                    print(f"skipped (HTTP {response.status_code}: {response.text[:100].strip()})")
                    continue
                
                reader = csv.DictReader(StringIO(response.text))
                count = 0
                
                for row in reader:
                    try:
                        lat = float(row.get('latitude', 0))
                        lng = float(row.get('longitude', 0))
                        frp = float(row.get('frp', 0))
                        brightness = float(row.get('bright_ti4', row.get('brightness', 0)))
                        confidence_raw = row.get('confidence', 'low')
                        acq_date = row.get('acq_date', '')
                        acq_time = row.get('acq_time', '')
                        daynight = row.get('daynight', '')
                        
                        # De-duplicate
                        key = f"{round(lat,3)},{round(lng,3)},{acq_date}"
                        if key in seen:
                            continue
                        seen.add(key)
                        
                        # Map confidence
                        if confidence_raw in ('high', 'h'):
                            confidence = 'high'
                        elif confidence_raw in ('nominal', 'n'):
                            confidence = 'nominal'
                        else:
                            confidence = 'low'
                        
                        hotspot = {
                            "lat": round(lat, 4),
                            "lng": round(lng, 4),
                            "frp": round(frp, 1),
                            "brightness": round(brightness, 1),
                            "confidence": confidence,
                            "date": acq_date,
                            "time": str(acq_time).zfill(4),
                            "daynight": daynight,
                            "sensor": sensor.split('_')[0]
                        }
                        all_hotspots.append(hotspot)
                        count += 1
                    except (ValueError, KeyError):
                        continue
                
                print(f"{count}")
                
            except requests.exceptions.RequestException as e:
                print(f"error: {e}")

    # Sort by FRP descending (most intense first)
    all_hotspots.sort(key=lambda h: h['frp'], reverse=True)
    
    print(f"\n{'='*40}")
    print(f"Total FIRMS hotspots: {len(all_hotspots)}")
    if all_hotspots:
        frps = [h['frp'] for h in all_hotspots]
        print(f"FRP range: {min(frps)} — {max(frps)} MW")
    print(f"{'='*40}")
    
    # Save
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, '..', 'data', 'data_firms.json')
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(all_hotspots, f, ensure_ascii=False, indent=2)
    
    print(f"Saved to {output_path}")

if __name__ == '__main__':
    scrape_firms()
