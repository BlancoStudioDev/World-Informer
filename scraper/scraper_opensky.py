"""
OpenSky Network Aircraft Scraper
Fetches real-time aircraft positions within a geographic bounding box.
No API key required (rate-limited without account).
"""
import requests
import json
import os
from datetime import datetime, timezone

def scrape_opensky():
    # Bounding box: lat 30-55, lng 22-60 (Middle East + Ukraine + Eastern Europe)
    params = {
        'lamin': 25.0,
        'lomin': 22.0,
        'lamax': 55.0,
        'lomax': 60.0
    }
    
    url = "https://opensky-network.org/api/states/all"
    
    print("Fetching OpenSky data...")
    print(f"  Area: lat [{params['lamin']}, {params['lamax']}], lng [{params['lomin']}, {params['lomax']}]")
    
    try:
        response = requests.get(url, params=params, timeout=30)
        
        if response.status_code == 429:
            print("  Rate limited by OpenSky. Try again later or use authentication.")
            # Save empty array so frontend doesn't break
            save_results([])
            return
        
        if response.status_code != 200:
            print(f"  Failed ({response.status_code}): {response.text[:200]}")
            save_results([])
            return
        
        data = response.json()
        states = data.get('states', [])
        
        if not states:
            print("  No aircraft found in the area.")
            save_results([])
            return
        
        # OpenSky state vector indices:
        # 0: icao24, 1: callsign, 2: origin_country, 3: time_position, 4: last_contact,
        # 5: longitude, 6: latitude, 7: baro_altitude, 8: on_ground, 9: velocity,
        # 10: true_track(heading), 11: vertical_rate, 12: sensors, 13: geo_altitude,
        # 14: squawk, 15: spi, 16: position_source
        
        aircraft_list = []
        
        for state in states:
            try:
                lat = state[6]
                lng = state[5]
                
                # Skip if no position
                if lat is None or lng is None:
                    continue
                
                aircraft = {
                    "icao24": state[0] or "",
                    "callsign": (state[1] or "").strip(),
                    "origin_country": state[2] or "",
                    "lat": round(lat, 4),
                    "lng": round(lng, 4),
                    "altitude": round(state[7] or state[13] or 0),
                    "velocity": round(state[9] or 0),
                    "heading": round(state[10] or 0),
                    "vertical_rate": round(state[11] or 0, 1),
                    "on_ground": bool(state[8]),
                    "squawk": state[14] or ""
                }
                aircraft_list.append(aircraft)
                
            except (IndexError, TypeError):
                continue
        
        print(f"  Found {len(aircraft_list)} aircraft with valid positions")
        save_results(aircraft_list)
        
    except requests.exceptions.RequestException as e:
        print(f"  Network error: {e}")
        save_results([])

def save_results(data):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, '..', 'data', 'data_opensky.json')
    
    result = {
        "timestamp": datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        "count": len(data),
        "aircraft": data
    }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    print(f"  Saved to {output_path}")

if __name__ == '__main__':
    scrape_opensky()
