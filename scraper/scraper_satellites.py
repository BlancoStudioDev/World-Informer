"""
NASA/CelesTrak Satellite TLE Scraper
Fetches Two-Line Elements (TLEs) for various active satellites and parses them into JSON.
"""
import requests
import json
import os

def fetch_tles(url):
    """Fetches TLEs from a CelesTrak URL and parses them."""
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        lines = response.text.strip().split('\n')
        satellites = []
        
        # A TLE consists of 3 lines: Name, Line 1, Line 2
        for i in range(0, len(lines), 3):
            if i + 2 < len(lines):
                name = lines[i].strip()
                # Remove extra trailing characters or spaces from the name
                name = name.rstrip()
                line1 = lines[i+1].strip()
                line2 = lines[i+2].strip()
                satellites.append({
                    "name": name,
                    "line1": line1,
                    "line2": line2
                })
        return satellites
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return []

def scrape_satellites():
    # Interesting categories to fetch from Celestrak
    urls = {
        "active": "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle",
    }
    
    all_satellites = []
    seen_names = set()
    
    for category, url in urls.items():
        print(f"Fetching {category} satellites...")
        sats = fetch_tles(url)
        
        # Filter for LEO (Low Earth Orbit) satellites.
        # A rough heuristic for LEO is an orbital period of less than 128 minutes,
        # which corresponds to a mean motion of > 11.25 revolutions per day.
        leo_sats = []
        for sat in sats:
            try:
                # Line 2, chars 53-63 is the mean motion in revs/day
                mean_motion = float(sat['line2'][52:63].strip())
                if mean_motion > 11.25:
                    leo_sats.append(sat)
            except (ValueError, IndexError):
                continue
                
        # Limit Starlink to be nice to the browser if rendering 6000+ is too heavy
        # Let's take the first 1000 starlinks as a good representative sample of the "cloud"
        starlink_count = 0
        final_sats = []
        for sat in leo_sats:
            if "STARLINK" in sat['name'].upper():
                starlink_count += 1
                if starlink_count > 1000:
                    continue
            final_sats.append(sat)
            
        for sat in final_sats:
            sat['category'] = category
            if sat['name'] not in seen_names:
                all_satellites.append(sat)
                seen_names.add(sat['name'])
                
        print(f"  Loaded {len(final_sats)} {category} LEO satellites")
        
    print(f"\nTotal unique LEO satellites loaded: {len(all_satellites)}")
    
    # Save to JSON
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, '..', 'data', 'data_satellites.json')
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(all_satellites, f, ensure_ascii=False, indent=2)
        
    print(f"Saved to {output_path}")

if __name__ == '__main__':
    scrape_satellites()
