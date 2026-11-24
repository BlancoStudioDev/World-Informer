"""RSS news collector -> list[Article] (schema in docs/ARCHITECTURE.md).

Feeds verified live (see FEEDS). Dead/unavailable at verification time and therefore omitted:
CNN (rss.cnn.com frozen since 2023), Euronews (HTTP 406 to scripted clients), Reuters/AP official RSS (discontinued; replaced by Google
News site-restricted feeds), Yahoo Finance (404), La Stampa (DNS), Arab News / Al Arabiya (403).
"""
import calendar
import hashlib
import html
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import feedparser
from bs4 import BeautifulSoup

from .common import get_logger, http_get, iso, utcnow

log = get_logger("news_rss")

GN = "https://news.google.com/rss/search?q={q}+when:1d&hl=en-US&gl=US&ceid=US:en"
CURL_UA = {"User-Agent": "curl/8.4.0"}  # Guardian 403s browser UAs on its RSS endpoint

# (name, source, url, lang, geo_hint, extra headers, flags)
_F = []


def _f(source, url, lang="en", hint=None, headers=None, gnews=False):
    _F.append(dict(source=source, url=url, lang=lang, hint=hint, headers=headers, gnews=gnews))


# --- Global / English wires and broadcasters
_f("BBC", "https://feeds.bbci.co.uk/news/world/rss.xml")
_f("BBC", "https://feeds.bbci.co.uk/news/business/rss.xml")
_f("Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml")
_f("The Guardian", "https://www.theguardian.com/world/rss", headers=CURL_UA)
_f("The Guardian", "https://www.theguardian.com/business/rss", headers=CURL_UA)
_f("NYT", "https://rss.nytimes.com/services/xml/rss/nyt/World.xml")
_f("NYT", "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml")
_f("DW", "https://rss.dw.com/rdf/rss-en-all")
_f("France24", "https://www.france24.com/en/rss")
_f("NPR", "https://feeds.npr.org/1004/rss.xml")
_f("Sky News", "https://feeds.skynews.com/feeds/rss/world.xml")
_f("CBC", "https://www.cbc.ca/webfeed/rss/rss-world")
_f("ABC Australia", "https://www.abc.net.au/news/feed/2942460/rss.xml", hint="Australia")
_f("Reuters", GN.format(q="site:reuters.com"), gnews=True)
_f("Reuters", GN.format(q="site:reuters.com+business"), gnews=True)
_f("AP", GN.format(q="site:apnews.com"), gnews=True)
# --- Markets / business
_f("CNBC", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100727362")
_f("CNBC", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258")
_f("MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_topstories")
_f("WSJ", "https://feeds.content.dowjones.io/public/rss/RSSWorldNews")
_f("WSJ", "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain")
_f("Bloomberg", "https://feeds.bloomberg.com/markets/news.rss")
_f("Bloomberg", "https://feeds.bloomberg.com/politics/news.rss")
_f("Financial Times", "https://www.ft.com/world?format=rss")
_f("Oilprice", "https://oilprice.com/rss/main")
_f("The Economist", "https://www.economist.com/international/rss.xml")
_f("Federal Reserve", "https://www.federalreserve.gov/feeds/press_all.xml", hint="United States")
_f("ECB", "https://www.ecb.europa.eu/rss/press.html", hint="Europe")
# --- Italian
_f("ANSA", "https://www.ansa.it/sito/notizie/mondo/mondo_rss.xml", "it", "Mondo")
_f("ANSA", "https://www.ansa.it/sito/notizie/economia/economia_rss.xml", "it", "Economia")
_f("ANSA", "https://www.ansa.it/sito/notizie/topnews/topnews_rss.xml", "it")
_f("ANSA", "https://www.ansa.it/sito/notizie/politica/politica_rss.xml", "it", "Politica")
_f("ANSA English", "https://www.ansa.it/english/news/english_nr_rss.xml", "en")
_f("Corriere della Sera", "https://www.corriere.it/rss/homepage.xml", "it")
_f("Corriere della Sera", "https://www.corriere.it/rss/esteri.xml", "it", "Esteri")
_f("Corriere della Sera", "https://www.corriere.it/rss/economia.xml", "it", "Economia")
_f("Il Sole 24 Ore", "https://www.ilsole24ore.com/rss/mondo.xml", "it", "Mondo")
_f("Il Sole 24 Ore", "https://www.ilsole24ore.com/rss/economia.xml", "it", "Economia")
_f("Il Sole 24 Ore", "https://www.ilsole24ore.com/rss/finanza.xml", "it", "Finanza")
_f("la Repubblica", "https://www.repubblica.it/rss/esteri/rss2.0.xml", "it", "Esteri")
_f("la Repubblica", "https://www.repubblica.it/rss/economia/rss2.0.xml", "it", "Economia")
_f("Il Post", "https://www.ilpost.it/mondo/feed/", "it", "Mondo")
# --- Regional
_f("The Times of Israel", "https://www.timesofisrael.com/feed/", hint="Israel")
_f("Kyiv Independent", "https://kyivindependent.com/news-archive/rss/", hint="Ukraine")
_f("SCMP", "https://www.scmp.com/rss/91/feed", hint="China")
_f("SCMP", "https://www.scmp.com/rss/5/feed", hint="China")
_f("Japan Times", "https://www.japantimes.co.jp/feed/", hint="Japan")
_f("Straits Times", "https://www.straitstimes.com/news/world/rss.xml", hint="Asia")
_f("The Hindu", "https://www.thehindu.com/news/international/feeder/default.rss", hint="India")
_f("Africanews", "https://www.africanews.com/feed/rss", hint="Africa")
_f("MercoPress", "https://en.mercopress.com/rss/latin-america", hint="Latin America")
_f("Buenos Aires Times", "https://www.batimes.com.ar/feed", hint="Argentina")
_f("Middle East Eye", "https://www.middleeasteye.net/rss", hint="Middle East")
_f("Al-Monitor", "https://www.al-monitor.com/rss", hint="Middle East")
_f("Politico Europe", "https://www.politico.eu/feed/", hint="Europe")

FEEDS = _F

MAX_AGE_ITEMS_PER_FEED = 60
_TRACKING = {"utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "at_medium",
             "at_campaign", "ref", "ocid", "cmpid", "taid", "xtor", "ns_mchannel", "ns_source", "ns_campaign"}

LAST_STATS = {}  # "source|url" -> count (last collect() run), for run.py logging


def _clean_text(raw, limit=600):
    if not raw:
        return ""
    txt = BeautifulSoup(str(raw), "html.parser").get_text(" ")
    txt = html.unescape(txt)
    txt = re.sub(r"\s+", " ", txt).strip()
    if len(txt) > limit:
        txt = txt[: limit - 1].rsplit(" ", 1)[0] + "…"
    return txt


def _norm_url(u):
    try:
        p = urlsplit(u.strip())
        q = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True) if k.lower() not in _TRACKING]
        return urlunsplit((p.scheme, p.netloc, p.path, urlencode(q), ""))
    except Exception:
        return u.strip()


def _entry_dt(e, now):
    for k in ("published_parsed", "updated_parsed"):
        t = e.get(k)
        if t:
            try:
                dt = datetime.fromtimestamp(calendar.timegm(t), tz=timezone.utc)
                return min(dt, now)  # clamp future dates
            except (ValueError, OverflowError, OSError):
                continue
    return now


def _fetch(feed):
    hdr = {"Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8"}
    hdr.update(feed["headers"] or {})
    r = http_get(feed["url"], headers=hdr, timeout=15, retries=1)
    if r is None:
        return feed, []
    try:
        parsed = feedparser.parse(r.content)
        return feed, parsed.entries[:MAX_AGE_ITEMS_PER_FEED]
    except Exception as e:  # malformed feed
        log.warning("parse error %s: %s", feed["url"], e)
        return feed, []


def _to_article(feed, e, now):
    title = _clean_text(e.get("title"), 300)
    url = (e.get("link") or "").strip()
    if not title or not url:
        return None
    source = feed["source"]
    summary = ""
    if feed["gnews"]:
        src = (e.get("source") or {}).get("title") if isinstance(e.get("source"), dict) else None
        if src and src.lower() not in ("reuters", "associated press", "ap news", "ap"):
            return None  # site: search leaked another publisher
        title = re.sub(r"\s+-\s+(Reuters|AP News|The Associated Press|Associated Press)$", "", title).strip()
    else:
        content = e.get("summary") or e.get("description") or ""
        if not content and e.get("content"):
            content = e["content"][0].get("value", "")
        summary = _clean_text(content)
        if summary == title:
            summary = ""
    url = _norm_url(url)
    art = {
        "id": hashlib.sha1(url.encode("utf-8")).hexdigest()[:16],
        "title": title,
        "summary": summary,
        "url": url,
        "source": source,
        "lang": feed["lang"],
        "published_at": iso(_entry_dt(e, now)),
    }
    if feed["hint"]:
        art["geo_hint"] = feed["hint"]
    return art


def collect():
    """Fetch all feeds in parallel; return deduplicated list[Article] (newest first). Never raises."""
    now = utcnow()
    out, seen = [], set()
    LAST_STATS.clear()
    try:
        with ThreadPoolExecutor(max_workers=10) as ex:
            results = list(ex.map(_fetch, FEEDS))
    except Exception as e:
        log.error("news_rss pool failure: %s", e)
        return []
    for feed, entries in results:
        n = 0
        for e in entries:
            try:
                a = _to_article(feed, e, now)
            except Exception as ex_:
                log.debug("entry error: %s", ex_)
                continue
            if a and a["id"] not in seen:
                seen.add(a["id"])
                out.append(a)
                n += 1
        LAST_STATS[feed["source"] + "|" + feed["url"]] = n
        if not entries:
            log.warning("feed returned nothing: %s", feed["url"])
    out.sort(key=lambda a: a["published_at"], reverse=True)
    log.info("news_rss: %d articles from %d/%d feeds", len(out), sum(1 for v in LAST_STATS.values() if v), len(FEEDS))
    return out


if __name__ == "__main__":
    import logging

    logging.basicConfig(level=logging.INFO)
    arts = collect()
    print(len(arts), "articles")
    for k, v in sorted(LAST_STATS.items()):
        print(f"{v:4d}  {k}")
