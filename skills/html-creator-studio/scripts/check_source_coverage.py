#!/usr/bin/env python3
"""Check Visual Master scene-to-source coverage; never claim factual verification.

The source-map contract is intentionally small, making the check usable without
third-party packages or access to a user's private source documents.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys


def check(content: dict, source_map: dict) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    if not isinstance(content, dict) or not isinstance(source_map, dict):
        return {"status": "FAIL", "errors": ["content and source-map must be JSON objects"], "warnings": []}
    scenes = content.get("scenes")
    mapping = source_map.get("source_mapping")
    if not isinstance(scenes, list) or not scenes:
        errors.append("content.scenes must be a nonempty array")
        scenes = []
    if not isinstance(mapping, dict):
        errors.append("source-map.source_mapping must be an object")
        mapping = {}

    scene_ids: list[str] = []
    for index, scene in enumerate(scenes):
        scene_id = scene.get("id") if isinstance(scene, dict) else None
        if not isinstance(scene_id, str) or not scene_id.strip():
            errors.append(f"scenes[{index}] requires a nonempty string id")
        elif scene_id in scene_ids:
            errors.append(f"duplicate scene id: {scene_id}")
        else:
            scene_ids.append(scene_id)
    for scene_id in scene_ids:
        evidence = mapping.get(scene_id)
        if not evidence:
            errors.append(f"missing source mapping for scene: {scene_id}")
        elif not isinstance(evidence, (str, list, dict)):
            errors.append(f"invalid source mapping type for scene: {scene_id}")
    for key in mapping:
        if key not in scene_ids:
            warnings.append(f"orphan source mapping: {key}")

    sources = source_map.get("source_files")
    if not isinstance(sources, list) or not all(isinstance(s, str) and s.strip() for s in sources):
        errors.append("source-map.source_files must be an array of nonempty strings")
    elif not sources:
        warnings.append("no source files recorded; visual may be conceptual only")
    if source_map.get("personal_documents_used") not in (True, False):
        warnings.append("personal_documents_used should explicitly be true or false")
    if source_map.get("personal_documents_used") is True and not source_map.get("usage"):
        warnings.append("private-document usage/disclosure scope is not documented")

    return {
        "status": "FAIL" if errors else ("REVIEW" if warnings else "PASS"),
        "errors": errors,
        "warnings": warnings,
        "scenes_checked": len(scene_ids),
        "scenes_mapped": sum(bool(mapping.get(scene_id)) for scene_id in scene_ids),
        "note": "Coverage checks metadata only. Verify quotes, figures, claims and legal use against original sources separately.",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--content", required=True, help="visual-master/content.json")
    parser.add_argument("--source-map", required=True, help="visual-master/source-map.json")
    parser.add_argument("--out", help="optional JSON report destination")
    parser.add_argument("--strict", action="store_true", help="treat review warnings as a failing check")
    args = parser.parse_args(argv)
    try:
        content = json.loads(pathlib.Path(args.content).read_text(encoding="utf-8"))
        mapping = json.loads(pathlib.Path(args.source_map).read_text(encoding="utf-8"))
        result = check(content, mapping)
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        result = {"status": "FAIL", "errors": [f"Cannot read/parse input: {exc}"], "warnings": []}
    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    if args.out:
        pathlib.Path(args.out).write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return int(result["status"] == "FAIL" or (args.strict and result["status"] == "REVIEW"))


if __name__ == "__main__":
    sys.exit(main())
