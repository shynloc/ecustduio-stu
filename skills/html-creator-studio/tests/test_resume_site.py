import copy
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import design_dna as dna
import project_art_direction as art
import build_resume_site as resume_site

FIX = ROOT / "examples" / "personal-dna-pilot"


class TestResumeSite(unittest.TestCase):
    def parts(self, name="precision"):
        p = dna.load_json(FIX / f"{name}-profile.json")
        b = dna.load_json(FIX / "brief-resume.json")
        return p, dna.load_json(FIX / "fictional-resume.json"), art.build_contract(p, b)

    def test_three_profile_compositions_change_more_than_colors(self):
        outputs = []
        for name in ("precision", "warm", "quiet"):
            p, r, d = self.parts(name)
            page = resume_site.render(p, r, d)
            self.assertIn("DRAFT / PRIVATE PREVIEW", page)
            self.assertIn("prefers-reduced-motion:reduce", page)
            self.assertIn("max-width:780px", page)
            self.assertIn("林舟", page)
            outputs.append((p["design_tokens"]["composition"], page))
        self.assertEqual(len({x[0] for x in outputs}), 3)
        self.assertEqual(len({x[1] for x in outputs}), 3)
        self.assertIn("composition-split", outputs[0][1])
        self.assertIn("composition-gallery", outputs[1][1])
        self.assertIn("composition-timeline", outputs[2][1])

    def test_private_contact_never_leaks_to_draft(self):
        p, r, d = self.parts()
        page = resume_site.render(p, r, d)
        self.assertNotIn("private@example.test", page)
        self.assertNotIn("https://example.test", page)
        self.assertIn('name="robots" content="noindex,nofollow,noarchive"', page)

    def test_unsafe_url_rejected(self):
        p, r, d = self.parts()
        r["projects"][0]["url"] = "javascript:alert(1)"
        with self.assertRaisesRegex(ValueError, "unsafe URL"):
            resume_site.render(p, r, d)

    def test_input_text_is_html_escaped(self):
        p, r, d = self.parts()
        r["intro"] = '<script>alert("XSS")</script>'
        page = resume_site.render(p, r, d)
        self.assertIn("&lt;script&gt;", page)
        self.assertNotIn('<script>alert(', page)

    def test_release_blocked_without_actual_copy_and_publication_approval(self):
        p, r, d = self.parts()
        with self.assertRaisesRegex(ValueError, "fictional fixture"):
            resume_site.render(p, r, d, production=True)
        p["fictional_fixture"] = False  # test guard progression, never publish fixture
        with self.assertRaisesRegex(ValueError, "Fictional fixture"):
            resume_site.render(p, r, d, production=True)
        r["fictional_fixture"] = False
        with self.assertRaisesRegex(ValueError, "copy_approval"):
            resume_site.render(p, r, d, production=True)

    def test_direction_revision_mismatch_blocks(self):
        p, r, d = self.parts()
        d["profile_revision"] = 999
        with self.assertRaisesRegex(ValueError, "stale"):
            resume_site.render(p, r, d)

    def test_private_contacts_stay_hidden_even_in_production(self):
        p, r, d = self.parts()
        p["fictional_fixture"] = False
        r["fictional_fixture"] = False
        r["copy_approval"] = {"state": "approved", "user_evidence": "TEST USER APPROVED COPY"}
        r["publication_approval"] = {"state": "approved", "user_evidence": "TEST USER APPROVED PUBLICATION"}
        d["user_approvals"] = {"visual": "approved", "visual_user_evidence": "TEST USER APPROVED VISUAL"}
        page = resume_site.render(p, r, d, production=True)
        self.assertNotIn("private@example.test", page)
        self.assertNotIn("DRAFT / PRIVATE", page)


if __name__ == "__main__":
    unittest.main()
