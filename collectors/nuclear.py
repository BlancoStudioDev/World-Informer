"""Nuclear power plants from OpenStreetMap (Overpass) -> data/data_nuclear.json
(v1 schema: list of {name,lat,lng,output})."""
from .common import atomic_write_json, data_path, get_logger, http_get

log = get_logger("nuclear")

ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
QUERY = """[out:json][timeout:90];
(
  node["power"="plant"]["plant:source"="nuclear"];
  way["power"="plant"]["plant:source"="nuclear"];
  relation["power"="plant"]["plant:source"="nuclear"];
);
out center;"""
OUT = "data_nuclear.json"


def collect():
    data = None
    for ep in ENDPOINTS:
        # Overpass answers 406 to browser-like UAs; it wants an identifiable client
        r = http_get(ep, timeout=100, retries=2, data={"data": QUERY},
                     headers={"User-Agent": "WorldInformer/2.0 (OSINT globe)", "Accept": "application/json"})
        if r is not None:
            try:
                data = r.json()
                break
            except ValueError:
                continue
    if not data:
        log.warning("nuclear: Overpass unavailable; keeping previous file")
        return []
    plants = []
    for el in data.get("elements", []):
        tags = el.get("tags", {})
        name = tags.get("name") or tags.get("name:en") or "Unknown Nuclear Plant"
        if el.get("type") == "node":
            lat, lon = el.get("lat"), el.get("lon")
        else:
            c = el.get("center") or {}
            lat, lon = c.get("lat"), c.get("lon")
        if lat is None or lon is None:
            continue
        plants.append({"name": name, "lat": lat, "lng": lon, "output": tags.get("plant:output:electricity", "")})
    if plants:
        atomic_write_json(data_path(OUT), plants, indent=2)
    log.info("nuclear: %d facilities", len(plants))
    return plants


if __name__ == "__main__":
    import logging

    logging.basicConfig(level=logging.INFO)
    print(len(collect()))
