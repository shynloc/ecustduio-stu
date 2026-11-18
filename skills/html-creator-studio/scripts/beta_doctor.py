#!/usr/bin/env python3
"""HCS public beta package integrity and local capability preflight (stdlib)."""
from __future__ import annotations

import argparse
import importlib.util
import json
import pathlib
import re
import shutil
import subprocess
import sys


EXPECTED_VERSION = "v1.8"
REQUIRED = (
    "SKILL.md", "START-HERE.md", "README.md", "RELEASE-NOTES.md",
    "references/CORE-WORKFLOW-v1.5.md", "references/INSTALL-AND-TEST.md",
    "references/PROVENANCE-QA.md", "references/ACCESSIBILITY-QUALITY.md",
    "references/AUDIENCE-COPY.md", "references/VISUAL-PITCH.md",
    "references/ASSET-DIRECTION.md", "references/VISUAL-QA.md",
    "references/REMOTION-ADAPTER.md", "references/HYPERFRAMES-ADAPTER.md",
    "scripts/build_visual_pitch.py", "scripts/visual_qa.py",
    "scripts/validate_asset_plan.py", "scripts/check_source_coverage.py",
    "scripts/lint_audience_copy.py", "tests/test_copy_lint.py",
    "templates/VISUAL-PITCH-BRIEF.json", "shared/frame-styles.mjs",
    "references/TASTE-INTAKE.md", "references/DESIGN-DNA.md",
    "references/PROJECT-ART-DIRECTION.md", "references/RESUME-SITE.md",
    "scripts/design_dna.py", "scripts/project_art_direction.py",
    "scripts/build_resume_site.py", "scripts/extract_resume.py",
    "scripts/build_dna_standalone_preview.py", "templates/DESIGN-DNA.json",
    "templates/TASTE-INTAKE.json", "templates/RESUME-CONTENT.json",
    "examples/personal-dna-pilot/fictional-resume.json",
    "examples/personal-dna-pilot/rendered/standalone-preview.html",
)


def check_package(root: pathlib.Path) -> dict:
    errors: list[str] = []
    root = root.resolve()
    missing = [name for name in REQUIRED if not (root / name).is_file()]
    if missing:
        errors.append("missing required files: " + ", ".join(missing))
    entry = root / "SKILL.md"
    if entry.is_file():
        data = entry.read_text(encoding="utf-8")
        match = re.match(r"\A---\r?\n(.*?)\r?\n---\r?\n", data, flags=re.S)
        if not match or not re.search(r"(?m)^name:\s*html-creator-studio\s*$", match.group(1)):
            errors.append("SKILL.md must have name: html-creator-studio in YAML frontmatter")
        if not match or not re.search(r"(?m)^description:\s*\S", match.group(1)):
            errors.append("SKILL.md must provide a nonempty trigger description")
        if EXPECTED_VERSION not in data:
            errors.append(f"SKILL.md does not identify {EXPECTED_VERSION}")
    optional = {
        "python_playwright": importlib.util.find_spec("playwright") is not None,
        "chromium": bool(shutil.which("chromium") or shutil.which("google-chrome") or shutil.which("chrome")),
        "node": bool(shutil.which("node")),
        "npm": bool(shutil.which("npm")),
        "ffmpeg": bool(shutil.which("ffmpeg")),
        "pdftotext": bool(shutil.which("pdftotext")),
    }
    missing_optional = [name for name, found in optional.items() if not found]
    return {
        "status": "FAIL" if errors else "PASS",
        "package_version": EXPECTED_VERSION,
        "checked_files": len(REQUIRED),
        "errors": errors,
        "optional_dependencies": optional,
        "warnings": ["Optional environment tool not found: " + name for name in missing_optional],
        "external_engines": "NOT_RUN (detecting npm/node is not a Remotion or Hyperframes render test)",
        "browser_qa": "NOT_RUN (run visual_qa.py and inspect screenshots for each real project)",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=str(pathlib.Path(__file__).resolve().parents[1]))
    parser.add_argument("--run-tests", action="store_true", help="run package Python unit tests")
    parser.add_argument("--out", help="write report JSON to this path")
    args = parser.parse_args(argv)
    root = pathlib.Path(args.root)
    result = check_package(root)
    if args.run_tests and result["status"] != "FAIL":
        try:
            proc = subprocess.run(
                [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v"],
                cwd=str(root), text=True, capture_output=True, timeout=120, check=False,
            )
            result["unit_tests"] = {
                "status": "PASS" if proc.returncode == 0 else "FAIL",
                "exit_code": proc.returncode,
                "output_tail": (proc.stdout + proc.stderr)[-5000:],
            }
            if proc.returncode:
                result["status"] = "FAIL"
        except (OSError, subprocess.TimeoutExpired) as exc:
            result["unit_tests"] = {"status": "FAIL", "reason": str(exc)}
            result["status"] = "FAIL"
    rendered = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    if args.out:
        pathlib.Path(args.out).write_text(rendered, encoding="utf-8")
    print(rendered)
    return int(result["status"] == "FAIL")


if __name__ == "__main__":
    sys.exit(main())
