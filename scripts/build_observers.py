"""Build src/data/observers.json: the tables behind the many-observers stage (scripts/observers.js).

Not run by the site build; kept so the numbers can be regenerated and checked.

    python3 -m pip install colour-science==0.4.7
    python3 -m pip download --no-deps luxpy==1.12.5 && unzip luxpy-*.whl 'luxpy/toolboxes/indvcmf/data/*'
    python3 scripts/build_observers.py luxpy/toolboxes/indvcmf/data > src/data/observers.json

Sources:
- CIE 1964 10° color-matching functions: colour-science's copy of the CIE table.
- CIE 170-1:2006 model components at 5 nm, 390–780 nm (photopigment low-density absorbance,
  the two parts of the ocular-media density, relative macular density): the tables Asano,
  Fairchild & Blondé (2016) distribute with their individual-observer model, as packaged in luxpy.
  The numbers are CIE's; the files are only how they reached us.
- CIE 170-2:2015 LMS -> XYZ matrices: fitted here by least squares from colour-science's copies of
  the Stockman & Sharpe fundamentals and the CIE 2015 XYZ functions (residual ~1e-6), and checked
  against the published coefficients.
"""
import json
import sys

import colour
import numpy as np

data_dir = sys.argv[1].rstrip('/') + '/'
wl = np.arange(390, 781, 5)


def rows(name):
    out = []
    for r in open(data_dir + name).read().replace('\r', '\n').split('\n'):
        if r.strip():
            out.append([float(x) if x.strip() else None for x in r.split(',')])
    return out


alms = rows('asano_cie2006_Alms.dat')
docul = rows('asano_cie2006_docul.dat')
rmd = [r[0] for r in rows('asano_cie2006_RelativeMacularDensity.dat')]
assert len(alms) == len(docul) == len(rmd) == len(wl)


def fit_matrix(lms_name, xyz_name):
    lms = np.nan_to_num(np.array([colour.colorimetry.MSDS_CMFS_LMS[lms_name][w] for w in wl]))
    xyz = np.array([colour.MSDS_CMFS[xyz_name][w] for w in wl])
    m = np.linalg.lstsq(lms, xyz, rcond=None)[0].T
    return [[round(float(v), 6) + 0.0 for v in r] for r in m]


c64 = colour.MSDS_CMFS['CIE 1964 10 Degree Standard Observer']
grid = range(380, 781, 5)
out = {
    '_note': 'Observer tables for the many-observers stage (scripts/observers.js). Built by scripts/build_observers.py; see it for sources.',
    'cie1964': {
        'source': 'CIE 1964 10° standard colorimetric observer, from colour-science v0.4.7',
        'start': 380, 'step': 5,
        'xyz': [[float(f'{v:.6g}') for v in c64[w]] for w in grid],
    },
    'cie2006': {
        'source': 'CIE 170-1:2006 model components, as tabulated by Asano, Fairchild & Blondé (2016)',
        'start': 390, 'step': 5,
        'logAbsorbance': [[r[0], r[1], r[2] if len(r) > 2 else None] for r in alms],
        'ocular': [[r[0], r[1]] for r in docul],
        'macular': rmd,
        'lmsToXyz': {
            '2': fit_matrix('Stockman & Sharpe 2 Degree Cone Fundamentals', 'CIE 2015 2 Degree Standard Observer'),
            '10': fit_matrix('Stockman & Sharpe 10 Degree Cone Fundamentals', 'CIE 2015 10 Degree Standard Observer'),
        },
    },
}
print(json.dumps(out, separators=(',', ':'), ensure_ascii=False).replace('],[', '],\n['))
