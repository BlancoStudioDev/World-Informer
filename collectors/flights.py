"""Military + emergency-squawk aircraft from adsb.lol (server side, no CORS proxy)
-> data/data_flights.json  {"timestamp", "aircraft": [{hex,flight,lat,lng,alt,gs,track,type,squawk,category}]}
category is "mil" or "emergency" (squawk 7500/7600/7700)."""
from concurrent.futures import ThreadPoolExecutor

from .common import atomic_write_json, cached_json, data_path, get_logger, iso, utcnow

log = get_logger("flights")

BASE = "https://api.adsb.lol/v2"
EMERGENCY_SQUAWKS = ("7700", "7600", "7500")
OUT = "data_flights.json"


def _num(v):
    return v if isinstance(v, (int, float)) else None


def _norm(ac, category):
    lat, lng = _num(ac.get("lat")), _num(ac.get("lon"))
    if lat is None or lng is None:
        return None
    alt = ac.get("alt_baro")
    alt = 0 if alt == "ground" else _num(alt)
    return {
        "hex": ac.get("hex", ""),
        "flight": (ac.get("flight") or ac.get("r") or "").strip(),
        "lat": round(lat, 4), "lng": round(lng, 4),
        "alt": alt, "gs": _num(ac.get("gs")),
        "track": _num(ac.get("track")) if ac.get("track") is not None else _num(ac.get("true_heading")),
        "type": ac.get("t") or "",
        "squawk": ac.get("squawk") or "",
        "category": category,
    }


def _fetch(path):
    d = cached_json(f"{BASE}/{path}", ttl=120, timeout=20, retries=1)
    return (d or {}).get("ac", []) if isinstance(d, dict) else []


def collect():
    paths = ["mil"] + [f"sqk/{s}" for s in EMERGENCY_SQUAWKS]
    try:
        with ThreadPoolExecutor(max_workers=4) as ex:
            results = list(ex.map(_fetch, paths))
    except Exception as e:
        log.error("flights failure: %s", e)
        return []
    by_hex = {}
    for ac in results[0]:
        n = _norm(ac, "mil")
        if n:
            by_hex[n["hex"]] = n
    for lst in results[1:]:
        for ac in lst:
            n = _norm(ac, "emergency")
            if n:
                by_hex[n["hex"]] = n  # emergency overrides mil
    aircraft = list(by_hex.values())
    if not any(results):
        log.warning("flights: adsb.lol returned nothing; keeping previous file")
        return []
    atomic_write_json(data_path(OUT), {"timestamp": iso(utcnow()), "aircraft": aircraft})
    log.info("flights: %d aircraft (%d emergency)", len(aircraft), sum(a["category"] == "emergency" for a in aircraft))
    return aircraft


if __name__ == "__main__":
    import logging

    logging.basicConfig(level=logging.INFO)
    print(len(collect()))
