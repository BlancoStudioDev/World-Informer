"""Public Telegram OSINT channels via t.me/s/<handle> web preview -> data/data_telegram.json
(v1 schema: list of {channel,text,date,url,images,forwarded_from,scraped_at}, newest first).

Handles verified live on 2026-11 (each returns posts at t.me/s/<handle>). Dropped from v1 because
t.me/s redirects (no public preview): intel_slava, TheIntelCrab, nexaborona, ryaborona, militaryoperations.
"""
import re
import time
from concurrent.futures import ThreadPoolExecutor

from bs4 import BeautifulSoup

from .common import atomic_write_json, data_path, get_logger, http_get

log = get_logger("telegram")

CHANNELS = [
    "liveuamap", "clashreport", "osinttechnical", "DDGeopolitics", "UAWeapons", "SouthFrontEng",
    "warmonitors", "intelslava", "nexta_tv", "Middle_East_Spectator", "OSINTdefender", "spectatorindex",
    "IsraelWarRoom", "DeepStateEN", "BellumActaNews", "wartranslated", "AMK_Mapping", "osint613",
]
PER_CHANNEL = 20
OUT = "data_telegram.json"
_BG = re.compile(r"background-image:\s*url\(['\"]?([^'\")]+)")


def _scrape_channel(handle):
    # allow_redirects is on by default in requests; a redirect away from /s/ means no preview
    r = http_get(f"https://t.me/s/{handle}", timeout=15, retries=1)
    if r is None:
        return handle, []
    if "/s/" not in r.url:
        log.warning("@%s has no public preview (redirected)", handle)
        return handle, []
    soup = BeautifulSoup(r.text, "html.parser")
    now = int(time.time())
    msgs = []
    for wrap in soup.find_all("div", class_="tgme_widget_message_wrap")[-PER_CHANNEL:]:
        try:
            m = wrap.find("div", class_="tgme_widget_message")
            if not m:
                continue
            td = m.find("div", class_="tgme_widget_message_text")
            text = re.sub(r"\s+", " ", td.get_text(" ", strip=True)).strip() if td else ""
            if not text:
                continue
            post = m.get("data-post", "")
            tt = m.find("time")
            images = []
            for pw in m.find_all("a", class_="tgme_widget_message_photo_wrap"):
                mo = _BG.search(pw.get("style", ""))
                if mo:
                    images.append(mo.group(1))
            fwd = m.find("a", class_="tgme_widget_message_forwarded_from_name")
            msgs.append({
                "channel": handle,
                "text": text[:500],
                "date": tt.get("datetime", "") if tt else "",
                "url": f"https://t.me/{post}" if post else "",
                "images": images[:3],
                "forwarded_from": fwd.get_text(strip=True) if fwd else "",
                "scraped_at": now,
            })
        except Exception:
            continue
    return handle, msgs


def collect():
    """Scrape all channels in parallel, write layer file, return list of messages."""
    allm, stats = [], {}
    try:
        with ThreadPoolExecutor(max_workers=6) as ex:
            for handle, msgs in ex.map(_scrape_channel, CHANNELS):
                stats[handle] = len(msgs)
                allm.extend(msgs)
    except Exception as e:
        log.error("telegram pool failure: %s", e)
    allm.sort(key=lambda m: m.get("date", ""), reverse=True)
    dead = [h for h, n in stats.items() if n == 0]
    log.info("telegram: %d messages from %d/%d channels%s", len(allm), len(stats) - len(dead), len(stats),
             f" (empty: {', '.join(dead)})" if dead else "")
    if allm:
        atomic_write_json(data_path(OUT), allm, indent=2)
    return allm


if __name__ == "__main__":
    import logging

    logging.basicConfig(level=logging.INFO)
    msgs = collect()
    from collections import Counter

    print(len(msgs), dict(Counter(m["channel"] for m in msgs)))
    print(msgs[0] if msgs else None)
