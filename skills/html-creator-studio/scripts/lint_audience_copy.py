#!/usr/bin/env python3
"""HCS v1.5 audience-facing copy lint + explicit production approval gate.

No external dependencies. This validates common draft artifacts; it is not a
substitute for a human reviewing semantics, source evidence, or the actual render.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import pathlib
import re
import sys
from html.parser import HTMLParser

# Focus on process-meta references, not legitimate journalistic attribution.
BANNED = [
    r"原\s*(?:文|文章|链接|表达)\s*(?:说|提到|指出|认为|写着|写道|是)",
    r"(?:上面|前面|此前)\s*(?:的|给出的)?\s*(?:原文|文档|附件|截图)",
    r"(?:根据|按照)\s*(?:你|您)?\s*(?:提供|上传|给出)\s*(?:的)?\s*(?:文档|附件|原文|pdf|链接)",
    r"(?:在|从)\s*(?:本次|这份|这个)?\s*(?:附件|原始文档|原\s*pdf|原文档)\s*(?:里|中|看到|可以看到|说明)",
    r"(?:这份|这个|本文|文档中|PDF中|原文里)\s*(?:文档|附件|pdf|文章)?\s*(?:里|中|的)?\s*(?:提到|指出|写着|强调|介绍了|认为|说)",
    r"(?i)the\s+(?:original|source)\s+(?:document|article|link|text)\s+(?:says|states|mentions|notes)",
    r"(?i)(?:according to|as mentioned in)\s+(?:the|your)\s+(?:original|attached|source)\s+(?:document|file|article|text|link)",
]
SCAN_KEYWORDS = {"headline", "title", "subtitle", "narration", "voiceover", "voice_over", "subtitles", "on_screen_labels", "caption", "cta", "audience_text", "body_text", "tagline", "screen_text", "text"}
IGNORE_FIELDS = {"source", "source_refs", "source_files", "source_map", "description", "intent", "design_intent", "notes", "approval", "evidence", "source_location", "usage", "privacy"}

class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []; self.ignored = 0
    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "template", "noscript"):
            self.ignored += 1
    def handle_endtag(self, tag):
        if tag in ("script", "style", "template", "noscript") and self.ignored:
            self.ignored -= 1
    def handle_data(self, data):
        if not self.ignored and data.strip():
            self.parts.append(data.strip())

def get_data(path):
    return json.loads(path.read_text(encoding="utf-8"))

def iter_audience(node, prefix=""):
    if isinstance(node, dict):
        for key, value in node.items():
            low = key.lower()
            if low in IGNORE_FIELDS or "source" in low or "internal" in low:
                continue
            p = f"{prefix}.{key}" if prefix else key
            if isinstance(value, str) and (low in SCAN_KEYWORDS or low.endswith("headline") or low.endswith("caption")):
                yield p, value
            elif isinstance(value, (dict, list)):
                yield from iter_audience(value, p)
    elif isinstance(node, list):
        for i, value in enumerate(node):
            yield from iter_audience(value, f"{prefix}[{i}]")
        # 'on_screen_labels': ["Label"] requires special handling by parent

def strings_in_nested(node):
    if isinstance(node, str):
        yield node
    elif isinstance(node, list):
        for v in node:
            yield from strings_in_nested(v)
    elif isinstance(node, dict):
        for v in node.values():
            yield from strings_in_nested(v)

def extract_audience(node, prefix=""):
    if isinstance(node, dict):
        for key, value in node.items():
            low = key.lower()
            if low in IGNORE_FIELDS or "source" in low or "internal" in low:
                continue
            p = f"{prefix}.{key}" if prefix else key
            if low in SCAN_KEYWORDS or low.startswith("audience_") or low.endswith("headline"):
                for s in strings_in_nested(value):
                    yield p, s
            elif isinstance(value, (dict, list)):
                yield from extract_audience(value, p)
    elif isinstance(node, list):
        for i, value in enumerate(node):
            yield from extract_audience(value, f"{prefix}[{i}]")

def check(source: pathlib.Path, mode: str):
    src = source / "visual-master"
    errors, warnings, checks = [], [], []
    approval_file = src / "approval.json"
    approval = get_data(approval_file) if approval_file.exists() else {}
    copy_approval = approval.get("copy_approval", {})
    expected = copy_approval.get("sha256")
    approval_status = copy_approval.get("status", "missing")
    draft_path = src / "copy-draft.md"
    approved_copy_path = src / "approved-copy.json"
    if approval_status != "approved":
        (errors if mode == "production" else warnings).append(
            f"文案未获用户明确审核通过（copy_approval.status={approval_status}）；正式成品禁止继续生成")
    else:
        checks.append("copy-approval-state")
    if draft_path.exists():
        actual = hashlib.sha256(draft_path.read_bytes()).hexdigest()
        if approval_status == "approved":
            if not expected or actual != expected:
                (errors if mode == "production" else warnings).append("文案草稿与已批准 SHA256 不一致/缺失，重新审核才能作为正式成品")
            else: checks.append("approved-hash-match")
        elif expected: warnings.append("审批状态尚未批准却存在版本哈希，请确认状态真实")
    elif mode == "production":
        errors.append("缺少 visual-master/copy-draft.md，无法审计被用户批准的完整观众稿")
    # An explicit approved-copy JSON is recommended; the approved hash can
    # instead apply to copy-draft.md while implementation is reviewed manually.
    if mode == "production" and not approved_copy_path.exists():
        warnings.append("未提供 approved-copy.json；请人工对比舞台实际文案与已批准 copy-draft.md")
    fragments = []
    for name in ("content.json", "storyboard.json", "approved-copy.json"):
        p = src / name
        if p.exists():
            try:
                for path, value in extract_audience(get_data(p)):
                    fragments.append((f"{name}:{path}", value))
            except json.JSONDecodeError as e:
                errors.append(f"无法解析 {p.name}: {e}")
    if draft_path.exists():
        fragments.extend((f"copy-draft.md:{i}", line) for i, line in enumerate(draft_path.read_text(encoding="utf8").splitlines(), 1))
    stage = source / "stage" / "stage-markup.html"
    if stage.exists():
        parser = VisibleText(); parser.feed(stage.read_text(encoding="utf8"))
        fragments.extend((f"stage:{i}", value) for i, value in enumerate(parser.parts, 1))
    allowed = copy_approval.get("meta_phrase_exceptions", [])  # explicit special-purpose critique; approval must document reason
    for location, value in fragments:
        if any(isinstance(item, dict) and item.get("phrase") in value and item.get("reason") for item in allowed):
            continue
        for pat in BANNED:
            match = re.search(pat, value, flags=re.IGNORECASE)
            if match:
                msg = f"观众文案含制作元话语 {location}: {match.group(0)!r}；改为观众可理解的成品表达"
                (errors if mode == "production" else warnings).append(msg)
                break
    if not fragments: warnings.append("未发现可审查的观众文案；仍需人工检查网页与视频画面")
    return {"status":"FAIL" if errors else "PASS", "mode":mode,"copy_approval_status":approval_status,
            "checks":checks, "scanned_fragments":len(fragments),"errors":errors,"warnings":warnings}

def main():
    p=argparse.ArgumentParser(description="Lint HCS end-audience language and copy approvals")
    p.add_argument("--source", required=True, help="Project root containing visual-master and stage")
    p.add_argument("--mode", choices=("draft","production"), default="draft")
    p.add_argument("--out", default="", help="Optional JSON report file")
    args=p.parse_args()
    result=check(pathlib.Path(args.source),args.mode)
    blob=json.dumps(result, ensure_ascii=False, indent=2)
    print(blob)
    if args.out: pathlib.Path(args.out).write_text(blob,encoding="utf8")
    return int(result["status"] == "FAIL")

if __name__ == '__main__':
    sys.exit(main())
