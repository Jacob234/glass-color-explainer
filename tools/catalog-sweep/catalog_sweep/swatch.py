"""swatch.py — derive a coarse representative hex from a product photo.

Glass suppliers publish PHOTOS, not hex codes, so a swatch is an approximation: we sample the
dominant non-background colour from the thumbnail. This is honest-but-rough — a transparent
rod photographed on white can sample the lightbox, not the glass — so every result is paired
with a source flag, and a near-white/near-black-only image yields ``None`` rather than a lie.
"""

from __future__ import annotations

from io import BytesIO

from PIL import Image

from .fetch import Fetcher

_SAMPLE_SIZE = 96      # downscale for speed
_N_CLUSTERS = 6
_NEAR_WHITE = 232      # clusters brighter than this on all channels = likely background
_NEAR_BLACK = 22       # darker than this on all channels = likely shadow/border


def _is_background(rgb: tuple[int, int, int]) -> bool:
    r, g, b = rgb
    return (r >= _NEAR_WHITE and g >= _NEAR_WHITE and b >= _NEAR_WHITE) or (
        r <= _NEAR_BLACK and g <= _NEAR_BLACK and b <= _NEAR_BLACK
    )


def sample_hex(image_bytes: bytes) -> tuple[str | None, float]:
    """Return (``#rrggbb`` | None, confidence 0..1).

    confidence = pixel fraction of the chosen cluster among non-background pixels.
    Returns (None, 0.0) when the image is unreadable or only background/shadow (e.g. clear glass).
    """
    try:
        img = Image.open(BytesIO(image_bytes)).convert("RGB")
    except Exception:
        return None, 0.0

    # Center-crop to ~70% to avoid border/background bleed, then downscale.
    w, h = img.size
    cw, ch = int(w * 0.7), int(h * 0.7)
    if cw > 0 and ch > 0:
        left, top = (w - cw) // 2, (h - ch) // 2
        img = img.crop((left, top, left + cw, top + ch))
    img = img.resize((_SAMPLE_SIZE, _SAMPLE_SIZE))

    q = img.quantize(colors=_N_CLUSTERS, method=Image.MEDIANCUT)
    palette = q.getpalette()  # flat [r,g,b, r,g,b, ...]
    counts = q.getcolors() or []  # list of (count, palette_index)

    total = sum(c for c, _ in counts) or 1
    best = None  # (count, rgb)
    bg_count = 0
    for count, idx in counts:
        rgb = (palette[idx * 3], palette[idx * 3 + 1], palette[idx * 3 + 2])
        if _is_background(rgb):
            bg_count += count
            continue
        if best is None or count > best[0]:
            best = (count, rgb)

    if best is None:
        return None, 0.0
    non_bg = total - bg_count or 1
    confidence = best[0] / non_bg
    r, g, b = best[1]
    return f"#{r:02x}{g:02x}{b:02x}", round(confidence, 3)


def enrich_swatches(entries: list[dict], supplier: str, fetcher: Fetcher) -> dict:
    """Fill swatchHex/swatchSource on entries by sampling their cached product images.

    Mutates entries in place. Returns a small stats dict for logging.
    """
    stats = {"sampled": 0, "none": 0, "skipped_override": 0}
    for e in entries:
        if e.get("swatchSource") == "manual" and e.get("swatchHex"):
            stats["skipped_override"] += 1
            continue
        url = e.get("imageUrl")
        if not url:
            e["swatchHex"], e["swatchSource"] = None, "none"
            stats["none"] += 1
            continue
        try:
            img_bytes = fetcher.fetch_bytes(url, supplier, subdir="img")
        except Exception:
            e["swatchHex"], e["swatchSource"] = None, "none"
            stats["none"] += 1
            continue
        hex_, _conf = sample_hex(img_bytes)
        if hex_:
            e["swatchHex"], e["swatchSource"] = hex_, "image-sample"
            stats["sampled"] += 1
        else:
            e["swatchHex"], e["swatchSource"] = None, "none"
            stats["none"] += 1
    return stats
