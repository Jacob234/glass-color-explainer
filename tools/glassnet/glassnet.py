"""Run GlassNet over the stage 01 oxide bench and write the numbers to public/data/glassnet.json.

GlassNet (Cassar 2023, Ceram. Int. 49, 36013) is GlassPy's multitask neural network: 85 properties
from composition, trained on SciGlass. GlassPy and its weights are GPL-3.0-or-later; this script only
runs them, and the site ships the resulting numbers, not the code or weights. GlassPy downloads its
weights from Zenodo, which the project's cloud sandbox cannot reach, so the script runs in the
"GlassNet" GitHub Actions workflow (or on any machine with `pip install glasspy`):

    python3 tools/glassnet/glassnet.py public/data/glassnet.json

The bench's sliders reach any of millions of batches, too many to precompute one by one, so the
script fits a cubic polynomial in mol% to GlassNet's predictions over batches drawn the way the
sliders draw them, and the page evaluates that polynomial. It writes, for each property:

- `surrogate`: the polynomial, in the term format of src/scripts/batch.js, with how closely it
  reproduces GlassNet on held-out batches and along one-oxide sweeps from each preset;
- `named`: GlassNet itself at each preset (the page uses these exactly when a preset is chosen);
- `melts`: GlassNet run on every measured melt in public/data/sciglass/bench.json, for scoring it
  against SciGlass and for the page's nearest-melt comparison, flagged by whether that melt sat in
  GlassNet's own training set, its holdout, or neither.
"""

import json
import sys
from itertools import combinations, combinations_with_replacement
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


def draws(n, rng):
    """Batches as a reader makes them: each slider left at zero half the time, otherwise anywhere on
    its range, and silica at least 40 wt%."""
    out = []
    while len(out) < n:
        wt = {o["id"]: (rng.uniform(0, o["max"]) if rng.random() < 0.5 else 0.0) for o in MOVED}
        if sum(wt.values()) <= 100 - SILICA_MIN:
            out.append(mol_from_wt(wt))
    return out


def sweeps():
    """From each preset, each slider swept over its whole range (21 steps), the others held."""
    out = []
    for p in BATCH["presets"]:
        base = preset_wt(p)
        for o in MOVED:
            for x in np.linspace(0, o["max"], 21):
                wt = {**base, o["id"]: float(x)}
                if sum(wt.values()) <= 100 - SILICA_MIN:
                    out.append(mol_from_wt(wt))
    return out


TERMS = ([(v,) for v in VARS] + list(combinations_with_replacement(VARS, 2))
         + list(combinations_with_replacement(VARS, 3)))


def term_name(t):
    if len(set(t)) == 1 and len(t) > 1:
        return f"{t[0]}^{len(t)}"
    return "*".join(t)


def design(X):
    idx = {k: i for i, k in enumerate(OX)}
    cols = [np.ones(len(X))] + [np.prod([X[:, idx[v]] for v in t], axis=0) for t in TERMS]
    return np.stack(cols, axis=1)


def sig(x, n=6):
    return float(f"{x:.{n}g}")


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

    # The surrogate: fit on 8,000 drawn batches, judged on 2,000 more and on the sweeps.
    fit_rows, hold_rows, sweep_rows = draws(8000, rng), draws(2000, rng), sweeps()
    yf, yh, ys = predict(model, fit_rows), predict(model, hold_rows), predict(model, sweep_rows)
    Af, Ah, As = design(np.array(fit_rows)), design(np.array(hold_rows)), design(np.array(sweep_rows))
    surrogate = {}
    for key, _ in PROPS.values():
        coef, *_ = np.linalg.lstsq(Af, yf[key].values, rcond=None)
        coef = np.array([sig(c) for c in coef])
        eh, es = Ah @ coef - yh[key].values, As @ coef - ys[key].values
        digits = 4 if key in ("nd", "rho") else 2 if key == "vd" else 1
        surrogate[key] = {
            "b0": coef[0],
            "terms": {term_name(t): c for t, c in zip(TERMS, coef[1:])},
            "rmsHeldOut": round(float(np.sqrt(np.mean(eh**2))), digits),
            "p95HeldOut": round(float(np.percentile(np.abs(eh), 95)), digits),
            "rmsSweeps": round(float(np.sqrt(np.mean(es**2))), digits),
            "maxSweeps": round(float(np.max(np.abs(es))), digits),
        }
        print(f"{key:10s} held-out rms {surrogate[key]['rmsHeldOut']}, p95 {surrogate[key]['p95HeldOut']}; "
              f"sweeps rms {surrogate[key]['rmsSweeps']}, max {surrogate[key]['maxSweeps']}")

    # GlassNet itself at each preset.
    yn = predict(model, [preset_mol(p) for p in BATCH["presets"]])
    named = {p["id"]: {k: round(float(yn[k][i]), 4 if k in ("nd", "rho") else 2 if k == "vd" else 1)
                       for k, _ in PROPS.values()} for i, p in enumerate(BATCH["presets"])}

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
                 "nd, vd, rho are index, Abbe number and density (g/cm³). `surrogate` is a cubic in mol% "
                 "fitted to GlassNet over batches the bench's sliders can make (silica the balance), with "
                 "its own error against GlassNet. `named` is GlassNet itself at each preset. `melts` keys "
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
        "variables": VARS,
        "surrogate": surrogate,
        "named": named,
        "melts": melts,
    }
    Path(out).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(fit_rows)} fit, {len(hold_rows)} held out, {len(sweep_rows)} sweep points, "
          f"{len(melts)} melts → {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "public/data/glassnet.json"))
