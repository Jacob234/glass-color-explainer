"""Extract the SciGlass melts the stage 01 oxide bench can compare against.

Reads the plain-text conversion of SciGlass (github.com/drcassar/SciGlass, the same content as
github.com/epam/SciGlass, ODbL 1.0) and writes public/data/sciglass/bench.json: every glass made
only of the bench's nine oxides (99.5 mol% or more) that has a measured viscosity point, index,
Abbe number or liquidus temperature, inside the composition range Fluegel's viscosity model was fitted to.

    git clone --depth 1 https://github.com/drcassar/SciGlass /path/to/sciglass-text
    python3 tools/sciglass/extract.py /path/to/sciglass-text public/data/sciglass/bench.json

Needs pandas. The output is a derived database under ODbL 1.0; keep its `licence` block.
"""

import json
import sys
from pathlib import Path

import re

import pandas as pd

# SciGlass column → bench oxide id. FemOn is total iron, counted as Fe2O3.
OXIDES = {"SIO2": "SiO2", "NA2O": "Na2O", "K2O": "K2O", "CAO": "CaO", "MgO": "MgO",
          "AL2O3": "Al2O3", "B2O3": "B2O3", "PBO": "PbO", "FemOn": "Fe2O3"}
# SciGlass Tn is the temperature (°C) where log10 η [dPa·s] = n, so log10 η [Pa·s] = n − 1.
VISC = [(f"T{n}", n - 1) for n in range(1, 14)] + [("LPT", 6.6), ("ANPT", 12.0), ("SPT", 13.5)]


def short(ref):
    """'Taylor N.W.' 'McNamara E.P.' 'Sherman J.' , 1937 → "Taylor and others 1937"."""
    names = re.findall(r"'([^']+)'", ref["Authors"] or "")
    surnames = [n if " " not in n or n.endswith(("Co.", "Ltd.", "Works", "Inc.")) else n.split(" ")[0] for n in names]
    who = (surnames[0] if len(surnames) == 1 else f"{surnames[0]} and {surnames[1]}" if len(surnames) == 2
           else f"{surnames[0]} and others" if surnames else "unknown")
    year = int(ref["YEAR"]) if pd.notna(ref["YEAR"]) else "n.d."
    patent = " (patent)" if "Patent" in str(ref["JOURNAL"]) else ""
    return f"{who} {year}{patent}"


def main(src, out):
    sel = Path(src) / "sciglass" / "select"
    df = pd.read_csv(sel / "SciGK.csv.zip", sep="\t", low_memory=False)
    for c in OXIDES:
        df[c] = df[c].fillna(0)
    df = df[df[list(OXIDES)].sum(axis=1) >= 99.5].rename(columns=OXIDES)
    ids = list(OXIDES.values())
    df[ids] = df[ids].div(df[ids].sum(axis=1), axis=0) * 100
    # The batch.js warning range: Fluegel's fitted silica span and his boron and alumina limits.
    df = df[(df.SiO2 >= 43) & (df.SiO2 <= 89) & (df.B2O3 <= 17) & (df.Al2O3 <= 10)]

    refs = pd.read_csv(sel / "Reference.csv.zip", sep="\t", low_memory=False).set_index("Refer_ID")
    kod2ref = pd.read_csv(sel / "Kod2Ref.csv.zip", sep="\t").drop_duplicates("Kod").set_index("Kod")["RefID"]

    glasses, cites = [], {}
    for r in df.itertuples(index=False):
        row = r._asdict()
        visc = [[L, round(float(row[k]))] for k, L in VISC if pd.notna(row.get(k)) and 300 <= row[k] <= 1800]
        nd = row.get("ND300") if pd.notna(row.get("ND300")) and 1.4 <= row["ND300"] <= 2.1 else None
        vd = row.get("NUD300") if pd.notna(row.get("NUD300")) and 15 <= row["NUD300"] <= 100 else None
        liq = row.get("TLiq") if pd.notna(row.get("TLiq")) and 500 <= row["TLiq"] <= 1800 else None
        if not visc and nd is None and vd is None and liq is None:
            continue
        kod = int(row["KOD"])
        if kod not in cites:
            ref = refs.loc[kod2ref[kod]] if kod in kod2ref.index and kod2ref[kod] in refs.index else None
            cites[kod] = ([short(ref), ref["Descr"] if isinstance(ref["Descr"], str) else ""] if ref is not None
                          else [f"{row.get('Author') or 'unknown'} {int(row['Year']) if pd.notna(row.get('Year')) else 'n.d.'}", ""])
        g = {"id": f"{kod}-{int(row['GLASNO'])}", "src": kod,
             "mol": [round(float(row[k]), 2) for k in ids]}
        if visc:
            g["visc"] = visc
        if nd is not None:
            g["nd"] = round(float(nd), 4)
        if vd is not None:
            g["vd"] = round(float(vd), 1)
        if liq is not None:
            g["liq"] = round(float(liq))
        glasses.append(g)

    used = sorted({g["src"] for g in glasses})
    data = {
        "about": "Measured melts from SciGlass made only of the stage 01 bench's oxides, inside the "
                 "range Fluegel's viscosity model was fitted to. mol lists mol% in the order of "
                 "`oxides`; visc lists [log10 viscosity in Pa·s, temperature °C]; liq is the liquidus temperature, °C; src keys `sources`, each [short citation, full citation].",
        "licence": {
            "name": "ODbL 1.0",
            "url": "https://opendatacommons.org/licenses/odbl/1-0/",
            "notice": "Contains information from SciGlass (EPAM Systems, 2019), made available under "
                      "the Open Database License (ODbL) 1.0. This extract is itself offered under ODbL 1.0.",
            "from": ["https://github.com/epam/SciGlass", "https://github.com/drcassar/SciGlass"],
            "tool": "tools/sciglass/extract.py",
        },
        "oxides": ids,
        "sources": {str(k): cites[k] for k in used},
        "glasses": glasses,
    }
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(glasses)} glasses from {len(used)} sources → {out}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
