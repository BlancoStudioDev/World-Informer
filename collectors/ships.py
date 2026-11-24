"""Military / SAR / law-enforcement vessels from aisstream.io -> data/data_ships.json
(v1 schema: {"timestamp","count","ships":[{mmsi,name,lat,lng,heading,speed,type}]}).

Needs AISSTREAM_API_KEY in .env. Listens LISTEN_SECONDS on the global stream. A vessel qualifies by
AIS ShipType (ShipStaticData.Type): 35 military, 51 SAR, 55 law enforcement, or by name patterns.
Targets seen in the last RETAIN_HOURS are kept between runs (static data only arrives every ~6 min).
"""
import json
import os
import re
import threading
import time
from datetime import datetime, timedelta, timezone

from .common import atomic_write_json, data_path, get_logger, iso, read_json, utcnow

log = get_logger("ships")

LISTEN_SECONDS = 45
RETAIN_HOURS = 6
URL = "wss://stream.aisstream.io/v0/stream"
OUT = "data_ships.json"

TYPE_LABEL = {35: "Military", 51: "Rescue", 55: "Military/Law Enforcement"}
MIL_NAME = re.compile(r"\b(NAVY|NAVAL|WARSHIP|USS|USNS|HMS|HMAS|HMCS|HNLMS|FGS|ITS|CGC|COAST ?GUARD|MILITARY|"
                      r"POLICE|POLIZIA|GUARDIA|GENDARMERIE|BORDER|PATROL|ARMADA|MARINA MILITARE)\b")
SAR_NAME = re.compile(r"\b(RESCUE|SAR|LIFEBOAT|MEDEVAC|SEENOT|SAUVETAGE|SALVAMENTO|KNRM|AMBULANCE|HOSPITAL)\b")


def _classify(name, ship_type):
    if ship_type in TYPE_LABEL:
        return TYPE_LABEL[ship_type]
    n = (name or "").upper()
    if SAR_NAME.search(n):
        return "Rescue"
    if MIL_NAME.search(n):
        return "Military"
    return None


def _listen(key):
    """Return (positions{mmsi:dict}, static{mmsi:(type,name)}, connected_ok)."""
    import websocket

    positions, static = {}, {}
    state = {"ok": False, "msgs": 0}

    def on_open(ws):
        state["ok"] = True
        ws.send(json.dumps({
            "APIKey": key,
            "BoundingBoxes": [[[-90.0, -180.0], [90.0, 180.0]]],
            "FilterMessageTypes": ["PositionReport", "ShipStaticData"],
        }))
        t = threading.Timer(LISTEN_SECONDS, lambda: ws.close())
        t.daemon = True
        t.start()

    def on_message(ws, message):
        try:
            msg = json.loads(message)
            mtype, meta = msg.get("MessageType"), msg.get("MetaData", {})
            mmsi = meta.get("MMSI")
            if mmsi is None:
                return
            state["msgs"] += 1
            if mtype == "ShipStaticData":
                sd = msg["Message"]["ShipStaticData"]
                static[mmsi] = (sd.get("Type"), (sd.get("Name") or meta.get("ShipName") or "").strip())
            elif mtype == "PositionReport":
                pr = msg["Message"]["PositionReport"]
                hd = pr.get("TrueHeading")
                if hd is None or hd >= 360:
                    hd = pr.get("Cog", 0)
                    hd = 0 if hd is None or hd >= 360 else hd
                positions[mmsi] = {
                    "name": (meta.get("ShipName") or "").strip(), "lat": meta.get("latitude"),
                    "lng": meta.get("longitude"), "heading": round(hd), "speed": pr.get("Sog", 0),
                }
        except Exception:
            pass

    def on_error(ws, error):
        log.warning("ais websocket error: %s", type(error).__name__)

    app = websocket.WebSocketApp(URL, on_open=on_open, on_message=on_message, on_error=on_error)
    # watchdog: connect handshake can be slow, never let the whole thing exceed listen window + 25s
    wd = threading.Timer(LISTEN_SECONDS + 25, lambda: app.close())
    wd.daemon = True
    wd.start()
    try:
        app.run_forever(ping_interval=20, ping_timeout=10)
    finally:
        wd.cancel()
    log.info("ais: %d messages, %d positions, %d static", state["msgs"], len(positions), len(static))
    return positions, static, state["ok"] and state["msgs"] > 0


def collect():
    key = os.getenv("AISSTREAM_API_KEY", "").strip()
    if not key or key == "your_api_key_here":
        log.error("AISSTREAM_API_KEY missing in .env; skipping ships")
        return []
    try:
        positions, static, ok = _listen(key)
    except Exception as e:
        log.error("ships websocket failure: %s", type(e).__name__)
        return []
    if not ok:
        log.warning("ships: no AIS data received; keeping previous file")
        return []
    now = utcnow()
    fresh = {}
    for mmsi, p in positions.items():
        if p["lat"] is None or p["lng"] is None:
            continue
        stype, sname = static.get(mmsi, (None, ""))
        name = p["name"] or sname or str(mmsi)
        label = _classify(name, stype)
        if label:
            fresh[mmsi] = {"mmsi": mmsi, "name": name, "lat": round(p["lat"], 5), "lng": round(p["lng"], 5),
                           "heading": p["heading"], "speed": p["speed"], "type": label, "last_seen": iso(now)}
    # merge with previous targets still within the retention window
    prev = (read_json(data_path(OUT), {}) or {}).get("ships", [])
    cutoff = now - timedelta(hours=RETAIN_HOURS)
    for s in prev:
        try:
            seen = datetime.strptime(s.get("last_seen", ""), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if seen >= cutoff and s.get("mmsi") not in fresh:
            fresh[s["mmsi"]] = s
    ships = sorted(fresh.values(), key=lambda s: s["mmsi"])
    atomic_write_json(data_path(OUT), {"timestamp": iso(now), "count": len(ships), "ships": ships}, indent=2)
    log.info("ships: %d targets (%d new this window)", len(ships), sum(1 for s in ships if s["last_seen"] == iso(now)))
    return ships


if __name__ == "__main__":
    import logging

    logging.basicConfig(level=logging.INFO)
    print(len(collect()))
