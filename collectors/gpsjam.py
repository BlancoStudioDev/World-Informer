"""GPS interference estimate from ADS-B NIC degradation (adsb.lol + H3 hexes) -> data/data_gpsjam.json
(v1 schema: list of {id,severity,total_ac,bad_ac,bad_pct,polygon})."""
import time

import h3

from .common import atomic_write_json, cached_json, data_path, get_logger

log = get_logger("gpsjam")

BASE = "https://api.adsb.lol/v2"
# (lat, lon) centres, 250 nm radius each: conflict / jamming-prone regions plus busy corridors
POINTS = [
    (57, 21), (54, 20), (60, 28), (45, 34), (50, 30), (41, 45), (39, 35), (34, 35), (31, 35), (26, 52),
    (36, 44), (50, 10),
]
H3_RES = 4
OUT = "data_gpsjam.json"


def _fetch(path):
    d = cached_json(f"{BASE}/{path}", ttl=120, timeout=25, retries=2)
    return d.get("ac", []) if isinstance(d, dict) else []


def _fetch_all(paths):
    """Sequential with a small gap: adsb.lol answers 429 to bursts."""
    out, t0 = [], time.time()
    for p in paths:
        if time.time() - t0 > 60:  # overall budget so a throttled API cannot stall the cron job
            log.warning("gpsjam: time budget exhausted, using %d/%d queries", len(out), len(paths))
            break
        out.append(_fetch(p))
        time.sleep(0.8)
    return out


def collect():
    paths = ["mil", "ladd"] + [f"point/{la}/{lo}/250" for la, lo in POINTS]
    try:
        lists = _fetch_all(paths)
    except Exception as e:
        log.error("gpsjam failure: %s", e)
        return []
    seen, cells = set(), {}
    for ac_list in lists:
        for ac in ac_list:
            hx = ac.get("hex")
            if not hx or hx in seen:
                continue
            seen.add(hx)
            lat, lng, alt = ac.get("lat"), ac.get("lon"), ac.get("alt_baro")
            if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
                continue
            if alt == "ground" or (isinstance(alt, (int, float)) and alt < 1000):
                continue
            nic = ac.get("nic")
            bad = 1 if isinstance(nic, (int, float)) and nic < 6 else 0
            try:
                idx = h3.latlng_to_cell(lat, lng, H3_RES)
            except Exception:
                continue
            c = cells.setdefault(idx, [0, 0])
            c[0] += 1
            c[1] += bad
    if not cells:
        log.warning("gpsjam: no aircraft data; keeping previous file")
        return []
    hexes = []
    for idx, (total, bad) in cells.items():
        pct = bad / total * 100
        # a single degraded aircraft is not enough evidence for red
        sev = "red" if (pct > 10 and bad >= 2) else "yellow" if pct > 2 else "green"
        ring = [[round(lng, 4), round(lat, 4)] for lat, lng in h3.cell_to_boundary(idx)]
        if ring and ring[0] != ring[-1]:
            ring.append(ring[0])
        hexes.append({"id": idx, "severity": sev, "total_ac": total, "bad_ac": bad, "bad_pct": round(pct, 1), "polygon": ring})
    atomic_write_json(data_path(OUT), hexes)
    log.info("gpsjam: %d aircraft -> %d hexes (%d red, %d yellow)", len(seen), len(hexes),
             sum(h["severity"] == "red" for h in hexes), sum(h["severity"] == "yellow" for h in hexes))
    return hexes


if __name__ == "__main__":
    import logging

    logging.basicConfig(level=logging.INFO)
    print(len(collect()))
