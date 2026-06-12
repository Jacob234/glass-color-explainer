"""Unit tests for the colorant/mechanism/family/form/opacity inference.

Run from tools/catalog-sweep/:  python3 -m unittest discover -s tests
"""

import unittest

from catalog_sweep.classify import (
    OPTICS_GROUPS,
    classify_colorant,
    classify_family,
    classify_form,
    classify_opacity,
    derive_mechanism,
)


class TestColorant(unittest.TestCase):
    def _c(self, name, **kw):
        return classify_colorant(name, **kw)

    def test_cobalt_explicit_high(self):
        r = self._c("Deep Cobalt Blue Transparent")
        self.assertEqual(r.colorant, ("cobalt",))
        self.assertEqual(r.confidence, "high")
        self.assertEqual(r.source, "name-rule")

    def test_turquoise_is_copper(self):
        self.assertEqual(self._c("Caribbean Turquoise").colorant, ("copper",))

    def test_egyptian_blue_is_copper_but_bare_egyptian_is_not(self):
        # "Egyptian Blue" is a real copper pigment -> copper. But the bare "egyptian"
        # token must NOT hijack an unrelated color (e.g. Northstar's white/sand boro).
        self.assertEqual(self._c("Egyptian Blue Opalescent").colorant, ("copper",))
        r = self._c("Egyptian White Sand")
        self.assertEqual(r.colorant, ())
        self.assertEqual(r.confidence, "unknown")

    def test_gold_ruby_and_cranberry_are_gold_colloid(self):
        self.assertEqual(self._c("Gold Ruby").colorant, ("gold-colloid",))
        self.assertEqual(self._c("Cranberry Pink").colorant, ("gold-colloid",))

    def test_signal_red_is_cdse(self):
        self.assertEqual(self._c("Tomato Red Opal").colorant, ("cdse",))
        self.assertEqual(self._c("Signal Red").colorant, ("cdse",))

    def test_silver_stain_is_silver_colloid(self):
        self.assertEqual(self._c("Tracing Silver Stain").colorant, ("silver-colloid",))

    def test_dichroic_has_no_colorant(self):
        r = self._c("Cyan/Magenta Dichroic on Black")
        self.assertEqual(r.colorant, ())
        self.assertEqual(r.confidence, "high")

    def test_striking_guard_forces_unknown(self):
        # An incidental colour word must NOT override the striking guard.
        r = self._c("Triton silver glass striking rod")
        self.assertEqual(r.colorant, ())
        self.assertEqual(r.confidence, "unknown")
        self.assertIn("striking", r.note)

    def test_bare_red_is_ambiguous_low(self):
        r = self._c("Red")
        self.assertEqual(r.colorant, ())
        self.assertEqual(r.confidence, "low")
        self.assertIn("ambiguous", r.note)

    def test_clear_is_uncolored_not_unknown(self):
        r = self._c("Tekta Clear")
        self.assertEqual(r.colorant, ())
        self.assertEqual(r.confidence, "high")

    def test_no_match_is_unknown(self):
        r = self._c("Zorblax 7")
        self.assertEqual(r.colorant, ())
        self.assertEqual(r.confidence, "unknown")

    def test_supplier_hint_overrides_rules(self):
        r = self._c("Mystery Blue", hints={"mystery blue": "cobalt"})
        self.assertEqual(r.colorant, ("cobalt",))
        self.assertEqual(r.source, "supplier-stated")


class TestMechanism(unittest.TestCase):
    def test_single_colorant_maps_to_group(self):
        self.assertEqual(derive_mechanism(["cobalt"]), "ions")
        self.assertEqual(derive_mechanism(["gold-colloid"]), "colloids")
        self.assertEqual(derive_mechanism(["cdse"]), "bandgap")

    def test_mixed_groups_is_mixed(self):
        self.assertEqual(derive_mechanism(["copper", "cdse"]), "mixed")

    def test_same_group_is_that_group(self):
        self.assertEqual(derive_mechanism(["cobalt", "copper"]), "ions")

    def test_structure_follows_chromophore_not_texture(self):
        # dichroic and white-opal (no chromophore) -> structure
        self.assertEqual(derive_mechanism([], opacity="dichroic"), "structure")
        self.assertEqual(derive_mechanism([], family="white/opal"), "structure")
        self.assertEqual(derive_mechanism([], family="metallic/dichroic"), "structure")
        # generic opal with an unidentified colorant is NOT structure -> unknown
        self.assertEqual(derive_mechanism([], opacity="opal"), "unknown")
        self.assertEqual(derive_mechanism([], opacity="opal", family="yellow"), "unknown")

    def test_empty_otherwise_is_unknown(self):
        self.assertEqual(derive_mechanism([]), "unknown")
        self.assertEqual(derive_mechanism([], opacity="transparent"), "unknown")

    def test_every_optics_group_is_a_real_mechanism(self):
        for group in set(OPTICS_GROUPS.values()):
            self.assertIn(group, ("ions", "colloids", "bandgap"))


class TestFamily(unittest.TestCase):
    def test_tag_wins(self):
        self.assertEqual(classify_family("Phantom XYZ", tags=["Green", "Rod"]), "green")

    def test_name_fallback(self):
        self.assertEqual(classify_family("Deep Cobalt Blue"), "blue")
        self.assertEqual(classify_family("Tomato Red"), "red")

    def test_dichroic_family(self):
        self.assertEqual(classify_family("Rainbow Dichroic"), "metallic/dichroic")


class TestFormOpacity(unittest.TestCase):
    def test_billet_form(self):
        self.assertEqual(classify_form("Opaline Casting Tint, Billet, Fusible"), ["billet"])

    def test_default_form(self):
        self.assertEqual(classify_form("Phantom Green", defaults=["rod"]), ["rod"])

    def test_opacity_from_tag_text(self):
        self.assertEqual(classify_opacity("", "Opaque"), "opal")
        self.assertEqual(classify_opacity("Cathedral Transparent"), "transparent")
        self.assertEqual(classify_opacity("Plain Name"), "unknown")


if __name__ == "__main__":
    unittest.main()
