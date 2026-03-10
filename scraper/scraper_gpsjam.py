import requests
import json
import os
import h3
from datetime import datetime, timezone

def scrape_gpsjam():
    urls = [
        "https://api.adsb.lol/v2/mil",
        "https://api.adsb.lol/v2/ladd",
        # Bounding box for Europe/MiddleEast (lat 20 to 65, lon 10 to 60)
        "https://api.adsb.lol/v2/lat/20/65/lon/10/60"
    ]
    
    print("Fetching active aircraft from ADSB.lol for GPS Jamming H3 Hex analysis...")
    
    seen_hex = set()
    total_processed = 0
    hex_data = {} # h3_index -> {'total': 0, 'bad': 0}
    
    H3_RESOLUTION = 4  # Hexagon width ~20-30km
    
    for url in urls:
        try:
            response = requests.get(url, timeout=30)
            if response.status_code != 200:
                print(f"  Failed ({response.status_code}) for {url}")
                continue
                
            data = response.json()
            aircraft_list = data.get('ac', [])
            total_processed += len(aircraft_list)
            
            for ac in aircraft_list:
                hex_code = ac.get('hex', '')
                if hex_code in seen_hex:
                    continue
                seen_hex.add(hex_code)
                
                lat = ac.get('lat')
                lng = ac.get('lon')
                alt = ac.get('alt_baro')
                
                # Must have a valid position and be airborne
                if lat is None or lng is None:
                    continue
                if alt == 'ground' or (isinstance(alt, (int, float)) and alt < 1000):
                    continue
                    
                # NIC < 7 signifies degraded navigating/accuracy.
                nic = ac.get('nic')
                is_bad = 1 if (nic is not None and nic < 6) else 0
                
                h3_index = h3.latlng_to_cell(lat, lng, H3_RESOLUTION)
                
                if h3_index not in hex_data:
                    hex_data[h3_index] = {'total': 0, 'bad': 0}
                    
                hex_data[h3_index]['total'] += 1
                hex_data[h3_index]['bad'] += is_bad
            
        except requests.exceptions.RequestException as e:
            print(f"  Network error for {url}: {e}")
        except (ValueError, KeyError) as e:
            print(f"  Parsing error for {url}: {e}")

    jammed_hexes = []
    
    for h3_index, stats in hex_data.items():
        total = stats['total']
        bad = stats['bad']
        
        # We need at least 1 aircraft in the hex to measure
        if total == 0:
            continue
            
        bad_percent = (bad / total) * 100
        
        # GPSJAM standard: Green < 2%, Yellow 2-10%, Red > 10%
        if bad_percent > 10.0:
            severity = 'red'
        elif bad_percent > 2.0:
            severity = 'yellow'
        else:
            severity = 'green'
            
        # Get polygon boundaries for frontend drawing
        # h3.cell_to_boundary returns tuple of tuples ((lat, lng), ...)
        boundary = h3.cell_to_boundary(h3_index)
        
        # For GeoJSON and 3D we usually need [lng, lat]
        polygon_lnglat = [[round(lng, 4), round(lat, 4)] for lat, lng in boundary]
        
        # GeoJSON requires the first and last point of a polygon ring to be identical
        if polygon_lnglat and polygon_lnglat[0] != polygon_lnglat[-1]:
            polygon_lnglat.append(polygon_lnglat[0])
            
        jammed_hexes.append({
            "id": h3_index,
            "severity": severity,
            "total_ac": total,
            "bad_ac": bad,
            "bad_pct": round(bad_percent, 1),
            "polygon": polygon_lnglat
        })
        
    print(f"  Processed {total_processed} total unique airborne aircraft.")
    print(f"  Generated {len(jammed_hexes)} H3 Hexagons.")
    
    # Optional: we can filter out green hexes if we only want to show jammed areas
    # to keep the payload very small. But showing green gives full coverage context like GPSJAM.org.
    # Let's keep them all.
    
    save_results(jammed_hexes)

def save_results(data):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, '..', 'data', 'data_gpsjam.json')
    
    # Optional: Deduplicate points very close to each other to make the heatmap smaller?
    # We'll rely on the frontend to cluster/heatmap.
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    
    print(f"  Saved to {output_path}")

if __name__ == '__main__':
    scrape_gpsjam()
