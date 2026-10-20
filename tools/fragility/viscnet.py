"""Run ViscNet on the fragility section's glasses and write the numbers to public/data/viscnet.json.

ViscNet (Cassar 2021, Acta Mater. 206, 116602) is a neural network in GlassPy that predicts the three
MYEGA parameters (log10 η∞, Tg, fragility m) from composition. GlassPy and its weights are
GPL-3.0-or-later; this script only runs them, and the site ships the resulting numbers, not the code
or weights. GlassPy downloads its weights from Zenodo on import, which the project's cloud sandbox
cannot reach, so the script runs in the "ViscNet" GitHub Actions workflow (or on any machine with
`pip install glasspy`):

    python3 tools/fragility/viscnet.py public/data/viscnet.json

Inputs, all read from the repo: the bench presets (src/data/batch.json), the measured melts with
MYEGA fits (public/data/sciglass/fragility.json, built by fit_sciglass.py), pure silica and B2O3,
and one-oxide sweeps from window glass. Each prediction carries a 95% band from Monte Carlo
dropout (100 samples), the model's own spread, not its error against measurements.
"""

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BATCH = json.loads((ROOT / "src/data/batch.json").read_text())
FRAG = json.loads((ROOT / "public/data/sciglass/fragility.json").read_text())
OX = FRAG["oxides"]  # the bench's nine oxides, in SciGlass extract order
M = {o["id"]: o["M"] for o in BATCH["oxides"]}
SWEEP = {"Na2O": 30, "K2O": 25, "CaO": 20, "MgO": 15, "Al2O3": 15, "B2O3": 25, "PbO": 30}
STEP = 1.0


def norm(c):
    s = sum(max(0, c.get(k, 0)) for k in OX)
    return [100 * max(0, c.get(k, 0)) / s for k in OX]


def preset_mol(p):
    if "mol" in p:
        return norm(p["mol"])
    return norm({k: v / M[k] for k, v in p["wt"].items()})


def compositions():
    named = [{"id": p["id"], "label": p["label"], "mol": preset_mol(p)} for p in BATCH["presets"]]
    named += [{"id": "silica", "label": "fused silica", "mol": norm({"SiO2": 100})},
              {"id": "b2o3", "label": "boron oxide", "mol": norm({"B2O3": 100})}]
    base = dict(zip(OX, named[0]["mol"]))  # float, the bench's base
    sweeps = []
    for ox, top in SWEEP.items():
        # Add the oxide in place of silica, as the bench's sliders do.
        for x in np.arange(0, top + 1e-9, STEP):
            c = dict(base)
            c[ox] = base.get(ox, 0) + x
            c["SiO2"] = base["SiO2"] - x
            sweeps.append({"ox": ox, "x": round(float(x), 2), "mol": norm(c)})
    melts = [{"id": g["id"], "mol": g["mol"]} for g in FRAG["glasses"]]
    return named, sweeps, melts


def predict(model, rows):
    X = np.array([r["mol"] for r in rows])
    p = model.viscosity_parameters(X, OX)
    band = model.viscosity_parameters_unc(X, OX, confidence=0.95, num_samples=100)
    out = []
    for i in range(len(rows)):
        out.append({"logEtaInf": round(float(p["log_eta_inf"][i]), 2), "Tg": round(float(p["Tg"][i]) - 273.15, 1),
                    "m": round(float(p["m"][i]), 1),
                    "mBand": [round(float(v), 1) for v in band["m"][i]],
                    "TgBand": [round(float(v) - 273.15, 1) for v in band["Tg"][i]]})
    return out


def main(out):
    import glasspy
    import torch
    from glasspy.predict import ViscNet

    torch.manual_seed(0)
    model = ViscNet()
    named, sweeps, melts = compositions()
    pn, ps, pm = predict(model, named), predict(model, sweeps), predict(model, melts)
    data = {
        "about": "ViscNet predictions of the MYEGA parameters for the fragility section: log10 η∞ (Pa·s), Tg "
                 "(°C, where η = 10^12 Pa·s) and fragility m, each with a 95% Monte Carlo dropout band "
                 "(mBand, TgBand). named are the bench presets plus silica and B2O3; sweeps add one oxide "
                 "in place of silica to window glass (x in mol%); melts match public/data/sciglass/"
                 "fragility.json by id. Compositions in mol%, in the order of `oxides`.",
        "model": {"name": "ViscNet", "glasspy": getattr(glasspy, "__version__", "unknown"),
                  "cite": "Cassar D.R., ViscNet: neural network for predicting the fragility index and the "
                          "temperature-dependency of viscosity, Acta Materialia 206 (2021) 116602, "
                          "doi:10.1016/j.actamat.2020.116602",
                  "licence": "Numbers computed with GlassPy (GPL-3.0-or-later); no GlassPy code or weights "
                             "are included. Compositions from the bench and from SciGlass (ODbL 1.0).",
                  "tool": "tools/fragility/viscnet.py"},
        "oxides": OX,
        "named": [{**{k: v for k, v in n.items() if k != "mol"}, "mol": [round(x, 2) for x in n["mol"]], **p}
                  for n, p in zip(named, pn)],
        "sweeps": {ox: [[s["x"], p["m"], p["Tg"], p["logEtaInf"], *p["mBand"]] for s, p in zip(sweeps, ps) if s["ox"] == ox]
                   for ox in SWEEP},
        "sweepColumns": ["x mol%", "m", "Tg °C", "log10 η∞", "m low", "m high"],
        "melts": {r["id"]: [p["m"], p["Tg"], p["logEtaInf"], *p["mBand"]] for r, p in zip(melts, pm)},
        "meltColumns": ["m", "Tg °C", "log10 η∞", "m low", "m high"],
    }
    Path(out).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(named)} named, {len(sweeps)} sweep points, {len(melts)} melts → {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "public/data/viscnet.json"))
