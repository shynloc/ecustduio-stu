import pathlib
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from beta_doctor import check_package


class BetaDoctorTests(unittest.TestCase):
    def test_current_package_has_core_contract(self):
        result = check_package(ROOT)
        self.assertEqual(result["status"], "PASS", result["errors"])

    def test_empty_directory_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            result = check_package(pathlib.Path(td))
            self.assertEqual(result["status"], "FAIL")
            self.assertTrue(result["errors"])

    def test_optional_tools_are_detected_but_not_claimed_verified(self):
        result = check_package(ROOT)
        self.assertIn("NOT_RUN", result["external_engines"])
        self.assertIn("ffmpeg", result["optional_dependencies"])


if __name__ == "__main__":
    unittest.main()
