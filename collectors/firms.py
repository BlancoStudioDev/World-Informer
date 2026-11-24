"""NASA FIRMS active-fire hotspots -> data/data_firms.json (v1 schema: list of
{lat,lng,frp,brightness,confidence,date,time,daynight,sensor}). Needs NASA_FIRMS_API_KEY in .env."""
import csv
import os
from concurrent.futures import ThreadPoolExecutor
from io import StringIO

from .common import atomic_write_json, data_path, get_logger, http_get

log = get_logger("firms")

AREAS = [
    ("Europe & N.Africa", "-15,25,45,72"), ("Middle East", "25,10,65,55"), ("East Asia", "65,10,150,55"),
    ("SE Asia & Oceania", "90,-50,180,10"), ("Sub-Sahara Africa", "-20,-40,55,25"),
    ("North America", "-170,10,-50,72"), ("Central America", "-120,-5,-60,30"),
    ("South America", "-85,-60,-30,15"), ("Russia & N.Asia", "45,50,180,80"),
]
SENSORS = ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "MODIS_NRT"]
DAYS = 2
MAX_POINTS = 40000  # keep the browser payload sane: strongest hotspots win
OUT = "data_firms.json"


def _confidence(raw):
    raw = (raw or "").strip().lower()
    if raw in ("h", "high"):
        return "high"
    if raw in ("n", "nominal"):
        return "nominal"
    if raw in ("l", "low"):
        return "low"
    try:  # MODIS: numeric 0-100
        v = float(raw)
        return "high" if v >= 80 else "nominal" if v >= 30 else "low"
    except ValueError:
        return "low"


def _fetch(args):
    key, (area_name, bbox), sensor = args
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{sensor}/{bbox}/{DAYS}"
    r = http_get(url, timeout=45, retries=1, label=f"FIRMS {sensor} {area_name}")
    if r is None or "Invalid" in r.text[:60] or "Error" in r.text[:60]:
        return []
    rows = []
    for row in csv.DictReader(StringIO(r.text)):
        try:
            lat, lng = float(row["latitude"]), float(row["longitude"])
            frp = float(row.get("frp") or 0)
            bright = float(row.get("bright_ti4") or row.get("brightness") or 0)
        except (ValueError, KeyError, TypeError):
            continue
        rows.append({
            "lat": round(lat, 4), "lng": round(lng, 4), "frp": round(frp, 1), "brightness": round(bright, 1),
            "confidence": _confidence(row.get("confidence")), "date": row.get("acq_date", ""),
            "time": str(row.get("acq_time", "")).zfill(4), "daynight": row.get("daynight", ""),
            "sensor": sensor.split("_")[0],
        })
    return rows


def collect():
    key = os.getenv("NASA_FIRMS_API_KEY", "").strip()
    if not key:
        log.error("NASA_FIRMS_API_KEY missing in .env; skipping FIRMS")
        return []
    jobs = [(key, a, s) for a in AREAS for s in SENSORS]
    seen, spots = set(), []
    try:
        with ThreadPoolExecutor(max_workers=4) as ex:
            for rows in ex.map(_fetch, jobs):
                for h in rows:
                    k = (round(h["lat"], 3), round(h["lng"], 3), h["date"], h["time"])
                    if k not in seen:
                        seen.add(k)
                        spots.append(h)
    except Exception as e:
        log.error("firms pool failure: %s", e)
    if not spots:
        log.warning("firms: no data fetched; keeping previous file")
        return []
    total = len(spots)
    spots = [h for h in spots if h["confidence"] != "low"] or spots
    spots.sort(key=lambda h: h["frp"], reverse=True)
    spots = spots[:MAX_POINTS]
    atomic_write_json(data_path(OUT), spots)
    log.info("firms: %d hotspots fetched, %d written", total, len(spots))
    return spots


if __name__ == "__main__":
    import logging

    logging.basicConfig(level=logging.INFO)
    print(len(collect()))
