import contextlib
import io
import pathlib
import sys
import tempfile
import unittest
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import extract_resume


class TestResumeExtraction(unittest.TestCase):
    def test_markdown_keeps_original_and_line_locator(self):
        with tempfile.TemporaryDirectory() as tmp:
            resume = pathlib.Path(tmp) / "cv.md"
            resume.write_text("# 虚构姓名\n\n2024 — 摄影师\n联系：private@example.test", encoding="utf-8")
            data = extract_resume.extract(resume)
            self.assertEqual(data["line_count"], 3)
            self.assertEqual(data["evidence"][1]["source_locator"], "md:line:3")
            self.assertEqual(data["review_state"], "pending_human_fact_and_privacy_review")
            self.assertIn("private@example.test", data["evidence"][2]["text"])

    def test_docx_paragraphs_are_read_without_external_library(self):
        with tempfile.TemporaryDirectory() as tmp:
            resume = pathlib.Path(tmp) / "cv.docx"
            xml = ('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                   '<w:body><w:p><w:r><w:t>虚构</w:t></w:r><w:r><w:t>测试</w:t></w:r></w:p>'
                   '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>技术能力</w:t></w:r></w:p>'
                   '</w:tc></w:tr></w:tbl></w:body></w:document>')
            with zipfile.ZipFile(resume, "w") as zf:
                zf.writestr("word/document.xml", xml)
            data = extract_resume.extract(resume)
            self.assertEqual([x["text"] for x in data["evidence"]], ["虚构测试", "技术能力"])
            self.assertEqual(data["evidence"][1]["source_locator"], "docx:paragraph:2")

    def test_wrong_type_and_empty_input_fail(self):
        with tempfile.TemporaryDirectory() as tmp:
            unknown = pathlib.Path(tmp) / "x.exe"
            unknown.write_bytes(b"not-a-resume")
            with self.assertRaisesRegex(ValueError, "Unsupported"):
                extract_resume.extract(unknown)
            empty = pathlib.Path(tmp) / "x.txt"
            empty.touch()
            with self.assertRaisesRegex(ValueError, "empty"):
                extract_resume.extract(empty)

    def test_no_output_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            resume = pathlib.Path(tmp) / "cv.txt"
            resume.write_text("虚构履历", encoding="utf-8")
            out = pathlib.Path(tmp) / "evidence.json"
            out.write_text("already here", encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()) as stream:
                self.assertEqual(extract_resume.main(["--input", str(resume), "--out", str(out)]), 1)
            self.assertIn("Refusing to overwrite", stream.getvalue())
            self.assertEqual(out.read_text(encoding="utf-8"), "already here")


if __name__ == "__main__":
    unittest.main()
