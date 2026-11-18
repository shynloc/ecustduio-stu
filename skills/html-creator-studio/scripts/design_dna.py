#!/usr/bin/env python3
"""Validate, review, revise and privately export HCS Personal Design DNA.

Standard library only. No model calls, image inference, network or hidden approval.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import pathlib
import re
import sys
from typing import Any

SCHEMA = "1.8"
DIMENSIONS = {
    "palette", "typography", "geometry", "layout", "material",
    "imagery", "motion", "tone", "avoid", "spatial_rhythm",
}
STATES = {"OBSERVED", "INFERRED", "CONFIRMED"}
ATTITUDES = {"core", "positive", "partial", "negative", "neutral"}
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")
COLORS = ("background", "surface", "foreground", "muted", "accent")
PRIVATE_LITERAL = re.compile(
    r"(?:https?://|file://|mailto:|[A-Za-z]:[/\\]|/(?:Users|home|private|workspace|mnt)/|"
    r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b1[3-9]\d{9}\b)", re.I
)


def load_json(path: str | pathlib.Path) -> dict:
    obj = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    if not isinstance(obj, dict):
        raise ValueError("JSON root must be an object")
    return obj


def save_json(path: str | pathlib.Path, obj: dict, *, sources: tuple[str | pathlib.Path, ...] = ()) -> None:
    dest = pathlib.Path(path).resolve()
    if dest.exists():
        raise ValueError(f"Refusing to overwrite existing file: {dest}")
    if any(dest == pathlib.Path(s).resolve() for s in sources):
        raise ValueError("Output must differ from input")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _hex_rgb(v: str) -> tuple[int, int, int]:
    return tuple(int(v[i : i + 2], 16) for i in (1, 3, 5))


def contrast_ratio(a: str, b: str) -> float:
    def luminance(color: str) -> float:
        channels = []
        for value in _hex_rgb(color):
            x = value / 255
            channels.append(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4)
        return sum(weight * channel for weight, channel in zip((0.2126, 0.7152, 0.0722), channels))
    aa, bb = sorted((luminance(a), luminance(b)), reverse=True)
    return (aa + 0.05) / (bb + 0.05)


def validate_profile(profile: dict, *, production: bool = False) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    portable = profile.get("portable") is True
    if profile.get("schema_version") != SCHEMA:
        errors.append(f"schema_version must be {SCHEMA}")
    pid = profile.get("profile_id")
    if not isinstance(pid, str) or not SLUG.fullmatch(pid):
        errors.append("profile_id must be a 2-63 character lowercase slug")
    if profile.get("scope") not in {"personal", "brand", "project"}:
        errors.append("scope must be personal/brand/project")
    rev = profile.get("revision")
    if not isinstance(rev, int) or isinstance(rev, bool) or rev < 1:
        errors.append("revision must be a positive integer")
    if profile.get("status") not in {"draft", "confirmed"}:
        errors.append("status must be draft/confirmed")
    sources = profile.get("source_refs")
    if not isinstance(sources, list):
        errors.append("source_refs must be an array")
        sources = []
    source_ids: set[str] = set()
    for i, ref in enumerate(sources):
        if not isinstance(ref, dict) or not isinstance(ref.get("id"), str) or not ref.get("id"):
            errors.append(f"source_refs[{i}] needs an id")
            continue
        if ref["id"] in source_ids:
            errors.append(f"duplicate source id: {ref['id']}")
        source_ids.add(ref["id"])
        if not isinstance(ref.get("private"), bool):
            errors.append(f"source_refs[{i}].private must be boolean")
    if portable and sources:
        errors.append("portable exports may not embed source_refs")
    signals = profile.get("signals")
    if not isinstance(signals, list):
        errors.append("signals must be an array")
        signals = []
    seen_signals: set[str] = set()
    confirmed_dimensions: set[str] = set()
    for i, signal in enumerate(signals):
        if not isinstance(signal, dict):
            errors.append(f"signals[{i}] must be an object")
            continue
        sid = signal.get("id")
        if not isinstance(sid, str) or not sid:
            errors.append(f"signals[{i}] requires id")
        elif sid in seen_signals:
            errors.append(f"duplicate signal id: {sid}")
        else:
            seen_signals.add(sid)
        dim = signal.get("dimension")
        if dim not in DIMENSIONS:
            errors.append(f"signals[{i}] invalid dimension: {dim}")
        if not isinstance(signal.get("value"), str) or not signal["value"].strip():
            errors.append(f"signals[{i}] requires concrete value")
        state = signal.get("state")
        if state not in STATES:
            errors.append(f"signals[{i}] invalid state: {state}")
        confidence = signal.get("confidence")
        if not isinstance(confidence, (int, float)) or isinstance(confidence, bool) or not 0 <= confidence <= 1:
            errors.append(f"signals[{i}] confidence must be 0..1")
        refs = signal.get("source_ids", [])
        if not isinstance(refs, list) or (not portable and not refs):
            errors.append(f"signals[{i}] requires source_ids from actual references")
        elif not portable and any(not isinstance(r, str) or r not in source_ids for r in refs):
            errors.append(f"signals[{i}] has unknown source id")
        if state == "CONFIRMED":
            if dim in DIMENSIONS:
                confirmed_dimensions.add(dim)
            if not portable and not str(signal.get("user_evidence", "")).strip():
                errors.append(f"signals[{i}] CONFIRMED requires user_evidence")
        elif state == "INFERRED" and confidence == 1:
            warnings.append(f"signals[{i}] inferred with absolute confidence; ask user to confirm")
    tokens = profile.get("design_tokens")
    if not isinstance(tokens, dict):
        errors.append("design_tokens must be an object")
        tokens = {}
    for key in COLORS:
        if not isinstance(tokens.get(key), str) or not HEX.fullmatch(tokens[key]):
            errors.append(f"design_tokens.{key} must be a 6-digit hex color")
    for a, b in (("foreground", "background"), ("foreground", "surface"),
                 ("muted", "background"), ("accent", "background")):
        if all(isinstance(tokens.get(key), str) and HEX.fullmatch(tokens[key]) for key in (a, b)):
            cr = contrast_ratio(tokens[a], tokens[b])
            if cr < 4.5:
                (errors if production else warnings).append(
                    f"{a}/{b} text contrast {cr:.2f}:1 below AA 4.5:1"
                )
    font = tokens.get("font_stack")
    if not isinstance(font, str) or not font.strip() or re.search(r"[;{}<>]", font):
        errors.append("font_stack must be a CSS-safe plain font list")
    radius = tokens.get("radius_px")
    if not isinstance(radius, (int, float)) or isinstance(radius, bool) or not 0 <= radius <= 40:
        errors.append("radius_px must be between 0 and 40")
    if tokens.get("motion") not in {"none", "subtle", "expressive"}:
        errors.append("motion must be none/subtle/expressive")
    if tokens.get("composition", "editorial") not in {"editorial", "split", "gallery", "timeline"}:
        errors.append("composition must be editorial/split/gallery/timeline")
    rules = profile.get("identity_rules")
    if not isinstance(rules, dict) or any(not isinstance(rules.get(k), list) or not all(isinstance(x, str) for x in rules[k]) for k in ("must_keep", "avoid")):
        errors.append("identity_rules must have string arrays must_keep and avoid")
    approval = profile.get("approval")
    if not isinstance(approval, dict):
        errors.append("approval must be an object")
        approval = {}
    approved_state = approval.get("state")
    allowed = {"pending", "confirmed"} | ({"portable_confirmed"} if portable else set())
    if approved_state not in allowed:
        errors.append(f"approval.state must be one of {sorted(allowed)}")
    if approved_state in {"confirmed", "portable_confirmed"}:
        if approval.get("revision") != rev:
            errors.append("approval revision must match profile revision")
        if approved_state == "confirmed" and not str(approval.get("user_evidence", "")).strip():
            errors.append("confirmed approval needs actual user evidence")
        if approved_state == "portable_confirmed" and not approval.get("attestation_hash"):
            errors.append("portable approval needs export attestation hash")
    if profile.get("status") == "confirmed" and approved_state not in {"confirmed", "portable_confirmed"}:
        errors.append("confirmed status requires approved revision")
    if profile.get("status") == "confirmed" and not confirmed_dimensions:
        errors.append("confirmed profile must contain at least one confirmed signal")
    if production:
        if profile.get("status") != "confirmed":
            errors.append("production use requires confirmed profile status")
        if profile.get("fictional_fixture") is True:
            errors.append("fictional fixtures must not pass production gate")
        if len(confirmed_dimensions) < 2:
            errors.append("production needs at least two distinct confirmed design dimensions")
    history = profile.get("history")
    if not isinstance(history, list) or not history:
        errors.append("history must be a nonempty array")
    return {"status": "FAIL" if errors else "PASS", "profile_id": pid, "revision": rev,
            "portable": portable, "confirmed_dimensions": sorted(confirmed_dimensions),
            "errors": errors, "warnings": warnings}


def validate_intake(intake: dict) -> dict:
    errors: list[str] = []
    blockers: list[str] = []
    if intake.get("schema_version") != SCHEMA:
        errors.append(f"schema_version must be {SCHEMA}")
    if not isinstance(intake.get("session_id"), str) or not intake["session_id"].strip():
        errors.append("session_id required")
    if intake.get("upload_state") not in {"collecting", "complete"}:
        errors.append("upload_state must be collecting/complete")
    if intake.get("analysis_request") not in {"pending", "explicit"}:
        errors.append("analysis_request must be pending/explicit")
    refs = intake.get("references")
    if not isinstance(refs, list) or not refs:
        errors.append("references must be a nonempty array")
        refs = []
    seen: set[str] = set()
    for i, ref in enumerate(refs):
        if not isinstance(ref, dict):
            errors.append(f"references[{i}] must be an object")
            continue
        rid = ref.get("id")
        if not isinstance(rid, str) or not rid or rid in seen:
            errors.append(f"references[{i}] id missing/duplicate")
        seen.add(rid)
        if ref.get("attitude") not in ATTITUDES:
            errors.append(f"references[{i}] invalid attitude")
        if ref.get("source_kind") not in {"user_text", "actual_image", "other"}:
            errors.append(f"references[{i}] invalid source_kind")
        if ref.get("vision_state") not in {"unverified", "verified", "unavailable", "not_applicable"}:
            errors.append(f"references[{i}] invalid vision_state")
        if ref.get("source_kind") == "actual_image":
            if ref.get("vision_state") != "verified" or not str(ref.get("vision_evidence", "")).strip():
                blockers.append(f"reference {rid}: image not actually viewed/verified")
        for key in ("liked_aspects", "disliked_aspects"):
            if not isinstance(ref.get(key), list) or not all(isinstance(x, str) for x in ref[key]):
                errors.append(f"references[{i}].{key} must be string array")
        for key in ("private", "analysis_permission", "external_transfer_permission"):
            if not isinstance(ref.get(key), bool):
                errors.append(f"references[{i}].{key} must be boolean")
        if ref.get("analysis_permission") is not True:
            blockers.append(f"reference {rid}: analysis permission missing")
        if ref.get("external_transfer_permission") is True and not str(ref.get("external_user_evidence", "")).strip():
            errors.append(f"reference {rid}: external transfer needs specific user evidence")
    if intake.get("upload_state") != "complete":
        blockers.append("user has not finished uploading")
    if intake.get("analysis_request") != "explicit" or not str(intake.get("analysis_user_evidence", "")).strip():
        blockers.append("user has not explicitly requested analysis")
    return {"status": "FAIL" if errors else "BLOCKED" if blockers else "READY",
            "reference_count": len(refs), "errors": errors, "blockers": blockers,
            "external_transfer": "NEVER AUTOMATIC; caller must separately confirm destination and scope"}


def confirmed_signals(profile: dict) -> list[dict]:
    return [s for s in profile.get("signals", []) if isinstance(s, dict) and s.get("state") == "CONFIRMED"]


def portable_export(profile: dict) -> dict:
    verdict = validate_profile(profile, production=True)
    if verdict["status"] != "PASS":
        raise ValueError("Cannot export unconfirmed profile: " + "; ".join(verdict["errors"]))
    abstract = []
    for s in confirmed_signals(profile):
        # Local export is not permission to share. Block obvious private literals;
        # no regex can guarantee that arbitrary prose has been fully anonymized.
        for field in ("value", "design_application"):
            if PRIVATE_LITERAL.search(str(s.get(field, ""))):
                raise ValueError(
                    f"signal {s['id']} contains a potentially private {field}; "
                    "abstract it locally and have the user review before export"
                )
        abstract.append({"id": s["id"], "dimension": s["dimension"], "value": s["value"],
                         "state": "CONFIRMED", "confidence": s["confidence"],
                         "source_ids": [], "design_application": s.get("design_application", "")})
    digest = hashlib.sha256((profile["profile_id"] + str(profile["revision"]) +
                             str(profile["approval"].get("user_evidence", ""))).encode()).hexdigest()
    return {"schema_version": SCHEMA, "portable": True,
            "profile_id": "portable-" + hashlib.sha256(profile["profile_id"].encode()).hexdigest()[:12],
            "label": "Portable Design DNA · review before sharing", "scope": profile["scope"],
            "revision": profile["revision"], "status": "confirmed", "fictional_fixture": False,
            "review_before_share": True,
            "source_refs": [], "signals": abstract, "design_tokens": copy.deepcopy(profile["design_tokens"]),
            "identity_rules": {"must_keep": [], "avoid": []},
            "approval": {"state": "portable_confirmed", "revision": profile["revision"], "attestation_hash": digest},
            "history": [{"revision": profile["revision"], "action": "portable_export", "note": "private references omitted"}]}


def revise_profile(profile: dict, feedback: dict) -> dict:
    valid = validate_profile(profile)
    if valid["status"] != "PASS":
        raise ValueError("Invalid input profile: " + "; ".join(valid["errors"]))
    if profile.get("portable"):
        raise ValueError("Portable profile is read-only; revise the full local profile")
    if feedback.get("scope") != "long_term":
        raise ValueError("Project-only feedback must not change the long-term profile")
    quote = feedback.get("user_evidence", "")
    if not isinstance(quote, str) or not quote.strip() or "【" in quote:
        raise ValueError("Long-term feedback requires actual user wording")
    confirming = feedback.get("confirm_signal_ids", [])
    rejecting = feedback.get("reject_signal_ids", [])
    additions = feedback.get("add_signals", [])
    if not isinstance(confirming, list) or not isinstance(rejecting, list) or not isinstance(additions, list):
        raise ValueError("Feedback changes must be arrays")
    ids = {s["id"] for s in profile["signals"]}
    if set(confirming) & set(rejecting):
        raise ValueError("Cannot confirm and reject the same signal")
    if not (confirming or rejecting or additions):
        raise ValueError("Feedback does not request a change")
    if any(x not in ids for x in confirming + rejecting):
        raise ValueError("Unknown signal id in feedback")
    updated = copy.deepcopy(profile)
    updated["signals"] = [s for s in updated["signals"] if s["id"] not in rejecting]
    for s in updated["signals"]:
        if s["id"] in confirming:
            s["state"] = "CONFIRMED"
            s["user_evidence"] = quote
            s["confidence"] = 1.0
    for add in additions:
        if not isinstance(add, dict) or add.get("id") in ids or add.get("state") not in {"INFERRED", "OBSERVED"}:
            raise ValueError("Added signals must have a new id and unconfirmed state")
        updated["signals"].append(copy.deepcopy(add))
        ids.add(add["id"])
    updated["revision"] += 1
    updated["status"] = "draft"
    updated["approval"] = {"state": "pending", "revision": None, "user_evidence": ""}
    updated["history"].append({"revision": updated["revision"], "action": "feedback_revision",
                               "note": feedback.get("note", ""), "user_evidence": quote,
                               "confirmed_ids": confirming, "removed_ids": rejecting,
                               "added_ids": [s["id"] for s in additions]})
    verdict = validate_profile(updated)
    if verdict["status"] != "PASS":
        raise ValueError("Revised profile invalid: " + "; ".join(verdict["errors"]))
    return updated


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    check = sub.add_parser("validate", help="validate a Design DNA profile")
    check.add_argument("--profile", required=True)
    check.add_argument("--production", action="store_true")
    intake = sub.add_parser("check-intake", help="enforce upload + vision + user analysis gates")
    intake.add_argument("--intake", required=True)
    export = sub.add_parser("export", help="make default-private portable confirmed Design DNA")
    export.add_argument("--profile", required=True)
    export.add_argument("--out", required=True)
    revise = sub.add_parser("revise", help="write a new profile revision without overwriting")
    revise.add_argument("--profile", required=True)
    revise.add_argument("--feedback", required=True)
    revise.add_argument("--out", required=True)
    args = parser.parse_args(argv)
    try:
        if args.action == "validate":
            result = validate_profile(load_json(args.profile), production=args.production)
            code = 0 if result["status"] == "PASS" else 1
        elif args.action == "check-intake":
            result = validate_intake(load_json(args.intake))
            code = {"READY": 0, "FAIL": 1, "BLOCKED": 2}[result["status"]]
        elif args.action == "export":
            save_json(args.out, portable_export(load_json(args.profile)), sources=(args.profile,))
            result = {"status": "PASS", "action": "portable_export", "output": args.out,
                      "note": "private references and user evidence excluded"}
            code = 0
        else:
            updated = revise_profile(load_json(args.profile), load_json(args.feedback))
            save_json(args.out, updated, sources=(args.profile, args.feedback))
            result = {"status": "PASS", "action": "revision", "revision": updated["revision"],
                      "approval": "pending", "output": args.out}
            code = 0
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        result = {"status": "FAIL", "error": str(exc)}
        code = 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return code


if __name__ == "__main__":
    sys.exit(main())
