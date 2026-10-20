"""Run GlassNet over the stage 01 oxide bench and write the numbers to public/data/glassnet.json.

GlassNet (Cassar 2023, Ceram. Int. 49, 36013) is GlassPy's multitask neural network: 85 properties
from composition, trained on SciGlass. GlassPy and its weights are GPL-3.0-or-later; this script only
runs them, and the site ships the resulting numbers, not the code or weights. GlassPy downloads its
weights from Zenodo, which the project's cloud sandbox cannot reach, so the script runs in the
"GlassNet" GitHub Actions workflow (or on any machine with `pip install glasspy`):

    python3 tools/glassnet/glassnet.py public/data/glassnet.json

The bench's sliders reach any of millions of batches, too many to precompute one by one. The page
starts from the nearest preset and moves one slider at a time, so the script runs GlassNet along
every slider's whole range from each preset (41 steps), and the page adds up the changes of the
sliders that have moved: exact for one slider, an approximation for several, since it ignores how
the oxides interact. (A cubic fitted to GlassNet over the whole slider box was tried first; it
missed GlassNet by 40 to 60 °C rms, too coarse to show anything.) It writes:

- `named`: GlassNet itself at each preset, as the bench's sliders set it;
- `sweeps`: GlassNet along each slider from each preset, and `additivity`, how far the summed
  changes stray from GlassNet itself on batches with two or three sliders moved;
- `melts`: GlassNet run on every measured melt in public/data/sciglass/bench.json, for scoring it
  against SciGlass and for the page's nearest-melt comparison, flagged by whether that melt sat in
  GlassNet's own training set, its holdout, or neither.
"""

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BATCH = json.loads((ROOT / "src/data/batch.json").read_text())
BENCH = json.loads((ROOT / "public/data/sciglass/bench.json").read_text())
OX = BENCH["oxides"]  # the bench's nine oxides, in SciGlass extract order
M = {o["id"]: o["M"] for o in BATCH["oxides"]}
MOVED = [o for o in BATCH["oxides"] if o.get("max")]  # the slider oxides; silica is the balance
VARS = [o["id"] for o in MOVED]
SILICA_MIN = 40  # wt%, as in src/scripts/stage-batch.js
LEVELS = list(range(0, 13))  # GlassNet's T0..T12: T (K) where log10 η [Pa·s] = n
PROPS = {  # GlassNet target → (key here, K to °C?)
    **{f"T{n}": (f"T{n}", True) for n in LEVELS},
    "Tliquidus": ("liquidus", True),
    "Tg": ("Tg", True),
    "RefractiveIndex": ("nd", False),
    "AbbeNum": ("vd", False),
    "Density293K": ("rho", False),
}
ATOMS = {"SiO2": {"Si": 1, "O": 2}, "Na2O": {"Na": 2, "O": 1}, "K2O": {"K": 2, "O": 1}, "CaO": {"Ca": 1, "O": 1},
         "MgO": {"Mg": 1, "O": 1}, "Al2O3": {"Al": 2, "O": 3}, "B2O3": {"B": 2, "O": 3}, "PbO": {"Pb": 1, "O": 1},
         "Fe2O3": {"Fe": 2, "O": 3}}
ELEMENTS = sorted({e for a in ATOMS.values() for e in a})


def mol_from_wt(wt):
    """wt% of the moved oxides (silica the balance) → mol% over OX."""
    w = dict(wt)
    w["SiO2"] = 100 - sum(wt.values())
    m = {k: w.get(k, 0) / M[k] for k in OX}
    s = sum(m.values())
    return [100 * m[k] / s for k in OX]


def preset_mol(p):
    if "mol" in p:
        c = [max(0, p["mol"].get(k, 0)) for k in OX]
    else:
        c = [p["wt"].get(k, 0) / M[k] for k in OX]
    s = sum(c)
    return [100 * x / s for x in c]


def preset_wt(p):
    mol = preset_mol(p)
    w = [x * M[k] for x, k in zip(mol, OX)]
    s = sum(w)
    return {k: round(100 * x / s, 1) for x, k in zip(w, OX) if k in VARS}


STEPS = 41  # points along each slider, 0 to its max


def fits(wt):
    return sum(wt.values()) <= 100 - SILICA_MIN + 1e-9


def sweep_grid():
    """From each preset, each slider swept over its whole range, the others held; the steps past
    the 40 wt% silica floor are left out, as the bench's sliders stop there."""
    rows, where = [], []
    for p in BATCH["presets"]:
        base = preset_wt(p)
        for o in MOVED:
            for j, x in enumerate(np.linspace(0, o["max"], STEPS)):
                wt = {**base, o["id"]: float(x)}
                if fits(wt):
                    rows.append(mol_from_wt(wt))
                    where.append((p["id"], o["id"], j))
    return rows, where


def moved(n, rng):
    """Batches with two or three sliders moved from a preset, to judge the summed changes."""
    out = []
    while len(out) < n:
        p = BATCH["presets"][rng.integers(len(BATCH["presets"]))]
        wt = preset_wt(p)
        for i in rng.choice(len(MOVED), size=rng.integers(2, 4), replace=False):
            o = MOVED[i]
            wt[o["id"]] = float(rng.uniform(0, o["max"]))
        if fits(wt):
            out.append((p["id"], wt))
    return out


def additive(sweeps, named, pid, wt, key):
    """The page's rule: the preset, plus each moved slider's change along its own sweep."""
    base, v = preset_wt(next(p for p in BATCH["presets"] if p["id"] == pid)), named[pid][key]
    for o in MOVED:
        k = o["id"]
        if abs(wt[k] - base.get(k, 0)) < 1e-9:
            continue
        ys = sweeps[pid][k][key]
        xs = np.linspace(0, o["max"], STEPS)[: len(ys)]
        v += np.interp(wt[k], xs, ys) - np.interp(base.get(k, 0), xs, ys)
    return v


def predict(model, rows):
    import pandas as pd

    X = np.array(rows)
    y = model.predict(X, OX)
    out = pd.DataFrame(index=range(len(rows)))
    for target, (key, kelvin) in PROPS.items():
        out[key] = y[target].values - (273.15 if kelvin else 0)
    return out


def temp_at(row, L):
    """GlassNet's temperature (°C) at log10 η = L, linear between its integer isokoms."""
    if not 0 <= L <= 12:
        return None
    lo = int(np.floor(L))
    hi = min(lo + 1, 12)
    a, b = row[f"T{lo}"], row[f"T{hi}"]
    return a + (b - a) * (L - lo)


def element_fractions(mol):
    at = dict.fromkeys(ELEMENTS, 0.0)
    for x, k in zip(mol, OX):
        for e, n in ATOMS[k].items():
            at[e] += x * n
    s = sum(at.values())
    return [at[e] / s for e in ELEMENTS]


def split_lookup(model):
    """KD-trees over the element fractions of GlassNet's training and holdout sets, restricted to
    glasses of only the bench's elements, so each SciGlass melt can be placed in one or the other."""
    from sklearn.neighbors import KDTree

    trees = {}
    for name, df in (("train", model.get_training_dataset()), ("holdout", model.get_test_dataset())):
        el = df["elements"]
        cols = [e for e in ELEMENTS if e in el.columns]
        other = el.drop(columns=cols).sum(axis=1)
        keep = el.loc[other < 0.002, cols].reindex(columns=ELEMENTS, fill_value=0)
        trees[name] = KDTree(keep.values)
    return trees


def main(out):
    from importlib.metadata import version

    import torch
    from glasspy.predict import GlassNet

    torch.manual_seed(0)
    rng = np.random.default_rng(1021)
    model = GlassNet()

    digits = lambda k: 4 if k in ("nd", "rho") else 2 if k == "vd" else 1
    keys = [k for k, _ in PROPS.values()]

    # GlassNet itself at each preset, as the bench sets it: slider settings rounded to 0.1 wt% and no
    # iron, which the bench treats as a colorant. GlassNet is touchy enough that the 0.04 mol% of iron
    # and the rounding move float glass's liquidus by tens of degrees, so the sweeps must start here.
    yn = predict(model, [mol_from_wt(preset_wt(p)) for p in BATCH["presets"]])
    named = {p["id"]: {k: round(float(yn[k][i]), digits(k)) for k in keys} for i, p in enumerate(BATCH["presets"])}

    # Along each slider from each preset.
    rows, where = sweep_grid()
    ys = predict(model, rows)
    sweeps = {p["id"]: {o["id"]: {k: [] for k in keys} for o in MOVED} for p in BATCH["presets"]}
    for i, (pid, ox, _) in enumerate(where):
        for k in keys:
            sweeps[pid][ox][k].append(round(float(ys[k][i]), digits(k)))

    # How far the summed changes stray from GlassNet with two or three sliders moved.
    trials = moved(3000, rng)
    yt = predict(model, [mol_from_wt(wt) for _, wt in trials])
    additivity = {}
    for k in keys:
        err = np.array([additive(sweeps, named, pid, wt, k) - yt[k][i] for i, (pid, wt) in enumerate(trials)])
        additivity[k] = {"rms": round(float(np.sqrt(np.mean(err**2))), digits(k)),
                         "median": round(float(np.median(np.abs(err))), digits(k)),
                         "p95": round(float(np.percentile(np.abs(err), 95)), digits(k))}
        print(f"{k:10s} summed changes vs GlassNet, 2–3 sliders moved: {additivity[k]}")

    # GlassNet on every measured melt, and where each melt sat in its training split.
    glasses = BENCH["glasses"]
    ym = predict(model, [g["mol"] for g in glasses])
    F = np.array([element_fractions(g["mol"]) for g in glasses])
    try:
        dist = {name: t.query(F, k=1)[0].ravel() for name, t in split_lookup(model).items()}
    except Exception as e:  # the split needs GlassPy's SciGlass files; without them every melt is "neither"
        print(f"could not rebuild GlassNet's training split: {e!r}")
        dist = {"train": np.full(len(glasses), np.inf), "holdout": np.full(len(glasses), np.inf)}
    melts, counts = {}, {"train": 0, "holdout": 0, "neither": 0}
    for i, g in enumerate(glasses):
        row = ym.iloc[i]
        # Rounded to three decimals before deduplication, so a match is within ~0.0009 per element.
        split = ("holdout" if dist["holdout"][i] < 0.0015 and dist["holdout"][i] <= dist["train"][i]
                 else "train" if dist["train"][i] < 0.0015 else "neither")
        counts[split] += 1
        visc = [None if (t := temp_at(row, L)) is None else round(float(t)) for L, _ in g.get("visc", [])]
        melts[g["id"]] = [split[0], visc or None,
                          round(float(row["liquidus"])) if "liq" in g else None,
                          round(float(row["nd"]), 4) if "nd" in g else None,
                          round(float(row["vd"]), 1) if "vd" in g else None]
    print(f"melts by GlassNet split: {counts}")

    data = {
        "about": "GlassNet predictions for stage 01's oxide bench. Temperatures °C; T0..T12 are where "
                 "log10 η [Pa·s] = 0..12; liquidus is the temperature above which no crystal is stable; "
                 "nd, vd, rho are index, Abbe number and density (g/cm³). `named` is GlassNet at each "
                 "preset. `sweeps[preset][oxide][property]` is GlassNet with that slider at "
                 f"{STEPS} even steps from 0 to its max wt% (silica the balance, the others at the preset), "
                 "cut short where silica would fall below 40 wt%. `additivity` is how far the preset plus "
                 "the summed one-slider changes misses GlassNet with two or three sliders moved. `melts` keys "
                 "the glasses of public/data/sciglass/bench.json: [split, GlassNet T at each of that "
                 "glass's measured viscosity levels, liquidus, nd, vd], each null where SciGlass has no "
                 "measurement to compare; split is t (in GlassNet's training set), h (its holdout) or n "
                 "(found in neither).",
        "model": {"name": "GlassNet", "glasspy": version("glasspy"),
                  "cite": "Cassar D.R., GlassNet: A multitask deep neural network for predicting many glass "
                          "properties, Ceramics International 49 (2023) 36013–36024, "
                          "doi:10.1016/j.ceramint.2023.08.281",
                  "license": "Numbers computed with GlassPy (GPL-3.0-or-later); no GlassPy code or weights "
                             "are included. Compositions from the bench and from SciGlass (ODbL 1.0).",
                  "tool": "tools/glassnet/glassnet.py",
                  "splits": counts},
        "oxides": OX,
        "sliders": {o["id"]: o["max"] for o in MOVED},
        "steps": STEPS,
        "named": named,
        "sweeps": sweeps,
        "additivity": additivity,
        "melts": melts,
    }
    Path(out).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(rows)} sweep points, {len(trials)} trials, {len(melts)} melts → {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "public/data/glassnet.json"))
