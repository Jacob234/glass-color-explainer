"""Fit the MYEGA viscosity equation to measured SciGlass melts, for the fragility section.

Reads the plain-text conversion of SciGlass (github.com/drcassar/SciGlass, ODbL 1.0) and writes
public/data/sciglass/fragility.json: every glass made only of the stage 01 bench's oxides (99.5 mol%
or more) with a viscosity curve long enough to fix its glass transition and its slope there.

    git clone --depth 1 https://github.com/drcassar/SciGlass /path/to/sciglass-text
    python3 tools/fragility/fit_sciglass.py /path/to/sciglass-text public/data/sciglass/fragility.json

MYEGA (Mauro et al. 2009), temperatures in K, η in Pa·s:
    log10 η = A + (12 − A) (Tg/T) exp[(m/(12 − A) − 1)(Tg/T − 1)]
Tg is the temperature where η = 10^12 Pa·s, and m = d log10 η / d(Tg/T) at T = Tg, the fragility.
A is fixed at −2.93, the high-temperature limit Zheng et al. (2011) found common to silicate
liquids, so every melt is fitted for Tg and m alone. Left free, A wanders to −6 on curves that stop
short of the melting end, and m moves with it; fixing it keeps the fitted m comparable.

Needs pandas and scipy. The output is a derived database under ODbL 1.0; keep its `licence` block.
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import least_squares

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "sciglass"))
from extract import OXIDES, short  # noqa: E402

# SciGlass Tn (°C) is where log10 η [dPa·s] = n, so log10 η [Pa·s] = n − 1. SciGK interpolates
# these from each source's own points; the fit sees the interpolated curve.
VISC = [(f"T{n}", n - 1) for n in range(1, 14)]
A_FIXED = -2.93
K = 273.15


def myega(T, A, Tg, m):
    x = Tg / T
    return A + (12 - A) * x * np.exp((m / (12 - A) - 1) * (x - 1))


def fit(L, T):
    """Least-squares MYEGA through points (log10 η Pa·s, T K), A fixed. Returns Tg, m, rms."""
    Tg0 = float(np.clip(np.interp(12, L, T) if L.max() >= 12 else T.min() * 0.95, 301, 1999))  # L rises along the curve
    r = least_squares(lambda p: myega(T, A_FIXED, *p) - L, [Tg0, 35], bounds=([300, 14.5], [2000, 150]))
    Tg, m = r.x
    return Tg, m, float(np.sqrt(np.mean(r.fun ** 2)))


def main(src, out):
    sel = Path(src) / "sciglass" / "select"
    df = pd.read_csv(sel / "SciGK.csv.zip", sep="\t", low_memory=False)
    for c in OXIDES:
        df[c] = df[c].fillna(0)
    df = df[df[list(OXIDES)].sum(axis=1) >= 99.5].rename(columns=OXIDES)
    ids = list(OXIDES.values())
    df[ids] = df[ids].div(df[ids].sum(axis=1), axis=0) * 100

    refs = pd.read_csv(sel / "Reference.csv.zip", sep="\t", low_memory=False).set_index("Refer_ID")
    kod2ref = pd.read_csv(sel / "Kod2Ref.csv.zip", sep="\t").drop_duplicates("Kod").set_index("Kod")["RefID"]

    glasses, cites, dropped = [], {}, {"short": 0, "misfit": 0}
    for r in df.itertuples(index=False):
        row = r._asdict()
        pts = [(L, float(row[k])) for k, L in VISC if pd.notna(row.get(k)) and 200 <= row[k] <= 2500]
        # A curve needs five points, eight decades or a reach to 10^9 Pa·s so Tg is not a long
        # extrapolation, and a point at or below 10^6 so the slope near Tg is pinned from above.
        Ls = [p[0] for p in pts]
        if len(pts) < 5 or max(Ls) < 9 or min(Ls) > 6:
            dropped["short"] += 1
            continue
        L = np.array(Ls, float)
        T = np.array([p[1] for p in pts]) + K
        Tg, m, rms = fit(L, T)
        if rms > 0.15 or not 14.5 < m < 150:
            dropped["misfit"] += 1
            continue
        kod = int(row["KOD"])
        if kod not in cites:
            ref = refs.loc[kod2ref[kod]] if kod in kod2ref.index and kod2ref[kod] in refs.index else None
            cites[kod] = ([short(ref), ref["Descr"] if isinstance(ref["Descr"], str) else ""] if ref is not None
                          else [f"{row.get('Author') or 'unknown'} {int(row['Year']) if pd.notna(row.get('Year')) else 'n.d.'}", ""])
        glasses.append({
            "id": f"{kod}-{int(row['GLASNO'])}", "src": kod,
            "mol": [round(float(row[k]), 2) for k in ids],
            "visc": [[l, round(t - K, 1)] for l, t in zip(L.tolist(), T.tolist())],
            "fit": {"logEtaInf": A_FIXED, "Tg": round(float(Tg - K), 1), "m": round(float(m), 1), "rms": round(rms, 3)},
        })

    used = sorted({g["src"] for g in glasses})
    data = {
        "about": "Measured melts from SciGlass made only of the stage 01 bench's oxides, each with a MYEGA "
                 "fit to its viscosity curve. mol lists mol% in the order of `oxides`; visc lists [log10 "
                 "viscosity in Pa·s, temperature °C]; fit gives log10 η∞ (Pa·s), Tg (°C, where η = 10^12 "
                 "Pa·s), fragility m and the rms misfit in decades, with log10 η∞ "
                 f"fixed at {A_FIXED} (Zheng et al. 2011). src keys `sources`, each [short citation, full citation].",
        "licence": {
            "name": "ODbL 1.0",
            "url": "https://opendatacommons.org/licenses/odbl/1-0/",
            "notice": "Contains information from SciGlass (EPAM Systems, 2019), made available under "
                      "the Open Database License (ODbL) 1.0. This extract is itself offered under ODbL 1.0.",
            "from": ["https://github.com/epam/SciGlass", "https://github.com/drcassar/SciGlass"],
            "tool": "tools/fragility/fit_sciglass.py",
        },
        "oxides": ids,
        "sources": {str(k): cites[k] for k in used},
        "glasses": glasses,
    }
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(glasses)} glasses from {len(used)} sources → {out}; dropped {dropped}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
