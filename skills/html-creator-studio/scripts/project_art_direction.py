#!/usr/bin/env python3
"""Compile a project art-direction contract from confirmed taste and content goals.

No AI inference or HTML aesthetic quality is claimed by this deterministic tool.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

from design_dna import confirmed_signals, load_json, save_json, validate_profile

CONTENT_GUIDANCE = {
    "resume": {
        "visual_subject": "可验证的职业经历、项目成果与个人表达",
        "information_rhythm": "清楚的简介、时间线、精选项目、联系方式；弱化无来源的数字",
        "interaction": "章节导航、作品链接、键盘可用的联系入口",
    },
    "photography": {
        "visual_subject": "经授权的摄影作品与画面叙事",
        "information_rhythm": "大幅作品、克制文字、分系列浏览、明确版权与拍摄说明",
        "interaction": "灯箱、前后切换、低动效替代、原图加载降级",
    },
    "automotive": {
        "visual_subject": "真实车辆、部件细节、施工过程和验证结果",
        "information_rhythm": "案例封面、关键改装、施工对比、可靠的数据/出处",
        "interaction": "前后对比、细节标注、按工序导航",
    },
    "business": {
        "visual_subject": "产品、服务、可信案例和行动入口",
        "information_rhythm": "价值主张、真实能力、案例、联系方式；事实性声明可追溯",
        "interaction": "信息分层、服务详情、清晰 CTA",
    },
    "report": {
        "visual_subject": "可核实事实、关系、图表和关键判断",
        "information_rhythm": "执行摘要、章节导航、证据、图表、附录",
        "interaction": "筛选、图表注释、来源跳转；无 JS 降级",
    },
    "other": {
        "visual_subject": "本次材料的真实主题与独特语义",
        "information_rhythm": "根据章节密度、叙事目标与受众重新设计信息结构",
        "interaction": "仅选择有内容理由的交互，不滥用特效",
    },
}

TRACKS = [
    {"id": "structure", "name": "信息建筑", "focus": "章节节奏与强辨识度构图",
     "prompt": "从资料内容重新设计独特栅格、阅读路径和首屏/高密度内页，不沿用参考生成器现成布局。"},
    {"id": "material", "name": "材质与情绪", "focus": "真实素材、光影与视觉主体",
     "prompt": "从用户确认的材料/图像偏好创造有语义的主视觉，不能直接复制来源图片的独有设计。"},
    {"id": "narrative", "name": "视觉叙事", "focus": "字体、节奏与克制交互",
     "prompt": "让文字比例、动效和章节转换承担叙事任务，避免所有页面套同一种皮肤。"},
]


def validate_brief(brief: dict) -> None:
    for key in ("project_id", "title", "purpose", "audience", "privacy_boundary"):
        if not isinstance(brief.get(key), str) or not brief[key].strip():
            raise ValueError(f"Project brief requires nonempty {key}")
    if brief.get("content_type") not in CONTENT_GUIDANCE:
        raise ValueError("Unknown content_type")
    if brief.get("output") not in {"web", "video_ready", "dual"}:
        raise ValueError("output must be web/video_ready/dual")
    if brief.get("mode") not in {"quick", "studio"}:
        raise ValueError("mode must be quick/studio")
    for key in ("devices", "semantic_priorities", "project_specific_avoid"):
        val = brief.get(key)
        if not isinstance(val, list) or not all(isinstance(v, str) for v in val):
            raise ValueError(f"{key} must be a string array")
    if not brief["semantic_priorities"]:
        raise ValueError("semantic_priorities must not be empty")


def build_contract(profile: dict, brief: dict) -> dict:
    result = validate_profile(profile)
    if result["status"] != "PASS":
        raise ValueError("Invalid DNA profile: " + "; ".join(result["errors"]))
    validate_brief(brief)
    confirmed = confirmed_signals(profile)
    identity = [{"signal_id": s["id"], "dimension": s["dimension"],
                 "rule": s.get("design_application") or s["value"],
                 "preference": s["value"]} for s in confirmed]
    stable = profile.get("status") == "confirmed" and bool(confirmed)
    guidance = CONTENT_GUIDANCE[brief["content_type"]]
    tracks = TRACKS[:2 if brief["mode"] == "quick" else 3]
    temporary = {
        "content_type": brief["content_type"],
        "visual_subject": guidance["visual_subject"],
        "information_rhythm": guidance["information_rhythm"],
        "recommended_interaction": guidance["interaction"],
        "project_mood": brief.get("temporary_mood", ""),
        "semantic_priorities": brief["semantic_priorities"],
    }
    return {
        "schema_version": "1.8", "project_id": brief["project_id"],
        "title": brief["title"], "content_type": brief["content_type"],
        "purpose": brief["purpose"], "audience": brief["audience"],
        "mode": brief["mode"], "output": brief["output"],
        "devices": brief["devices"], "privacy_boundary": brief["privacy_boundary"],
        "profile_id": profile["profile_id"], "profile_revision": profile["revision"],
        "profile_state": "confirmed" if stable else "draft_do_not_assume_personal_taste",
        "confirmed_signal_ids": [s["id"] for s in confirmed],
        "identity_constraints": identity,
        "anti_style": profile["identity_rules"]["avoid"] + brief["project_specific_avoid"],
        "temporary_direction": temporary,
        "candidate_briefs": [{"id": chr(65 + i), "track": track["id"],
                              "name": track["name"], "focus": track["focus"],
                              "creative_instruction": track["prompt"],
                              "must_produce": "可实际打开的本项目 HTML 首屏与内容密集内页",
                              "user_selection": "pending"}
                             for i, track in enumerate(tracks)],
        "candidate_difference_rule": "至少在构图/字体/主视觉/运动四个维度中有三个实际不同；换色不合格",
        "user_approvals": {"visual": "pending", "audience_copy": "pending", "deployment": "pending"},
        "tool_capability_note": "This is a design contract, not a rendered or AI-verified visual result",
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--profile", required=True)
    ap.add_argument("--brief", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    try:
        contract = build_contract(load_json(args.profile), load_json(args.brief))
        save_json(args.out, contract, sources=(args.profile, args.brief))
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False))
        return 1
    print(json.dumps({"status": "PASS", "output": args.out,
                      "candidate_count": len(contract["candidate_briefs"]),
                      "profile_state": contract["profile_state"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
