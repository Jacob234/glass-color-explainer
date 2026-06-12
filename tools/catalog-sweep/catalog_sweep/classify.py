"""classify.py — infer the colorant / mechanism / family / form / opacity of a glass product.

Suppliers almost never publish the *chemistry* that colors a product, so the colorant link
back to ``optics.json`` is an INFERENCE from the product name, not scraped data. This module
keeps that inference deterministic, ordered, first-match-wins, and — above all — HONEST:

  * If nothing matches, the colorant is ``[]`` with confidence ``"unknown"``. We never guess.
  * "Striking" / silver-glass / reactive formulations are proprietary mixed metals; a guard
    forces them to ``[]`` / ``"unknown"`` even when an incidental colour word appears.
  * Bare "red" is famously ambiguous (selenium vs gold vs copper) and resolves to ``[]`` /
    ``"low"`` unless a qualifier disambiguates it.

``mechanism`` is DERIVED from ``colorant`` (never hand-authored), guaranteeing the catalog can
never drift out of sync with the science table.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# --- the science vocabulary, mirrored from src/data/optics.json (colorant id -> group) ---
# config.assert_vocab_matches() checks this against the live optics.json at runtime so it can
# never silently drift; keeping it here lets classify stay pure/file-free for fast unit tests.
OPTICS_GROUPS: dict[str, str] = {
    "cobalt": "ions",
    "chromium": "ions",
    "manganese": "ions",
    "iron-ferrous": "ions",
    "iron-ferric": "ions",
    "copper": "ions",
    "neodymium": "ions",
    "gold-colloid": "colloids",
    "silver-colloid": "colloids",
    "cds": "bandgap",
    "cdsse": "bandgap",
    "cdse": "bandgap",
}

# Mechanisms, mirrored from src/data/map.json (the four mechanism ids).
MECHANISMS = ("ions", "colloids", "bandgap", "structure")
# Derived sentinels used when a single optics mechanism does not apply.
MECH_MIXED = "mixed"
MECH_UNKNOWN = "unknown"

CONFIDENCE = ("high", "medium", "low", "unknown")
SOURCES = ("supplier-stated", "name-rule", "manual", "inferred-family")


@dataclass(frozen=True)
class ColorantResult:
    colorant: tuple[str, ...]
    confidence: str
    source: str
    note: str

    def as_dict(self) -> dict:
        return {
            "colorant": list(self.colorant),
            "colorantConfidence": self.confidence,
            "colorantSource": self.source,
            "colorantNote": self.note,
        }


def _norm(text: str) -> str:
    """Lowercase, strip punctuation to spaces, collapse whitespace — for word-boundary matching."""
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s-]", " ", (text or "").lower())).strip()


# --- GUARDS (run first; can veto any colour rule) ----------------------------------------
# Proprietary striking / silver-glass / reactive formulations: mixed Ag/Au/S/Se, not
# determinable from a name. Never fabricate a single colorant for these.
_STRIKING_GUARD = re.compile(
    r"\b(silver[ -]?glass|striking|reactive|fum(?:e|ing|ed)|raku|psyche|terranova)\b"
)


@dataclass(frozen=True)
class _Rule:
    pattern: re.Pattern
    colorant: tuple[str, ...]
    confidence: str
    rule_id: str


def _r(rule_id: str, pat: str, colorant, confidence: str) -> _Rule:
    cs = (colorant,) if isinstance(colorant, str) else tuple(colorant)
    return _Rule(re.compile(pat, re.I), cs, confidence, rule_id)


# Ordered, most-specific-first. First match wins.
_RULES: tuple[_Rule, ...] = (
    # --- structure / no-chromophore (decided by explicit words, before colour rules) ---
    _r("dichroic", r"\bdichroic\b", (), "high"),
    # --- ions: high-confidence explicit element / canonical names ---
    _r("cobalt-explicit", r"\b(cobalt|gentian)\b", "cobalt", "high"),
    _r("chromium-explicit", r"\b(chromium|chrome|emerald|viridian)\b", "chromium", "high"),
    _r("manganese-explicit", r"\b(manganese|amethyst)\b", "manganese", "medium"),
    _r("neodymium-explicit", r"\b(neodymium|alexandrite|didymium)\b", "neodymium", "high"),
    _r("copper-turquoise", r"\b(turquoise|teal|aqua|aquamarine|peacock|caribbean|egyptian)\b", "copper", "high"),
    _r("copper-aventurine", r"\b(aventurine|goldstone)\b", "copper", "high"),
    # --- colloids: gold pinks/reds, copper ruby, silver stain ---
    _r("gold-ruby", r"\b(gold[ -]?ruby|cranberry|cranberry[ -]?ruby)\b", "gold-colloid", "high"),
    _r("copper-ruby", r"\b(copper[ -]?ruby|oxblood|sang[ -]?de[ -]?boeuf)\b", "copper", "high"),
    _r("silver-stain", r"\b(silver[ -]?stain|amber[ -]?stain)\b", "silver-colloid", "high"),
    _r("gold-pink", r"\b(fuchsia|magenta|cerise|raspberry|rose|pink)\b", "gold-colloid", "medium"),
    # --- bandgap: selenium reds, orange, cadmium yellow ---
    _r("selenium-red", r"\b(signal[ -]?red|traffic[ -]?red|tomato|scarlet|selenium|poppy|chinese[ -]?red)\b", "cdse", "high"),
    _r("cad-orange", r"\b(tangerine|pumpkin|persimmon|marigold)\b", "cdsse", "medium"),
    _r("cad-yellow", r"\b(cadmium[ -]?yellow|canary|sunflower)\b", "cds", "medium"),
    # --- ions: medium / poetic ---
    _r("cobalt-poetic", r"\b(sapphire|navy|indigo|midnight)\b", "cobalt", "medium"),
    # --- clear / uncolored (no chromophore, not 'unknown') ---
    _r("clear", r"\b(clear|crystal|colou?rless|tekta|water[ -]?clear)\b", (), "high"),
    # --- low-confidence family inferences (kept last) ---
    _r("chromium-greenish", r"\b(forest|kelly|grass[ -]?green)\b", "chromium", "low"),
    _r("manganese-purple", r"\b(plum|grape|orchid|violet)\b", "manganese", "low"),
)

# A bare warm "red" with no qualifier is ambiguous across three mechanisms.
_BARE_RED = re.compile(r"\bred\b")


def classify_colorant(name: str, *, tags=(), hints: dict | None = None) -> ColorantResult:
    """Infer the colorant(s) of a product from its name (+ optional per-supplier hints).

    Returns a :class:`ColorantResult`. ``colorant == ()`` means honestly unknown.
    """
    norm = _norm(name)

    # 1) Per-supplier explicit hints win over generic rules (e.g. a line's known chemistry).
    if hints:
        for kw, colorant in hints.items():
            if _norm(kw) and _norm(kw) in norm:
                cs = (colorant,) if isinstance(colorant, str) else tuple(colorant)
                return ColorantResult(cs, "high", "supplier-stated", f"supplier hint '{kw}'")

    # 2) Striking / silver-glass guard — veto before any colour rule.
    if _STRIKING_GUARD.search(norm):
        return ColorantResult(
            (), "unknown", "name-rule",
            "striking/silver-glass formulation — proprietary mixed metals; colorant not determinable from name",
        )

    # 3) Ordered ruleset, first match wins.
    for rule in _RULES:
        if rule.pattern.search(norm):
            note = f"rule {rule.rule_id}"
            if not rule.colorant:
                note += " — no chromophore (structure/clear)"
            return ColorantResult(rule.colorant, rule.confidence, "name-rule", note)

    # 4) Bare red with no disambiguator: candidates {cdse, gold-colloid, copper}.
    if _BARE_RED.search(norm):
        return ColorantResult(
            (), "low", "name-rule",
            "red is ambiguous (selenium / gold / copper) — needs supplier data",
        )

    # 5) Nothing fired — honest unknown.
    return ColorantResult((), "unknown", "name-rule", "no name-rule matched")


def derive_mechanism(
    colorant, *, opacity: str | None = None, family: str | None = None, groups: dict | None = None
) -> str:
    """Derive the mechanism from the colorant id(s). Never stored by hand.

    Mechanism follows the CHROMOPHORE, not the texture: an opaque (opal) colored glass with an
    unidentified colorant is ``unknown`` — it has a chromophore we just couldn't name — NOT
    ``structure``. ``structure`` (scattering/interference with no chromophore) is reserved for
    dichroic and genuinely chromophore-free white opal.

    * single colorant -> its optics group (ions/colloids/bandgap)
    * multiple groups -> "mixed"
    * empty + (dichroic | white-opal family | dichroic/metallic family) -> "structure"
    * empty otherwise -> "unknown"
    """
    groups = groups or OPTICS_GROUPS
    ids = tuple(colorant)
    if ids:
        gset = {groups[c] for c in ids if c in groups}
        if len(gset) == 1:
            return next(iter(gset))
        if len(gset) > 1:
            return MECH_MIXED
        return MECH_UNKNOWN
    if opacity == "dichroic" or family in ("white/opal", "metallic/dichroic"):
        return "structure"
    return MECH_UNKNOWN


# --- family (visual taxonomy, independent of chemistry) -----------------------------------
FAMILIES = (
    "blue", "green", "red", "orange", "amber", "yellow", "purple", "pink",
    "neutral/clear", "white/opal", "black", "brown", "gray",
    "multi/streaky", "metallic/dichroic",
)

# Checked in order; first hit wins. Specific before generic.
_FAMILY_RULES: tuple[tuple[str, re.Pattern], ...] = (
    ("metallic/dichroic", re.compile(r"\b(dichroic|aventurine|goldstone|metallic|iridescent|luster|lustre)\b", re.I)),
    ("multi/streaky", re.compile(r"\b(streaky|streak|mardi[ -]?gras|rainbow|multi|mottle|mix)\b", re.I)),
    ("white/opal", re.compile(r"\b(white|milk|opal|opaline|alabaster|ivory|snow)\b", re.I)),
    ("black", re.compile(r"\b(black|jet|obsidian|onyx)\b", re.I)),
    ("gray", re.compile(r"\b(gr[ae]y|charcoal|slate|steel|smoke)\b", re.I)),
    ("brown", re.compile(r"\b(brown|chocolate|coffee|sepia|umber|sienna|tan|khaki|caramel)\b", re.I)),
    ("pink", re.compile(r"\b(pink|rose|fuchsia|magenta|cerise|raspberry|blush|salmon)\b", re.I)),
    ("purple", re.compile(r"\b(purple|violet|amethyst|plum|grape|lavender|lilac|orchid|mauve)\b", re.I)),
    ("amber", re.compile(r"\b(amber|honey)\b", re.I)),
    ("orange", re.compile(r"\b(orange|tangerine|pumpkin|persimmon|coral|apricot|peach)\b", re.I)),
    ("yellow", re.compile(r"\b(yellow|canary|sunflower|gold(?!stone)|lemon|marigold|straw)\b", re.I)),
    ("red", re.compile(r"\b(red|ruby|cranberry|scarlet|tomato|crimson|garnet|cherry|brick)\b", re.I)),
    ("green", re.compile(r"\b(green|emerald|olive|lime|jade|moss|forest|kelly|chartreuse|mint|viridian)\b", re.I)),
    ("blue", re.compile(r"\b(blue|cobalt|sapphire|navy|indigo|turquoise|teal|aqua|cyan|cerulean|peacock|azure)\b", re.I)),
    ("neutral/clear", re.compile(r"\b(clear|crystal|colou?rless|tekta|neutral)\b", re.I)),
)


def classify_family(name: str, *, tags=()) -> str:
    """Best visual family for filtering. Prefers explicit supplier colour tags, else the name."""
    tagset = {_norm(t) for t in (tags or ())}
    # Explicit single-word colour tags (Glass Alchemy exposes e.g. "Green").
    for fam, _pat in _FAMILY_RULES:
        simple = fam.split("/")[0]
        if simple in tagset:
            return fam
    haystack = _norm(name) + " " + " ".join(tagset)
    for fam, pat in _FAMILY_RULES:
        if pat.search(haystack):
            return fam
    return "multi/streaky"


# --- form & opacity -----------------------------------------------------------------------
FORMS = (
    "sheet", "rod", "stringer", "frit", "powder", "billet", "confetti",
    "noodle", "tube", "enamel", "paint", "stain", "sample",
)
_FORM_KEYWORDS: tuple[tuple[str, re.Pattern], ...] = (
    ("billet", re.compile(r"\bbillet\b", re.I)),
    ("powder", re.compile(r"\bpowder\b", re.I)),
    ("frit", re.compile(r"\bfrit\b", re.I)),
    ("stringer", re.compile(r"\bstringer\b", re.I)),
    ("noodle", re.compile(r"\bnoodle\b", re.I)),
    ("confetti", re.compile(r"\bconfetti\b", re.I)),
    ("tube", re.compile(r"\btub(?:e|ing)\b", re.I)),
    ("rod", re.compile(r"\b(rod|cane)\b", re.I)),
    ("sheet", re.compile(r"\b(sheet|tekta|ribbon)\b", re.I)),
    ("enamel", re.compile(r"\benamel\b", re.I)),
    ("paint", re.compile(r"\b(paint|tracing)\b", re.I)),
    ("stain", re.compile(r"\bstain\b", re.I)),
    ("sample", re.compile(r"\bsample\b", re.I)),
)


def classify_form(*texts, defaults=()) -> list[str]:
    """Detect forms from title/product_type/tags. Falls back to the supplier's defaults."""
    hay = _norm(" ".join(t for t in texts if t))
    found = [form for form, pat in _FORM_KEYWORDS if pat.search(hay)]
    if not found:
        found = list(defaults)
    # stable de-dup
    seen, out = set(), []
    for f in found:
        if f not in seen:
            seen.add(f)
            out.append(f)
    return out


_OPACITY_RULES: tuple[tuple[str, re.Pattern], ...] = (
    ("dichroic", re.compile(r"\bdichroic\b", re.I)),
    ("metallic", re.compile(r"\b(metallic|aventurine|goldstone|luster|lustre|iridescent)\b", re.I)),
    ("streaky", re.compile(r"\b(streaky|streak|mottle|wispy)\b", re.I)),
    ("opal", re.compile(r"\b(opal|opaline|opaque|alabaster)\b", re.I)),
    ("opalescent", re.compile(r"\bopalescent\b", re.I)),
    ("translucent", re.compile(r"\btranslucent\b", re.I)),
    ("transparent", re.compile(r"\b(transparent|cathedral|clear|crystal|tekta)\b", re.I)),
)
OPACITIES = ("transparent", "translucent", "opal", "opalescent", "streaky", "wispy", "dichroic", "metallic", "unknown")


def classify_opacity(*texts, default: str = "unknown") -> str:
    hay = _norm(" ".join(t for t in texts if t))
    for op, pat in _OPACITY_RULES:
        if pat.search(hay):
            return "opalescent" if op == "opal" and "opalescent" in hay else op
    return default
