"""politeness.py — robots.txt compliance + per-host rate limiting.

The sweep must be a good citizen: identify itself with a descriptive UA, honour robots.txt
``Disallow``/``Crawl-delay`` for our agent, and never hammer a host. Store-API hosts get a
conservative delay; the Shopify image CDN (built for load) gets a lighter one.
"""

from __future__ import annotations

import time
import urllib.robotparser
from urllib.parse import urlparse

import httpx

from .config import USER_AGENT

# Hosts that are CDNs built to serve images at scale — politeness can be lighter.
_CDN_HOSTS = ("cdn.shopify.com",)
_CDN_DELAY_S = 0.25
_DEFAULT_DELAY_S = 3.0


class Politeness:
    def __init__(self, default_delay_s: float = _DEFAULT_DELAY_S):
        self.default_delay_s = default_delay_s
        self._last_hit: dict[str, float] = {}
        self._robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}

    # --- robots.txt ---
    def _robots_for(self, url: str) -> urllib.robotparser.RobotFileParser | None:
        host = urlparse(url).netloc
        if host not in self._robots:
            rp = urllib.robotparser.RobotFileParser()
            robots_url = f"{urlparse(url).scheme}://{host}/robots.txt"
            try:
                resp = httpx.get(robots_url, headers={"User-Agent": USER_AGENT}, timeout=15.0)
                if resp.status_code == 200:
                    rp.parse(resp.text.splitlines())
                else:
                    rp = None  # no robots -> allowed
            except Exception:
                rp = None
            self._robots[host] = rp
        return self._robots[host]

    def allowed(self, url: str) -> bool:
        rp = self._robots_for(url)
        return True if rp is None else rp.can_fetch(USER_AGENT, url)

    def crawl_delay(self, url: str) -> float:
        host = urlparse(url).netloc
        if any(host.endswith(h) for h in _CDN_HOSTS):
            return _CDN_DELAY_S
        rp = self._robots_for(url)
        if rp is not None:
            try:
                d = rp.crawl_delay(USER_AGENT)
                if d:
                    return max(float(d), self.default_delay_s)
            except Exception:
                pass
        return self.default_delay_s

    # --- rate limiting (per host, deterministic; no Math.random equivalent needed) ---
    def wait(self, url: str) -> None:
        host = urlparse(url).netloc
        delay = self.crawl_delay(url)
        last = self._last_hit.get(host)
        if last is not None:
            elapsed = time.monotonic() - last
            if elapsed < delay:
                time.sleep(delay - elapsed)
        self._last_hit[host] = time.monotonic()
