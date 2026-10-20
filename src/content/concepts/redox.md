---
title: redox in the furnace
mechanism: crosscutting
summary: The furnace atmosphere sets the oxidation state of each element, and therefore the color. Iron alone can give blue-green, pale yellow-green, or (with sulfur) amber, and "decolorizing" cheap glass is the oldest application of glass redox chemistry.
sources:
  - label: "Shelby, Color in commercial glasses, IMI-NFG Glass Processing Course lecture 4 (Alfred University, 2015)"
    url: https://www.lehigh.edu/imi/teched/GlassProcess/Lectures/Lecture04_Shelby_ColoredGlass.pdf
  - label: "Volotinen, Mathematical description of absorbance spectra for Fe and Cu doped soda-lime-silica glasses, PhD thesis, University of Sheffield (2007)"
    url: https://etheses.whiterose.ac.uk/id/eprint/6086/
---

Redox, the balance between oxidized and reduced forms of multivalent elements in the melt, is the cross-cutting control variable of glass color. The same batch of raw materials can emerge from the furnace blue-green, yellow-green, amber, or colorless depending on how oxidizing or reducing the melt was. A color recipe therefore has to specify redox conditions as well as composition.

The discipline is ancient. Pliny the Elder described decolorizing glass in the first century CE, and manganese's role as "glassmaker's soap" was an empirical fact long before anyone understood why it worked. The explanation, in terms of quantitative electrochemistry, came much later.

## Iron is the protagonist

Every commercial sand batch carries iron impurities, and iron is the most consequential redox-active element in glass. Its two oxidation states differ in both hue and strength:

**Fe²⁺** (ferrous iron) absorbs strongly in the near-infrared and has a visible blue-green component, the color you see looking at a pane of float glass edge-on.

**Fe³⁺** (ferric iron) absorbs mostly in the ultraviolet. Its strongest band sits just outside the visible near 385 nm, with weaker ones at about 420 and 435 nm; the tail of the first and the two weak bands take out blue-violet, which leaves a pale yellow-green (Shelby). The measured bands this site uses (Volotinen) also carry two fainter bands in the green and red, so a thick wall of oxidized iron glass looks bottle green edge on. A glass with the same iron concentration but all Fe³⁺ instead of Fe²⁺ looks nearly colorless by comparison. It is not amber: the amber of beer bottles needs sulfur, below.

The ferri-sulfide amber of beer bottles is a special case: in a strongly reduced, sulfur-bearing melt, an Fe³⁺–S²⁻ charge-transfer interaction creates an intense brown-amber chromophore. This color exists only in a narrow redox window: slightly too oxidizing and the sulfur is lost, removing the amber; slightly too reducing and metallic sulfides precipitate, turning the glass black. See [transition metal colorants](../transition-metal-colorants/) for the other iron stories.

## Decolorizing

The oldest practical application of glass redox chemistry is making cheap, iron-bearing glass read as colorless. Two approaches:

**Chemical decolorizing** relies on manganese ("glassmaker's soap"), used since Roman times. Added as manganese oxide, it oxidizes the strong-tinting Fe²⁺ to weak-tinting Fe³⁺, and the residual (unreacted) Mn³⁺ carries a faint purple that is roughly complementary to the residual yellow-green of Fe³⁺; the two tints partially cancel to produce a near-neutral glass.

**Physical decolorizing** adds small amounts of absorbers whose colors are complementary to iron's green. Selenium (pink) plus a trace of cobalt (blue) can neutralize iron's green tint. The resulting glass transmits *less* light overall but transmits it neutrally, so it is colorless but slightly gray. Selenium, which produces reds in [selenium ruby](../selenium-ruby/) glass, is here a decolorizer; which role it plays depends on concentration and redox state.

## Solarization

Manganese-decolorized glass changes slowly over time: decades of exposure to UV from sunlight slowly re-oxidize the Mn²⁺ (colorless, from the decolorizing reaction) back toward Mn³⁺ (purple). The result is the lavender "desert glass" color seen in antique bottles that have sat in sunlight for decades, through a slow photochemical redox shift. Given enough time and UV, the manganese added to remove color ends up adding it.

## Redox as a gateway to other mechanisms

Beyond setting the color within the [transition metal colorant](../transition-metal-colorants/) family, redox decides which mechanism operates at all.

Copper is the clearest case. As Cu²⁺, it is a turquoise dissolved-ion colorant. Partially reduced to Cu⁺, it is colorless and inert. Fully reduced to metallic copper, it forms nanoparticles and becomes a ruby colloid by the plasmon resonance mechanism described in [colloidal color](../colloidal-color/). Which of the three results depends on the furnace atmosphere.

[Silver stain](../silver-stain/) depends on the glass's reducing capacity for its color-development step: the silver ions exchanged into the glass surface must be reduced to metallic silver before nanoparticles can grow. A glass with few Fe²⁺ or Sn²⁺ reducing agents in the surface layer fires poorly.

Chromium flips between green Cr³⁺ and yellow Cr⁶⁺ depending on the oxidizing power of the melt. Glassmakers targeting chromium greens work in slightly reducing conditions; highly oxidizing melts produce yellows.

The glassmaker's redox calculation therefore has to account for every multivalent element in the batch and how they interact, not only the intended colorant. It is a slow, high-temperature electrochemistry problem, solved for most of history empirically, from experience of what goes in the pot and what comes out.
