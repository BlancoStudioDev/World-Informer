"""ANSA 'Ultima ora' sidebar (Mondo/Economia) -> data/data_ansa_ultima_ora.json (v1 schema:
{"Mondo": [{"time","title","link","scraped_at"}], "Economia": [...]})."""
import hashlib
import re
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

from .common import atomic_write_json, data_path, get_logger, http_get

log = get_logger("ansa_ultima_ora")

PAGES = {
    "Mondo": "https://www.ansa.it/sito/notizie/mondo/index.shtml",
    "Economia": "https://www.ansa.it/sito/notizie/economia/index.shtml",
}
OUT = "data_ansa_ultima_ora.json"


def collect():
    """Return the {category: [items]} dict and write the layer file (only if something was scraped)."""
    results = {}
    for category, url in PAGES.items():
        try:
            r = http_get(url, timeout=15, retries=1)
            if r is None:
                continue
            soup = BeautifulSoup(r.text, "html.parser")
            box = soup.find("section", class_="side-latest-news")
            if not box:
                log.warning("side-latest-news not found on %s", url)
                continue
            items = []
            for teaser in box.find_all("div", class_="article-teaser"):
                t = teaser.find("p", class_="kicker")
                h = teaser.find("h3", class_="title")
                a = h.find("a") if h else None
                if not (t and a and a.get("href")):
                    continue
                href = a["href"]
                items.append({
                    "time": t.get_text(strip=True),
                    "title": a.get_text(strip=True),
                    "link": "https://www.ansa.it" + href if href.startswith("/") else href,
                    "scraped_at": int(time.time()),
                })
            results[category] = items
            log.info("ansa ultima ora %s: %d", category, len(items))
        except Exception as e:
            log.warning("ansa ultima ora %s failed: %s", category, e)
    if any(results.values()):
        atomic_write_json(data_path(OUT), results, indent=2)
    return results


def to_articles(results, now=None):
    """Convert the ultima-ora dict to engine Articles (HH:MM is Europe/Rome local time, today)."""
    now = now or datetime.now(timezone.utc)
    rome = ZoneInfo("Europe/Rome")
    local_now = now.astimezone(rome)
    out = []
    for category, items in (results or {}).items():
        for it in items:
            m = re.match(r"^(\d{1,2}):(\d{2})$", it.get("time", ""))
            pub = now
            if m:
                cand = local_now.replace(hour=int(m.group(1)), minute=int(m.group(2)), second=0, microsecond=0)
                if cand > local_now:  # belongs to yesterday
                    cand -= timedelta(days=1)
                pub = cand.astimezone(timezone.utc)
            url = it["link"]
            out.append({
                "id": hashlib.sha1(url.encode("utf-8")).hexdigest()[:16],
                "title": it["title"], "summary": "", "url": url, "source": "ANSA", "lang": "it",
                "published_at": pub.strftime("%Y-%m-%dT%H:%M:%SZ"), "geo_hint": category,
            })
    return out


if __name__ == "__main__":
    import logging

    logging.basicConfig(level=logging.INFO)
    print({k: len(v) for k, v in collect().items()})
