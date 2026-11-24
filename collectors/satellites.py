"""CelesTrak TLEs of active LEO satellites -> data/data_satellites.json
(v1 schema: list of {name,line1,line2,category})."""
from .common import atomic_write_json, data_path, get_logger, http_get

log = get_logger("satellites")

URLS = {"active": "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle"}
MAX_STARLINK = 1000
OUT = "data_satellites.json"


def _parse(text):
    lines = [l.rstrip() for l in text.strip().splitlines() if l.strip()]
    sats = []
    for i in range(0, len(lines) - 2, 3):
        name, l1, l2 = lines[i].strip(), lines[i + 1].strip(), lines[i + 2].strip()
        if l1.startswith("1 ") and l2.startswith("2 "):
            sats.append({"name": name, "line1": l1, "line2": l2})
    return sats


def collect():
    out, seen = [], set()
    for category, url in URLS.items():
        r = http_get(url, timeout=30, retries=1)
        if r is None:
            continue
        starlink = 0
        for sat in _parse(r.text):
            try:
                if float(sat["line2"][52:63]) <= 11.25:  # keep LEO (> 11.25 rev/day)
                    continue
            except ValueError:
                continue
            if "STARLINK" in sat["name"].upper():
                starlink += 1
                if starlink > MAX_STARLINK:
                    continue
            if sat["name"] in seen:
                continue
            seen.add(sat["name"])
            sat["category"] = category
            out.append(sat)
    if out:
        atomic_write_json(data_path(OUT), out)
    else:
        log.warning("satellites: no data; keeping previous file")
    log.info("satellites: %d LEO", len(out))
    return out


if __name__ == "__main__":
    import logging

    logging.basicConfig(level=logging.INFO)
    print(len(collect()))
