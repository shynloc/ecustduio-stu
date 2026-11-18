import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import design_dna as dna
import project_art_direction as art

FIX = ROOT / "examples" / "personal-dna-pilot"


class TestProjectArtDirection(unittest.TestCase):
    def test_studio_and_quick_count(self):
        p = dna.load_json(FIX / "precision-profile.json")
        s = art.build_contract(p, dna.load_json(FIX / "brief-resume.json"))
        q = art.build_contract(p, dna.load_json(FIX / "brief-photography.json"))
        self.assertEqual(len(s["candidate_briefs"]), 3)
        self.assertEqual(len(q["candidate_briefs"]), 2)

    def test_same_dna_different_content_produces_distinct_temporary_direction(self):
        p = dna.load_json(FIX / "precision-profile.json")
        briefs = [dna.load_json(FIX / f"brief-{name}.json") for name in ("resume", "photography", "automotive")]
        directions = [art.build_contract(p, b)["temporary_direction"] for b in briefs]
        self.assertEqual(len({d["visual_subject"] for d in directions}), 3)
        self.assertEqual(len({d["recommended_interaction"] for d in directions}), 3)

    def test_same_resume_three_tastes_have_different_signal_evidence(self):
        b = dna.load_json(FIX / "brief-resume.json")
        plans = [art.build_contract(dna.load_json(FIX / f"{name}-profile.json"), b)
                 for name in ("precision", "warm", "quiet")]
        self.assertEqual(len({tuple(x["confirmed_signal_ids"]) for x in plans}), 3)
        self.assertEqual(len({tuple(x["anti_style"]) for x in plans}), 3)

    def test_private_sources_not_leaked_into_project_contract(self):
        p = dna.load_json(FIX / "precision-profile.json")
        p["source_refs"][0]["path"] = "/very-private/photo.jpg"
        contract = art.build_contract(p, dna.load_json(FIX / "brief-resume.json"))
        self.assertNotIn("very-private", str(contract))
        self.assertNotIn("user_evidence", str(contract))
        self.assertEqual(contract["user_approvals"]["deployment"], "pending")

    def test_inferred_signals_are_never_promoted_to_kernel(self):
        p = dna.load_json(ROOT / "templates" / "DESIGN-DNA.json")
        c = art.build_contract(p, dna.load_json(FIX / "brief-resume.json"))
        self.assertEqual(c["confirmed_signal_ids"], [])
        self.assertEqual(c["profile_state"], "draft_do_not_assume_personal_taste")

    def test_invalid_brief_rejected(self):
        p = dna.load_json(FIX / "precision-profile.json")
        b = dna.load_json(FIX / "brief-resume.json")
        b["mode"] = "special"
        with self.assertRaises(ValueError):
            art.build_contract(p, b)


if __name__ == "__main__":
    unittest.main()
