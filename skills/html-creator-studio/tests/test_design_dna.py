import copy
import pathlib
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import design_dna as dna

FIX = ROOT / "examples" / "personal-dna-pilot"


class TestDesignDNA(unittest.TestCase):
    def profile(self, name="precision"):
        return dna.load_json(FIX / f"{name}-profile.json")

    def test_three_fictional_profiles_are_structurally_valid(self):
        for name in ("precision", "warm", "quiet"):
            with self.subTest(name=name):
                self.assertEqual(dna.validate_profile(self.profile(name))["status"], "PASS")

    def test_fixtures_cannot_pass_production(self):
        verdict = dna.validate_profile(self.profile(), production=True)
        self.assertEqual(verdict["status"], "FAIL")
        self.assertIn("fictional", " ".join(verdict["errors"]))

    def test_image_and_two_phase_intake_block_without_actual_vision(self):
        result = dna.validate_intake(dna.load_json(FIX / "intake-blocked.json"))
        self.assertEqual(result["status"], "BLOCKED")
        self.assertGreaterEqual(len(result["blockers"]), 3)

    def test_text_only_intake_ready_after_explicit_request(self):
        result = dna.validate_intake(dna.load_json(FIX / "intake-text-ready.json"))
        self.assertEqual(result["status"], "READY")

    def test_image_with_unverified_vision_remains_blocked_even_if_upload_done(self):
        intake = dna.load_json(FIX / "intake-blocked.json")
        intake.update(upload_state="complete", analysis_request="explicit", analysis_user_evidence="用户：开始分析")
        self.assertEqual(dna.validate_intake(intake)["status"], "BLOCKED")

    def test_external_transfer_needs_specific_evidence(self):
        intake = dna.load_json(FIX / "intake-text-ready.json")
        intake["references"][0]["external_transfer_permission"] = True
        self.assertEqual(dna.validate_intake(intake)["status"], "FAIL")

    def test_unknown_source_or_forged_confirmation_fails(self):
        bad = self.profile()
        bad["signals"][0]["source_ids"] = ["not-there"]
        self.assertEqual(dna.validate_profile(bad)["status"], "FAIL")
        bad = self.profile()
        bad["signals"][0]["user_evidence"] = ""
        self.assertEqual(dna.validate_profile(bad)["status"], "FAIL")

    def test_unapproved_draft_cannot_be_portably_exported(self):
        draft = dna.load_json(ROOT / "templates" / "DESIGN-DNA.json")
        self.assertEqual(dna.validate_profile(draft)["status"], "PASS")
        with self.assertRaisesRegex(ValueError, "unconfirmed"):
            dna.portable_export(draft)

    def test_portable_export_drops_sources_paths_and_user_quotes(self):
        profile = self.profile()
        profile["fictional_fixture"] = False  # in-memory gate exercise only
        profile["source_refs"][0]["path"] = "/private/photo/family.jpg"
        data = dna.portable_export(profile)
        serialized = str(data)
        self.assertNotIn("/private/photo", serialized)
        self.assertNotIn("虚构测试输入", serialized)
        self.assertEqual(data["source_refs"], [])
        self.assertEqual(data["identity_rules"], {"must_keep": [], "avoid": []})
        self.assertTrue(data["review_before_share"])
        self.assertTrue(all(s["state"] == "CONFIRMED" for s in data["signals"]))
        self.assertEqual(data["approval"]["state"], "portable_confirmed")
        self.assertEqual(dna.validate_profile(data, production=True)["status"], "PASS")

    def test_portable_export_blocks_obvious_private_literals(self):
        for literal in ("private@example.test", "https://secret.example/path",
                        "/Users/thom/pictures/portrait.jpg", "13800138000"):
            with self.subTest(literal=literal):
                profile = self.profile()
                profile["fictional_fixture"] = False
                profile["signals"][0]["value"] = literal
                with self.assertRaisesRegex(ValueError, "potentially private"):
                    dna.portable_export(profile)

    def test_surface_and_accent_contrast_gate(self):
        profile = self.profile()
        profile["fictional_fixture"] = False
        profile["design_tokens"]["surface"] = profile["design_tokens"]["foreground"]
        profile["design_tokens"]["accent"] = profile["design_tokens"]["background"]
        verdict = dna.validate_profile(profile, production=True)
        self.assertEqual(verdict["status"], "FAIL")
        self.assertIn("foreground/surface", " ".join(verdict["errors"]))
        self.assertIn("accent/background", " ".join(verdict["errors"]))

    def test_revise_writes_new_unapproved_revision_without_mutating_old(self):
        old = self.profile()
        original = copy.deepcopy(old)
        feedback = dna.load_json(FIX / "feedback-confirm.json")
        revised = dna.revise_profile(old, feedback)
        self.assertEqual(revised["revision"], 2)
        self.assertEqual(revised["status"], "draft")
        self.assertEqual(revised["approval"]["state"], "pending")
        self.assertEqual(old, original)
        self.assertEqual(dna.validate_profile(revised)["status"], "PASS")
        self.assertEqual(dna.validate_profile(revised, production=True)["status"], "FAIL")

    def test_project_only_feedback_never_modifies_long_term_profile(self):
        f = dna.load_json(FIX / "feedback-confirm.json")
        f["scope"] = "project_only"
        with self.assertRaisesRegex(ValueError, "Project-only"):
            dna.revise_profile(self.profile(), f)

    def test_feedback_unknown_ids_and_overlap_fail(self):
        f = dna.load_json(FIX / "feedback-confirm.json")
        f["reject_signal_ids"] = ["prec-layout"]
        with self.assertRaisesRegex(ValueError, "same signal"):
            dna.revise_profile(self.profile(), f)
        f["reject_signal_ids"] = []
        f["confirm_signal_ids"] = ["unknown"]
        with self.assertRaisesRegex(ValueError, "Unknown signal"):
            dna.revise_profile(self.profile(), f)

    def test_low_contrast_rejected_for_production(self):
        p = self.profile()
        p["fictional_fixture"] = False
        p["design_tokens"].update(background="#FFFFFF", foreground="#EEEEEE")
        self.assertEqual(dna.validate_profile(p, production=True)["status"], "FAIL")

    def test_css_font_injection_blocked(self):
        p = self.profile()
        p["design_tokens"]["font_stack"] = "Arial;body{display:none}"
        self.assertEqual(dna.validate_profile(p)["status"], "FAIL")

    def test_save_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "out.json"
            dna.save_json(path, {"a": 1})
            with self.assertRaisesRegex(ValueError, "Refusing"):
                dna.save_json(path, {"a": 2})


if __name__ == "__main__":
    unittest.main()
