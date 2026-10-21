"""Fit stage 01's durability model to the Sheffield boiling-water tests in SciGlass (JBK-1004).

Between 1919 and 1929 W. E. S. Turner's Department of Glass Technology at Sheffield measured how
much of a glass boiling water dissolves: grains of a few tenths of a millimeter, boiled for an
hour, weighed before and after (per cent loss in weight). SciGlass's ARHIV table keeps their
numbers as text. This script reads every series from that laboratory that used the method, keeps
the glasses made only of the bench's oxides (99 mol% or more), and fits

    loss (%) = floor + 100 / (1 + exp(−(F − F0) / w)),   F = Na2O + K2O − Σ c·C   (mol%)

F is the soda the other oxides have not taken up ("free soda"). Each c says how many mol% of soda
one mol% of that oxide cancels; boric oxide has a square term because past ~16 mol% it makes the
glass less durable again. The logistic saturates at 100% (the grains dissolve) and the floor is
what the test reports for a glass water hardly touches. Potash never appears in these series: it
is counted mole for mole as soda, an assumption. Grain sizes differ between series, so each grain
size gets its own factor (an offset in log loss); the model reports on the 500–700 µm scale.

Fitted by least squares on log10 loss. Prints the fit, a leave-one-series-out check, and the JSON
for src/data/batch.json's `durability` block and src/data/durability.json.

    python3 tools/sciglass/fit_durability.py /path/to/sciglass-text

Needs pandas, numpy and scipy. SciGlass is ODbL 1.0; the coefficients and the glasses written out
are a derived database under it.
"""

import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import least_squares

OXIDES = {"SIO2": "SiO2", "NA2O": "Na2O", "K2O": "K2O", "CAO": "CaO", "MgO": "MgO",
          "AL2O3": "Al2O3", "B2O3": "B2O3", "PBO": "PbO", "FemOn": "Fe2O3"}
# The Sheffield series, by SciGlass source table (KOD), with their grain sizes. 2397 repeats 3741
# (Clarke and Turner 1919 and English and Turner 1919 print the same glasses); 4248 is left out
# because its varied column reads as Fe2O3 up to 22 wt%, which looks like a misassigned column.
SERIES = {3740: "500-700", 3741: "500-700", 3658: "500-700", 3742: "500-700", 3743: "500-700",
          3368: "500-700", 3410: "500-700", 7158: "590-840", 3198: "421-635"}
STABILIZERS = ["CaO", "MgO", "Al2O3", "PbO", "B2O3"]
NAMES = ["F0", "w", *STABILIZERS, "B2O3^2", "floor", "590-840", "421-635"]


def series_rows(arhiv):
    """(KOD, GLASNO, loss %) for the first wlpc column (boiling water) of each Sheffield table."""
    out = []
    for kod in SERIES:
        info = arhiv.loc[arhiv.KOD == kod, "INFO"].iloc[0].replace("\r", "")
        body = info.split("#", 2)[-1].strip().split("\n")
        head = " ".join(l for l in body if not l.startswith("g "))
        cols = []
        for h in re.split(r",\s*(?![^{]*\})", head):
            if h.strip().startswith("dt "):
                braces = re.search(r"\{([^}]*)\}", h)
                n = len(re.findall(r"'[^']*'|\S+", braces.group(1))) if braces else 1
                cols += [(h.split()[1], h.split()[2], i) for i in range(n)]
        for line in (l for l in body if l.startswith("g ")):
            f = [x.strip() for x in line[2:].split(",")]
            for (group, code, i), v in zip(cols, f[2:]):
                if group == "600" and code == "wlpc" and i == 0 and re.fullmatch(r"[\d.]+", v):
                    out.append((kod, int(f[0]), float(v)))
    return pd.DataFrame(out, columns=["KOD", "GLASNO", "loss"])


def load(src):
    sel = Path(src) / "sciglass" / "select"
    arhiv = pd.read_csv(sel / "ARHIV.csv.zip", sep="\t", encoding="latin1", low_memory=False)
    gk = pd.read_csv(sel / "SciGK.csv.zip", sep="\t", low_memory=False)
    gk = gk[["KOD", "GLASNO", *OXIDES]].fillna(0).rename(columns=OXIDES)
    d = series_rows(arhiv).merge(gk, on=["KOD", "GLASNO"])
    total = d[list(OXIDES.values())].sum(axis=1)
    d = d[total >= 99].copy()
    for k in OXIDES.values():
        d[k] = 100 * d[k] / total[d.index]
    d = d.drop_duplicates(subset=[*OXIDES.values(), "loss"])
    refs = arhiv.set_index("KOD")[["AUTHOR", "YEAR"]]
    d["source"] = [f"{refs.AUTHOR[k].split(' ')[0]} {int(refs.YEAR[k])}" for k in d.KOD]
    d["grain"] = d.KOD.map(SERIES)
    return d


def free_soda(p, d):
    c = dict(zip(NAMES, p))
    f = d.Na2O + d.K2O - sum(c[k] * d[k] for k in STABILIZERS) + c["B2O3^2"] * d.B2O3 ** 2 / 100
    return np.asarray(f, dtype=float)


def log_loss(p, d, on_scale=None):
    c = dict(zip(NAMES, p))
    z = (free_soda(p, d) - c["F0"]) / c["w"]
    grain = d.grain if on_scale is None else pd.Series(on_scale, index=d.index)
    off = np.array([c.get(g, 0.0) for g in grain])
    return np.log10(10 ** c["floor"] + 100 / (1 + np.exp(np.minimum(-z, 700)))) + off


def fit(d):
    p0 = [24, 1, 1, 1, 1, 1, 0.3, 0.5, -1, 0, 0]
    return least_squares(lambda p: log_loss(p, d) - np.log10(d.loss), p0).x


def main(src):
    d = load(src)
    p = fit(d)
    r = np.log10(d.loss) - log_loss(p, d)
    print(f"{len(d)} glasses from {d.KOD.nunique()} tables")
    print(dict(zip(NAMES, np.round(p, 4))))
    print(f"log10 residual: median |r| {np.median(abs(r)):.3f}, rms {np.sqrt((r ** 2).mean()):.3f}, worst {abs(r).max():.2f}")
    # Each oxide's coefficient rests on one series, so holding out a whole series leaves it unfitted.
    # Hold out one glass at a time instead: a check on interpolation within the series, not across.
    held = np.abs([np.log10(d.loss[i]) - log_loss(fit(d.drop(i)), d.loc[[i]])[0] for i in d.index])
    print(f"held out one glass at a time: median |r| {np.median(held):.3f}, worst {held.max():.2f} decades")

    c = dict(zip(NAMES, p))
    block = {"F0": round(c["F0"], 3), "w": round(c["w"], 3), "floor": round(10 ** c["floor"], 3),
             "cancels": {k: round(c[k], 3) for k in STABILIZERS}, "B2O3^2": round(c["B2O3^2"] / 100, 5),
             "grain": {"590-840": round(c["590-840"], 3), "421-635": round(c["421-635"], 3)},
             "fit": {"glasses": len(d), "medianLog": round(float(np.median(abs(r))), 3),
                     "heldOutLog": round(float(np.median(held)), 3)}}
    print(json.dumps(block, ensure_ascii=False))
    rows = [{"source": s.source, "grain": s.grain, "loss": s.loss,
             "mol": {k: round(s[k], 2) for k in OXIDES.values() if s[k] >= 0.005}} for _, s in d.iterrows()]
    print(json.dumps(rows, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1])
