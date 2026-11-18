import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_dna_standalone_preview


class TestStandalonePreview(unittest.TestCase):
    def test_embeds_all_fictional_pages_without_external_fetch(self):
        hub = ROOT / "examples/personal-dna-pilot/rendered/index.html"
        result = build_dna_standalone_preview.build(hub)
        self.assertIn("frame.srcdoc=pages[id]", result)
        self.assertIn("frame.srcdoc=pages.precision", result)
        self.assertIn('src="about:blank"', result)
        self.assertIn("URL.createObjectURL(new Blob", result)
        self.assertNotIn('src="precision-resume.html"', result)
        self.assertIn('download="precision-resume.html"', result)
        self.assertIn("DRAFT / PRIVATE PREVIEW", result)
        self.assertIn("\\u003c!doctype html", result)

    def test_committed_standalone_preview_matches_generator(self):
        hub = ROOT / "examples/personal-dna-pilot/rendered/index.html"
        expected = ROOT / "examples/personal-dna-pilot/rendered/standalone-preview.html"
        self.assertTrue(expected.is_file())
        self.assertEqual(expected.read_text(encoding="utf-8"), build_dna_standalone_preview.build(hub))


if __name__ == "__main__":
    unittest.main()
