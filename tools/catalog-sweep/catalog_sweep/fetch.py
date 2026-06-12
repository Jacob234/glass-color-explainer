"""fetch.py — polite HTTP fetch with an on-disk raw cache.

Every network body is written to ``raw/<supplier>/<sha1(url)>.data`` plus a ``.meta.json``
sidecar (url, fetched_at, status, content_type, sha256). The transform stages
(extract/swatch/normalize/emit) read ONLY from this cache, so re-running them is free and
never re-hits a supplier site. ``--max-age-days`` controls refetch; ``force`` bypasses cache.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

import httpx

from .config import RAW_DIR, USER_AGENT
from .politeness import Politeness


class FetchError(RuntimeError):
    pass


class RobotsDisallowed(FetchError):
    pass


def _key(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()


class Fetcher:
    def __init__(self, politeness: Politeness | None = None, *, max_age_days: float = 30.0):
        self.politeness = politeness or Politeness()
        self.max_age_s = max_age_days * 86400.0
        self._client = httpx.Client(
            headers={"User-Agent": USER_AGENT},
            timeout=30.0,
            follow_redirects=True,
        )
        self.net_hits = 0
        self.cache_hits = 0

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "Fetcher":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def _paths(self, supplier: str, url: str, subdir: str = "") -> tuple[Path, Path]:
        base = RAW_DIR / supplier / subdir if subdir else RAW_DIR / supplier
        base.mkdir(parents=True, exist_ok=True)
        k = _key(url)
        return base / f"{k}.data", base / f"{k}.meta.json"

    def _fresh(self, meta_path: Path) -> bool:
        if not meta_path.exists():
            return False
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            return False
        return (time.time() - meta.get("fetched_at", 0)) < self.max_age_s

    def fetch_bytes(
        self, url: str, supplier: str, *, subdir: str = "", force: bool = False
    ) -> bytes:
        data_path, meta_path = self._paths(supplier, url, subdir)
        if not force and data_path.exists() and self._fresh(meta_path):
            self.cache_hits += 1
            return data_path.read_bytes()

        if not self.politeness.allowed(url):
            raise RobotsDisallowed(f"robots.txt disallows {url}")
        self.politeness.wait(url)
        resp = self._client.get(url)
        self.net_hits += 1
        if resp.status_code != 200:
            raise FetchError(f"HTTP {resp.status_code} for {url}")
        body = resp.content
        data_path.write_bytes(body)
        meta_path.write_text(
            json.dumps(
                {
                    "url": url,
                    "fetched_at": time.time(),
                    "status": resp.status_code,
                    "content_type": resp.headers.get("content-type", ""),
                    "sha256": hashlib.sha256(body).hexdigest(),
                    "bytes": len(body),
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        return body

    def fetch_json(self, url: str, supplier: str, *, force: bool = False) -> dict:
        return json.loads(self.fetch_bytes(url, supplier, force=force).decode("utf-8"))
