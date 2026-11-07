# License

This repository holds three kinds of material, and they are licensed separately.

## 1. The site's own content: CC BY 4.0

The written content of How Glass Works (page text, concept essays, captions, recall
questions, "How this was computed" notes) and the diagrams drawn for the site are licensed
under the [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/).
The full legal text is in [`LICENSE-CONTENT.txt`](LICENSE-CONTENT.txt).

You may copy, adapt and redistribute this content for any purpose, including
commercially, if you give credit, link the license and say whether you changed it.
Suggested credit:

> From *How Glass Works*, https://howglassworks.fyi/, licensed CC BY 4.0
> (https://creativecommons.org/licenses/by/4.0/).

## 2. Source code: not yet licensed

A license for the code (Astro components, scripts, tools and tests) has not been chosen.
Until it is, the code is all rights reserved: you may read it here, but it carries no
license to reuse it.

## 3. Third-party data and quoted material: their own terms

Data and text that come from others keep their own licenses. The CC BY 4.0 grant above
does not cover them. Each source and its terms are listed in `src/data/library.json`
(shown at https://howglassworks.fyi/library/). The main ones:

| Material | Where in the repo | Terms |
|---|---|---|
| CIE illuminant tables and standard observers | `src/data/lamps.json`, `src/data/observers.json` | CC BY-SA 4.0 (CIE); the other observer tables follow the sources named in `scripts/build_observers.py` |
| SciGlass extract | `public/data/sciglass/` | ODbL 1.0; the extract carries its own notice |
| Refractive indices and metal optical constants | `src/data/glasses.json`, `src/data/metals.json` | CC0 1.0 (refractiveindex.info) |
| Measured colorant spectra | `src/data/measured.json` | Mixed: curves traced from Meulebroeck et al. 2016 are CC BY 4.0; band fits to other articles are quoted with citation |
| Model outputs from GlassPy (ViscNet, GlassNet) | `public/data/viscnet.json`, `public/data/glassnet.json` | Computed with GPL-3.0 software and weights; whether the outputs carry GPL terms is unresolved. Their `melts` entries are predictions keyed by SciGlass record id, and the models were trained on SciGlass, so ODbL 1.0 may also apply |
| Coefficients, constants and values from journal articles | throughout `src/data/` | Quoted as facts with citation; the articles are not licensed for reuse |
| Supplier color names and sampled swatches | `src/data/catalog/` | No license stated by the suppliers; names, links and sampled colors only |
