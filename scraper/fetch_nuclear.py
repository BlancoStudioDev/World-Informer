import requests
import json
import os

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OVERPASS_QUERY = """
[out:json];
(
  node["power"="plant"]["plant:source"="nuclear"];
  way["power"="plant"]["plant:source"="nuclear"];
  relation["power"="plant"]["plant:source"="nuclear"];
);
out center;
"""

def fetch_nuclear_plants():
    print("Fetching nuclear plants from Overpass API...")
    response = requests.post(OVERPASS_URL, data={'data': OVERPASS_QUERY})
    response.raise_for_status()
    data = response.json()
    
    plants = []
    for el in data.get('elements', []):
        tags = el.get('tags', {})
        name = tags.get('name', tags.get('name:en', 'Unknown Nuclear Plant'))
        
        # Get coordinates based on element type
        if el['type'] == 'node':
            lat, lon = el['lat'], el['lon']
        else:
            center = el.get('center', {})
            lat, lon = center.get('lat'), center.get('lon')
            
        if lat and lon:
            # Capacity details if available
            output = tags.get('plant:output:electricity', '')
            plants.append({
                "name": name,
                "lat": lat,
                "lng": lon, # globe.gl expects lng
                "output": output
            })
            
    # Save to data directory
    output_path = os.path.join(os.path.dirname(__file__), '../data/data_nuclear.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(plants, f, indent=2, ensure_ascii=False)
        
    print(f"Saved {len(plants)} nuclear facilities to {output_path}")

if __name__ == "__main__":
    fetch_nuclear_plants()
