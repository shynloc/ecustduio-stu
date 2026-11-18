import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class TestSkillV18Integrity(unittest.TestCase):
    def test_personal_dna_files_and_routes_exist(self):
        files = (
            "references/DESIGN-DNA.md", "references/TASTE-INTAKE.md",
            "references/PROJECT-ART-DIRECTION.md", "references/RESUME-SITE.md",
            "scripts/design_dna.py", "scripts/project_art_direction.py",
            "scripts/build_resume_site.py", "templates/DESIGN-DNA.json",
            "templates/TASTE-INTAKE.json", "templates/DNA-FEEDBACK.json",
            "templates/PROJECT-BRIEF.json", "templates/RESUME-CONTENT.json",
        )
        for file in files:
            with self.subTest(file=file):
                self.assertTrue((ROOT / file).is_file())

    def test_skill_does_not_misrepresent_multimodal_capabilities(self):
        skill = (ROOT / "SKILL.md").read_text(encoding="utf8")
        for term in ("v1.8", "Personal Design DNA", "OBSERVED", "INFERRED", "CONFIRMED",
                     "G0T TASTE", "G1D DNA", "RESUME-SITE.md", "未实际看图"):
            self.assertIn(term, skill)


if __name__ == "__main__":
    unittest.main()
