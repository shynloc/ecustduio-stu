import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from check_source_coverage import check


class SourceCoverageTests(unittest.TestCase):
    def setUp(self):
        self.content = {"scenes": [{"id": "S01"}, {"id": "S02"}]}
        self.mapping = {"source_files": ["brief.md"], "personal_documents_used": False,
                        "source_mapping": {"S01": "paragraph 1", "S02": "paragraph 2"}}

    def test_complete_coverage_passes(self):
        result = check(self.content, self.mapping)
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["scenes_mapped"], 2)

    def test_missing_mapping_fails(self):
        del self.mapping["source_mapping"]["S02"]
        self.assertEqual(check(self.content, self.mapping)["status"], "FAIL")

    def test_duplicate_scene_id_fails(self):
        self.content["scenes"].append({"id": "S01"})
        self.assertEqual(check(self.content, self.mapping)["status"], "FAIL")

    def test_orphan_mapping_is_review(self):
        self.mapping["source_mapping"]["S09"] = "none"
        self.assertEqual(check(self.content, self.mapping)["status"], "REVIEW")

    def test_example_project_coverage(self):
        import json
        src = ROOT / "examples/hcs-brand-pilot/visual-master"
        result = check(json.loads((src / "content.json").read_text(encoding="utf-8")),
                       json.loads((src / "source-map.json").read_text(encoding="utf-8")))
        self.assertEqual(result["status"], "PASS")


if __name__ == "__main__":
    unittest.main()
