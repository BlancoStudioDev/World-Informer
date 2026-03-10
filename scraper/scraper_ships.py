import os
import json
import time
from dotenv import load_dotenv
import websocket
from math import radians, sin, cos, sqrt, atan2

# Load environment variables
load_dotenv()
API_KEY = os.getenv("AISSTREAM_API_KEY")

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "../data/data_ships.json")

# Target Ship Types
# 35: Military Ops
# 51: SAR (Search and Rescue)
# 52: Tugs
# 58: Medical Transports
# 59: Ships according to RR Resolution No. 18 (Mobility/Military)
TARGET_TYPES = {35, 51, 52, 58, 59}

# Bounding box: Global
BOUNDING_BOX = [[[-90.0, -180.0], [90.0, 180.0]]]

def get_ship_type_name(type_code):
    if type_code == 35: return "Military"
    if type_code == 51: return "Search & Rescue"
    if type_code == 52: return "Tug"
    if type_code == 58: return "Medical Transport"
    if type_code == 59: return "Military/Mobility"
    return "Unknown"

def fetch_ais_data():
    if not API_KEY or API_KEY == "your_api_key_here":
        print("AISSTREAM_API_KEY environment variable not set or invalid.")
        print("Please sign up at https://aisstream.io/ and add your API key to the .env file.")
        return []

    collected_ships = {}

    subscribe_message = {
        "APIKey": API_KEY,
        "BoundingBoxes": BOUNDING_BOX,
        "FilterMessageTypes": ["PositionReport"]
    }

    start_time = time.time()
    duration = 120.0

    def on_message(ws, message):
        try:
            msg = json.loads(message)
            if msg["MessageType"] == "PositionReport":
                meta = msg["MetaData"]
                data = msg["Message"]["PositionReport"]

                mmsi = meta["MMSI"]
                ship_name = meta["ShipName"].strip() or str(mmsi)
                lat = meta["latitude"]
                lng = meta["longitude"]
                
                # We do not have ship type directly in PositionReport, 
                # but Aisstream sometimes includes ship type in MetaData for standard accounts if previously seen.
                # Since aisstream position reports do not contain Type 5 data (static data) reliably, 
                # we will just collect all ships we can find with 'Navy', 'Warship', 'SAR', 'Rescue', 'Coast Guard' 
                # in their names, or broadly collect random ships if we cannot filter by type code perfectly on the free tier.
                
                heading = data.get("TrueHeading", 0)
                speed = data.get("Sog", 0)
                
                is_target = False
                stype = "Unknown"
                name_upper = ship_name.upper()
                
                if any(x in name_upper for x in ["NAVY", "WARSHIP", "USS", "HMS", "CGC", "COAST GUARD", "MILITARY", "PATROL", "POLICE", "DEFENDER", "GUARD"]):
                    is_target = True
                    stype = "Military"
                elif any(x in name_upper for x in ["RESCUE", "SAR", "LIFEBOAT", "MEDEVAC", "AMBULANCE", "HOSPITAL"]):
                    is_target = True
                    stype = "Rescue"
                
                # For demonstration, if we found *none* naturally in the 20s, we will just include a random sample
                # to prove the code works.
                
                if is_target:
                    collected_ships[mmsi] = {
                        "mmsi": mmsi,
                        "name": ship_name,
                        "lat": lat,
                        "lng": lng,
                        "heading": heading,
                        "speed": speed,
                        "type": stype
                    }
                else:
                    # Keep a small random buffer just in case we hit 0 military ships in 20s
                    if len(collected_ships) < 50:
                        collected_ships[f"Random_{mmsi}"] = {
                            "mmsi": mmsi,
                            "name": ship_name,
                            "lat": lat,
                            "lng": lng,
                            "heading": heading,
                            "speed": speed,
                            "type": "Civilian/Other"
                        }
        except Exception as e:
            print(f"Error parse: {e}")

        # Check timeout
        if time.time() - start_time > duration:
            ws.close()

    def on_error(ws, error):
        print(f"Error: {error}")

    def on_close(ws, close_status_code, close_msg):
        print("Closed connection.")

    def on_open(ws):
        print("Connected! Listening for 120 seconds. This might take a moment to gather enough vessels...")
        ws.send(json.dumps(subscribe_message))

    ws = websocket.WebSocketApp("wss://stream.aisstream.io/v0/stream",
                              on_open=on_open,
                              on_message=on_message,
                              on_error=on_error,
                              on_close=on_close)

    ws.run_forever()
    
    # Filter final list to prioritize Military/Rescue, drop Civilian if we have enough Targets
    final_list = list(collected_ships.values())
    targets = [s for s in final_list if s["type"] in ["Military", "Rescue"]]
    
    if len(targets) > 0:
        return targets # Return only intended targets if found
    else:
        print("No Military/Rescue found in window. Returning a selection of other ships to populate map.")
        return final_list[:200]

def main():
    print("Fetching Ships data from aisstream...")
    ships = fetch_ais_data()
    print(f"Found {len(ships)} ships.")

    output_data = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "count": len(ships),
        "ships": ships
    }

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(output_data, f, indent=2)
    print(f"Saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
