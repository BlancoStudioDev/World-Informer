"""Radiation readings from Safecast, fetched server-side (the API's CORS headers
break browser fetches) -> data/data_radiation.json
Schema: {"timestamp", "points": [{lat,lng,value,unit,captured,site}]}.
Safecast is volunteer data and many areas have no recent readings: only readings
from the last MAX_AGE_DAYS are kept, so the layer never shows stale data as live."""
from datetime import datetime, timedelta, timezone

from .common import atomic_write_json, data_path, get_logger, http_get, iso, utcnow

log = get_logger("radiation")

OUT = "data_radiation.json"
API = "https://api.safecast.org/en-US/measurements.json"
MAX_AGE_DAYS = 365
# (label, lat, lng): nuclear sites and areas where Safecast has active sensors
SITES = [
    ("Fukushima", 37.42, 141.03), ("Tokyo", 35.68, 139.69), ("Chernobyl", 51.39, 30.10),
    ("Zaporizhzhia", 47.51, 34.58), ("Kyiv", 50.45, 30.52), ("Berlin", 52.52, 13.40),
    ("Paris", 48.86, 2.35), ("London", 51.51, -0.13), ("Barcelona", 41.39, 2.17),
    ("Boston", 42.36, -71.06), ("Los Angeles", 34.05, -118.24), ("Seoul", 37.57, 126.98),
    ("Taipei", 25.03, 121.57), ("Bushehr", 28.83, 50.89), ("Dimona", 31.00, 35.14),
]


def _parse_dt(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except ValueError:
        return None


def collect():
    cutoff = utcnow() - timedelta(days=MAX_AGE_DAYS)
    since = cutoff.strftime("%Y-%m-%d")
    points, seen = [], set()
    for site, lat, lng in SITES:
        r = http_get(API, timeout=20, params={
            "distance": 50000, "latitude": lat, "longitude": lng,
            "captured_after": since, "order": "captured_at desc",
        })
        if r is None:
            continue
        try:
            rows = r.json()
        except ValueError:
            continue
        for d in rows if isinstance(rows, list) else []:
            dt = _parse_dt(d.get("captured_at"))
            if d.get("latitude") is None or d.get("longitude") is None or dt is None:
                continue
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if dt < cutoff or d.get("id") in seen:
                continue
            seen.add(d.get("id"))
            points.append({"lat": d["latitude"], "lng": d["longitude"], "value": d.get("value"),
                           "unit": d.get("unit") or "cpm", "captured": iso(dt), "site": site})
    atomic_write_json(data_path(OUT), {"timestamp": iso(utcnow()), "points": points})
    log.info("radiation: %d recent readings", len(points))
    return points


if __name__ == "__main__":
    import logging

    logging.basicConfig(level=logging.INFO)
    print(len(collect()))
