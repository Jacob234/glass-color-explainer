"""Fit stage 01's room-temperature density model to SciGlass (JBK-1003).

Every SciGlass glass made only of the bench's nine oxides (99.5 mol% or more), inside the range
the bench's viscosity model was fitted to, with a measured room-temperature density. The model is
the form batch.js already evaluates: b0 + Σ b·C over mol% C of everything but silica, plus the
square and cross terms named in TERMS. Fitted by least squares, then refitted without points more
than four robust standard deviations out. Prints the held-out (by source) errors and the JSON for
src/data/batch.json's `density` block.

    python3 tools/sciglass/fit_density.py /path/to/sciglass-text

Needs pandas and numpy. SciGlass is ODbL 1.0; the coefficients are a derived database under it.
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

OXIDES = {"SIO2": "SiO2", "NA2O": "Na2O", "K2O": "K2O", "CAO": "CaO", "MgO": "MgO",
          "AL2O3": "Al2O3", "B2O3": "B2O3", "PBO": "PbO", "FemOn": "Fe2O3"}
LINEAR = ["Na2O", "K2O", "CaO", "MgO", "Al2O3", "B2O3", "PbO", "Fe2O3"]
# PbO²: lead packs ever more tightly. The boron terms follow BO₃ turning into denser BO₄ as alkali is added.
# Also tried, and no better held out: squares of the alkalis and lime, boron × alumina and × lime, a
# Dell–Bray BO₄ count, and curvature in total non-silica. None fixes the high-silica borosilicates
# (Pyrex type), which this model puts ~0.034 g/cm³ heavy.
TERMS = LINEAR + ["PbO^2", "B2O3^2", "B2O3*Na2O", "B2O3*K2O"]


def column(df, term):
    if "^" in term:
        k, p = term.split("^")
        return df[k] ** int(p)
    out = 1
    for k in term.split("*"):
        out = out * df[k]
    return out


def fit(df):
    X = np.column_stack([np.ones(len(df))] + [column(df, t) for t in TERMS])
    y = df.DENSITY.to_numpy()
    keep = np.ones(len(y), bool)
    for _ in range(3):
        b, *_ = np.linalg.lstsq(X[keep], y[keep], rcond=None)
        r = y - X @ b
        s = 1.4826 * np.median(np.abs(r[keep]))
        keep = np.abs(r) < 4 * s
    return b, keep


def predict(b, df):
    return b[0] + sum(bi * column(df, t) for bi, t in zip(b[1:], TERMS))


def main(src):
    df = pd.read_csv(Path(src) / "sciglass" / "select" / "SciGK.csv.zip", sep="\t", low_memory=False)
    for c in OXIDES:
        df[c] = df[c].fillna(0)
    df = df[df[list(OXIDES)].sum(axis=1) >= 99.5].rename(columns=OXIDES)
    ids = list(OXIDES.values())
    df[ids] = df[ids].div(df[ids].sum(axis=1), axis=0) * 100
    df = df[(df.SiO2 >= 43) & (df.SiO2 <= 89) & (df.B2O3 <= 17) & (df.Al2O3 <= 10)]
    df = df[df.DENSITY.between(1.9, 7.0)].reset_index(drop=True)

    # Held out by source, five folds, so one laboratory's series cannot vouch for itself.
    fold = (df.KOD.astype("int64") * 2654435761 % 4294967296) % 5
    held = np.empty(len(df))
    for k in range(5):
        b, _ = fit(df[fold != k])
        held[fold == k] = predict(b, df[fold == k]) - df.DENSITY[fold == k]
    b, keep = fit(df)

    def report(name, mask):
        r = held[mask]
        print(f"{name:28s} n {mask.sum():6d}  median {np.median(r):+.4f}  median |miss| {np.median(np.abs(r)):.4f} g/cm³")
    report("all", np.ones(len(df), bool))
    report("soda-lime", (df.Al2O3 < 2) & (df.B2O3 < 0.1) & (df.PbO < 0.1) & (df.CaO > 3))
    report("alkali silicate", (df.CaO + df.MgO + df.Al2O3 + df.B2O3 + df.PbO < 0.5))
    report("borosilicate", df.B2O3 >= 5)
    report("lead", df.PbO >= 5)
    report("high-silica borosilicate", (df.B2O3.between(8, 15)) & (df.SiO2 > 78) & (df.Na2O + df.K2O < 7))
    print(f"{len(df)} glasses, {keep.sum()} kept in the final fit, from {df.KOD.nunique()} sources")
    print(json.dumps({"b0": round(b[0], 5), "terms": {t: float(f"{v:.4g}") for t, v in zip(TERMS, b[1:])},
                      "n": int(keep.sum()), "sources": int(df.KOD[keep].nunique())}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1])
