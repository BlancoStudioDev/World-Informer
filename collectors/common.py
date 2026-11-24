"""Shared helpers: paths, HTTP with timeout/retry, atomic JSON writes, logging."""
import json
import logging
import os
import tempfile
import time
from datetime import datetime, timezone

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
LOG_DIR = os.path.join(ROOT, "logs")

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
DEFAULT_TIMEOUT = 15

try:  # keys come from <root>/.env (never printed)
    from dotenv import load_dotenv

    load_dotenv(os.path.join(ROOT, ".env"))
except Exception:  # python-dotenv missing: fall back to real environment
    pass


def get_logger(name):
    return logging.getLogger("wi." + name)


def utcnow():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def data_path(filename):
    return os.path.join(DATA_DIR, filename)


def http_get(url, *, headers=None, timeout=DEFAULT_TIMEOUT, retries=1, params=None, session=None,
             label=None, data=None):
    """GET (POST when `data` is given) with browser-like UA and `retries` extra attempts.

    Returns Response or None. `label` is what appears in logs instead of the URL (use it when the
    URL embeds an API key). Never raises.
    """
    h = {"User-Agent": USER_AGENT, "Accept-Language": "en,it;q=0.8"}
    if headers:
        h.update(headers)
    log = get_logger("http")
    shown = label or url.split("?")[0]
    sess = session or requests
    backoff = 1.5
    for attempt in range(retries + 1):
        try:
            if data is not None:
                r = sess.post(url, headers=h, timeout=timeout, params=params, data=data)
            else:
                r = sess.get(url, headers=h, timeout=timeout, params=params)
            if r.status_code == 200:
                return r
            log.warning("HTTP %s for %s", r.status_code, shown)
            if r.status_code in (400, 401, 403, 404, 406, 410):
                return None
            if r.status_code in (429, 502, 503, 504):
                backoff = 4.0 * (attempt + 1)
        except requests.RequestException as e:
            log.warning("request error for %s: %s", shown, type(e).__name__)
        if attempt < retries:
            time.sleep(backoff)
            backoff = 1.5
    return None


_CACHE = {}


def cached_json(url, ttl=120, **kw):
    """GET JSON with an in-process TTL cache (lets flights + gpsjam share adsb.lol calls in one run)."""
    now = time.time()
    hit = _CACHE.get(url)
    if hit and now - hit[0] < ttl:
        return hit[1]
    r = http_get(url, **kw)
    data = None
    if r is not None:
        try:
            data = r.json()
        except ValueError:
            data = None
    if data is not None:
        _CACHE[url] = (now, data)
    return data


def atomic_write_json(path, obj, indent=None):
    """Write JSON to tmp file in the same dir, then os.replace (readers never see partial files)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".tmp_", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=indent, separators=(",", ":") if indent is None else None)
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def read_json(path, default=None):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default
