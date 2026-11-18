#!/usr/bin/env python3
"""Offline single-file resume website reference renderer for HCS v1.8.

This does NOT parse PDF/DOCX, run AI, publish a site or confirm user consent.
The host agent must extract and review truthful structured resume content.
"""
from __future__ import annotations

import argparse
import html
import json
import pathlib
import re
import sys

from design_dna import contrast_ratio, load_json, validate_profile

COMPOSITIONS = {"editorial", "split", "gallery", "timeline"}


def h(value: object) -> str:
    return html.escape(str(value), quote=True)


def safe_url(value: str, *, contact: bool = False) -> str | None:
    if not isinstance(value, str) or len(value) > 400:
        return None
    value = value.strip()
    if re.match(r"^https://[^\s<>\"']+$", value, flags=re.I):
        return value
    if contact and re.match(r"^mailto:[^\s<>\"']+@[^\s<>\"']+$", value, flags=re.I):
        return value
    return None


def validate_resume(resume: dict, *, production: bool = False) -> None:
    if resume.get("schema_version") != "1.8":
        raise ValueError("Resume schema_version must be 1.8")
    identity = resume.get("identity")
    if not isinstance(identity, dict) or any(not isinstance(identity.get(k), str) or not identity[k].strip() for k in ("name", "role", "tagline")):
        raise ValueError("Resume identity requires name/role/tagline")
    if not isinstance(resume.get("intro"), str) or not resume["intro"].strip():
        raise ValueError("Resume needs an intro")
    for key in ("experience", "projects", "skills", "contacts"):
        if not isinstance(resume.get(key), list):
            raise ValueError(f"Resume {key} must be an array")
    for i, item in enumerate(resume["experience"]):
        if not isinstance(item, dict) or any(not isinstance(item.get(k), str) or not item[k].strip() for k in ("id", "role", "organization", "period")):
            raise ValueError(f"Invalid experience[{i}]")
        if not isinstance(item.get("details"), list) or not all(isinstance(v, str) for v in item["details"]):
            raise ValueError(f"Experience[{i}].details must be strings")
    for i, item in enumerate(resume["projects"]):
        if not isinstance(item, dict) or any(not isinstance(item.get(k), str) or not item[k].strip() for k in ("id", "name", "description")):
            raise ValueError(f"Invalid project[{i}]")
        if item.get("url") and not safe_url(item["url"]):
            raise ValueError(f"Project[{i}] unsafe URL")
    if not all(isinstance(v, str) for v in resume["skills"]):
        raise ValueError("Skills must be strings")
    for i, contact in enumerate(resume["contacts"]):
        if not isinstance(contact, dict) or contact.get("visibility") not in {"private", "review", "public"}:
            raise ValueError(f"Invalid contact[{i}].visibility")
        if not isinstance(contact.get("label"), str) or not isinstance(contact.get("value"), str):
            raise ValueError(f"Invalid contact[{i}]")
        if contact.get("url") and not safe_url(contact["url"], contact=True):
            raise ValueError(f"Contact[{i}] unsafe URL")
    if production:
        if resume.get("fictional_fixture") is True:
            raise ValueError("Fictional fixture cannot be released")
        for key in ("copy_approval", "publication_approval"):
            approval = resume.get(key)
            if not isinstance(approval, dict) or approval.get("state") != "approved" or not str(approval.get("user_evidence", "")).strip():
                raise ValueError(f"Production requires explicit {key} evidence")


def validate_direction(direction: dict, profile: dict, *, production: bool = False) -> None:
    if direction.get("schema_version") != "1.8" or direction.get("content_type") != "resume":
        raise ValueError("Art direction must be a v1.8 resume project")
    if direction.get("profile_id") != profile.get("profile_id") or direction.get("profile_revision") != profile.get("revision"):
        raise ValueError("Art direction profile identity or revision is stale")
    if not isinstance(direction.get("candidate_briefs"), list) or len(direction["candidate_briefs"]) < 2:
        raise ValueError("Art direction needs at least two proposals")
    if production:
        approvals = direction.get("user_approvals")
        if not isinstance(approvals, dict) or approvals.get("visual") != "approved" or not str(approvals.get("visual_user_evidence", "")).strip():
            raise ValueError("Production needs independently approved visual direction")


def render(profile: dict, resume: dict, direction: dict, *, production: bool = False) -> str:
    verdict = validate_profile(profile, production=production)
    if verdict["status"] != "PASS":
        raise ValueError("Invalid Design DNA: " + "; ".join(verdict["errors"]))
    validate_resume(resume, production=production)
    validate_direction(direction, profile, production=production)
    tokens = profile["design_tokens"]
    if contrast_ratio(tokens["foreground"], tokens["background"]) < 4.5:
        raise ValueError("Insufficient readable text contrast")
    composition = tokens.get("composition", "editorial")
    if composition not in COMPOSITIONS:
        raise ValueError("Unknown composition; choose editorial/split/gallery/timeline")
    motion = tokens["motion"]
    duration = {"none": "0ms", "subtle": "380ms", "expressive": "720ms"}[motion]
    name, role, tagline = (h(resume["identity"][k]) for k in ("name", "role", "tagline"))
    intro = h(resume["intro"])
    roles = []
    for item in resume["experience"]:
        details = "".join(f"<li>{h(part)}</li>" for part in item["details"])
        roles.append(f'<article class="entry" id="{h(item["id"])}"><div class="entry-meta"><span>{h(item["period"])}</span>'
                     f'<small>{h(item["organization"])}</small></div><div><h3>{h(item["role"])}</h3><ul>{details}</ul></div></article>')
    projects = []
    for item in resume["projects"]:
        name_html = h(item["name"])
        url = safe_url(item.get("url", ""))
        link = f'<a href="{h(url)}" target="_blank" rel="noopener noreferrer">查看项目 ↗</a>' if url else ""
        projects.append(f'<article class="project" id="{h(item["id"])}"><span class="project-tag">SELECTED WORK</span>'
                        f'<h3>{name_html}</h3><p>{h(item["description"])}</p>{link}</article>')
    skills = "".join(f"<li>{h(s)}</li>" for s in resume["skills"])
    contacts = []
    if production:
        for c in resume["contacts"]:
            if c["visibility"] != "public":
                continue
            url = safe_url(c.get("url", ""), contact=True)
            if url:
                contacts.append(f'<a href="{h(url)}" rel="noopener noreferrer">{h(c["label"])} ↗</a>')
            else:
                contacts.append(f'<span>{h(c["label"])}: {h(c["value"])}</span>')
    contact_html = "".join(contacts) if contacts else '<span>联系资料暂未公开</span>'
    draft = "" if production else '<div class="draft" role="note">DRAFT / PRIVATE PREVIEW · 内容、审美及发布均待确认</div>'
    noindex = "" if production else '<meta name="robots" content="noindex,nofollow,noarchive">'
    stylesheet = f"""
  :root{{--bg:{tokens['background']};--surface:{tokens['surface']};--fg:{tokens['foreground']};--muted:{tokens['muted']};
  --accent:{tokens['accent']};--radius:{tokens['radius_px']}px;--motion:{duration};}}
  *{{box-sizing:border-box}}html{{scroll-behavior:smooth}}body{{margin:0;background:var(--bg);color:var(--fg);
  font-family:{tokens['font_stack']};font-size:16px;line-height:1.7;min-width:0;overflow-x:hidden}}
  a{{color:inherit;text-underline-offset:4px}}a:focus-visible{{outline:3px solid var(--accent);outline-offset:4px}}
  .draft{{position:sticky;top:0;z-index:10;background:#FEE2B9;color:#232323;text-align:center;padding:10px 16px;font:700 12px/1.5 system-ui,sans-serif}}
  .wrap{{width:min(1180px,calc(100% - 56px));margin-inline:auto}}.top{{display:flex;justify-content:space-between;gap:15px;padding:28px 0;border-bottom:1px solid currentColor}}
  .top a{{text-decoration:none;font-size:13px}}.mark{{font-weight:800;letter-spacing:.12em}}
  .hero{{padding:clamp(80px,11vw,180px) 0 110px;position:relative;border-bottom:1px solid var(--fg)}}
  .eyebrow{{font-size:12px;letter-spacing:.23em;text-transform:uppercase;font-weight:750;color:var(--accent)}}
  h1{{font-size:clamp(54px,10vw,150px);letter-spacing:-.073em;line-height:.91;max-width:10ch;margin:24px 0 34px}}
  .hero .tagline{{font-size:clamp(19px,2.2vw,28px);max-width:44ch;margin:0;color:var(--muted)}}
  .section{{padding:110px 0;border-bottom:1px solid var(--fg)}}.section-head{{display:grid;grid-template-columns:1fr 2fr;gap:45px;align-items:start;margin-bottom:58px}}
  .section h2{{font-size:clamp(33px,5vw,75px);line-height:1;letter-spacing:-.055em;margin:0}}
  .intro{{font-size:clamp(19px,2.4vw,29px);max-width:65ch;margin:0}}h3{{font-size:clamp(22px,2.6vw,33px);line-height:1.22;letter-spacing:-.03em;margin:0 0 15px}}
  .entry{{display:grid;grid-template-columns:minmax(155px,.85fr) 2fr;gap:50px;border-top:1px solid currentColor;padding:30px 0 52px}}
  .entry-meta{{display:grid;gap:4px;font-size:13px}}.entry-meta small{{color:var(--muted)}}.entry ul{{padding-left:18px;margin:0}}
  .project-grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}}.project{{background:var(--surface);padding:40px;border-radius:var(--radius);border:1px solid currentColor;min-width:0}}
  .project-tag{{color:var(--accent);font-size:11px;letter-spacing:.15em;font-weight:800}}.project p{{max-width:52ch}}.project a{{display:inline-block;margin-top:15px}}
  .skills{{list-style:none;display:flex;flex-wrap:wrap;gap:10px;margin:0;padding:0}}.skills li{{padding:9px 17px;border:1px solid currentColor;border-radius:var(--radius)}}
  footer{{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;padding:55px 0 90px}}
  .hero::after{{content:"";position:absolute;right:2%;top:15%;width:clamp(50px,8vw,150px);aspect-ratio:1;border:18px solid var(--accent);border-radius:var(--radius);opacity:.85;transform:rotate(18deg)}}
  .composition-split .hero{{display:grid;grid-template-columns:1.2fr .8fr;gap:60px;align-items:end}}
  .composition-split .hero h1{{max-width:8ch}}.composition-split .hero .tagline{{border-left:5px solid var(--accent);padding-left:30px;margin-bottom:15px}}
  .composition-split .section-head{{grid-template-columns:1fr 1fr}}
  .composition-gallery .hero{{text-align:center}}.composition-gallery .hero h1{{margin-inline:auto;max-width:12ch}}
  .composition-gallery .hero .tagline{{margin-inline:auto}}.composition-gallery .hero::after{{left:9%;top:15%;right:auto;border-radius:50%;opacity:.35}}
  .composition-gallery .project-grid{{grid-template-columns:repeat(3,minmax(0,1fr))}}.composition-gallery .project{{min-height:340px}}
  .composition-timeline .entry{{grid-template-columns:minmax(100px,.48fr) 2fr;position:relative;border-left:3px solid var(--accent);padding-left:40px;margin-left:12px}}
  .composition-timeline .entry::before{{content:"";position:absolute;left:-10px;top:39px;width:17px;height:17px;border-radius:50%;background:var(--accent)}}
  .composition-timeline .hero h1{{font-family:Georgia,serif;letter-spacing:-.055em}}
  .composition-timeline .project-grid{{grid-template-columns:1fr}}
  @media (prefers-reduced-motion:no-preference){{.hero h1{{animation:enter var(--motion) ease-out both}}@keyframes enter{{from{{opacity:.4;transform:translateY(12px)}}to{{opacity:1;transform:translateY(0)}}}}}}
  @media (max-width:780px){{.wrap{{width:calc(100% - 36px)}}.top{{padding:20px 0}}.hero{{padding:86px 0 70px}}.hero::after{{width:54px;border-width:10px;opacity:.2}}
  .section{{padding:65px 0}}.section-head,.composition-split .section-head,.composition-split .hero,.entry,.composition-timeline .entry{{display:block}}
  .section-head{{margin-bottom:38px}}.section h2{{margin-top:13px}}.entry-meta{{margin-bottom:15px}}.project-grid,.composition-gallery .project-grid{{grid-template-columns:1fr}}
  .project{{padding:27px;min-height:0!important}}h1{{font-size:clamp(50px,13vw,95px)}}.composition-timeline .entry{{padding-left:22px}}
  .composition-split .hero .tagline{{padding-left:14px}}}}
  @media (prefers-reduced-motion:reduce){{*,*::before,*::after{{scroll-behavior:auto!important;animation:none!important;transition:none!important}}}}
  """
    return f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="{h(resume['identity']['tagline'])}">{noindex}
<title>{name} · {role}</title><style>{stylesheet}</style></head>
<body class="composition-{composition}">{draft}<div class="wrap">
<header class="top"><span class="mark">{name}</span><nav aria-label="章节导航"><a href="#about">关于</a> · <a href="#experience">经历</a> · <a href="#work">作品</a> · <a href="#skills">技能</a></nav></header>
<main><section class="hero" aria-labelledby="hero-title"><div><span class="eyebrow">{role}</span><h1 id="hero-title">{name}</h1></div><p class="tagline">{tagline}</p></section>
<section class="section" id="about" aria-labelledby="about-title"><div class="section-head"><span class="eyebrow">01 / About</span><h2 id="about-title">关于我</h2></div><p class="intro">{intro}</p></section>
<section class="section" id="experience" aria-labelledby="experience-title"><div class="section-head"><span class="eyebrow">02 / Career</span><h2 id="experience-title">经历</h2></div>{''.join(roles)}</section>
<section class="section" id="work" aria-labelledby="work-title"><div class="section-head"><span class="eyebrow">03 / Selected Work</span><h2 id="work-title">项目与作品</h2></div><div class="project-grid">{''.join(projects)}</div></section>
<section class="section" id="skills" aria-labelledby="skills-title"><div class="section-head"><span class="eyebrow">04 / Skills</span><h2 id="skills-title">技能</h2></div><ul class="skills">{skills}</ul></section></main>
<footer><strong>{name}</strong><div>{contact_html}</div><small>Offline-ready HTML · HCS v1.8</small></footer></div></body></html>'''


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--resume", required=True)
    ap.add_argument("--profile", required=True)
    ap.add_argument("--direction", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--production", action="store_true")
    args = ap.parse_args(argv)
    try:
        page = render(load_json(args.profile), load_json(args.resume), load_json(args.direction),
                      production=args.production)
        dest = pathlib.Path(args.out).resolve()
        if dest.exists() or dest in {pathlib.Path(p).resolve() for p in (args.resume, args.profile, args.direction)}:
            raise ValueError("Output must be new; refusing overwrite")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(page, encoding="utf-8")
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False))
        return 1
    print(json.dumps({"status": "PASS", "file": str(dest), "draft": not args.production,
                      "note": "no document parsing, AI vision or public deployment has been performed"}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
