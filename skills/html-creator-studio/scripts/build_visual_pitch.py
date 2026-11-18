#!/usr/bin/env python3
"""Create three distinctly composed, self-contained visual pitches from a brief.

This is an OPTIONAL reference implementation, not a design oracle. It never
fetches remote assets, invents facts, or declares user copy approved.
"""
from __future__ import annotations
import argparse
import html
import json
import pathlib
import re
import sys

STYLES = [
    {"id": "editorial", "title": "纸面建筑", "english": "EDITORIAL ATELIER", "tone": "高级编辑 / 明亮材质", "palette": ["#F3F0E8", "#1E2927", "#BB5E42"], "composition": "超大衬线标题 + 双栏注释 + 纸面结构", "motion": "慢速遮罩 / 字距收拢", "asset": "原创 SVG 折页与压印线条", "tradeoff": "以高品质阅读为主；空间特效较克制"},
    {"id": "signal", "title": "信号空间", "english": "CINEMATIC SIGNAL", "tone": "电影空间 / 技术叙事", "palette": ["#0B1320", "#DFF9F7", "#59E1D2"], "composition": "深色透视装置 + 巨型标题 + 精细 HUD", "motion": "扫描线 / 定序轨道 / 局部光晕", "asset": "与内容章节一一对应的原创空间轨道", "tradeoff": "适合强叙事；对运动与图层性能要求更高"},
    {"id": "collision", "title": "字体碰撞", "english": "TYPE COLLISION", "tone": "瑞士实验 / 平面与动态字体", "palette": ["#EEEBD9", "#132BEB", "#FA5932"], "composition": "倾斜编号 + 印刷色块 + 破格标题", "motion": "字号错位 / 位移 / 剪裁转场", "asset": "可授权字体与原创拼版形状", "tradeoff": "记忆点强；长文需要单独设计安静阅读区"},
]

def E(s: str) -> str:
    return html.escape(str(s), quote=True)

def validate(b: dict) -> dict:
    if not isinstance(b, dict):
        raise ValueError("brief 必须是 JSON 对象")
    needed = ["project", "headline", "summary", "sections"]
    if any(not b.get(k) for k in needed):
        raise ValueError(f"brief 必须包含非空字段：{', '.join(needed)}")
    sections = b["sections"]
    if not isinstance(sections, list) or not 2 <= len(sections) <= 6:
        raise ValueError("sections 须为 2–6 个条目的数组；候选提案应包含高密度内容试样")
    for item in sections:
        if not isinstance(item, dict) or not item.get("heading") or not item.get("text"):
            raise ValueError("sections 每项必须包含 heading 与 text")
    if any(len(str(b[k])) > 320 for k in ("project", "headline", "summary")):
        raise ValueError("提案简报应精炼；主体内容请放入 sections")
    if any(len(str(t["text"])) > 650 or len(str(t["heading"])) > 120 for t in sections):
        raise ValueError("某章节太长；请先提炼摘要，正式文案另审")
    return b

def shared_meta(b):
    return f'''<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>{E(b["project"])} · 视觉提案</title>'''

def sections_html(b, mode):
    out=[]
    for i, item in enumerate(b["sections"], 1):
        title=E(item["heading"]); body=E(item["text"])
        if mode == "editorial":
            out.append(f'<article class="detail-item"><span class="seq">{i:02d} / CONTENT</span><h3>{title}</h3><p>{body}</p></article>')
        elif mode == "signal":
            out.append(f'<article class="detail-item"><span class="seq">MODULE / {i:02d}</span><h3>{title}</h3><p>{body}</p><span class="trace"></span></article>')
        else:
            out.append(f'<article class="detail-item"><span class="seq">{i:02d}</span><div><h3>{title}</h3><p>{body}</p></div></article>')
    return '\n'.join(out)

COMMON = '''
*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth}body{margin:0;min-width:0;overflow-x:hidden;-webkit-font-smoothing:antialiased}
button,a{font:inherit}a{text-decoration:none;color:inherit}button{cursor:pointer}
:focus-visible{outline:3px solid currentColor;outline-offset:5px}
.pitch-watermark{position:absolute;top:72px;right:14px;z-index:20;padding:8px 10px;background:#fff;color:#292929;font:700 10px/1.2 ui-monospace,monospace;letter-spacing:.09em;box-shadow:0 2px 12px #0001;max-width:170px;text-align:center;border:1px solid #ccc}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
'''

def editorial(b):
    article=sections_html(b, "editorial")
    # Semantic 'folded page' illustration is a deliberately original CSS/SVG construction.
    return f'''<!doctype html><html lang="zh-CN"><head>{shared_meta(b)}<style>{COMMON}
:root{{--paper:#F3F0E8;--ink:#1E2927;--rust:#BB5E42}}body{{background:var(--paper);color:var(--ink);font-family:"Noto Sans CJK SC","PingFang SC","Microsoft YaHei",sans-serif}}
.page{{min-height:100svh;max-width:1600px;margin:auto;padding:32px clamp(22px,5vw,92px) 80px}}
.topline{{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1E292748;padding:0 0 20px;font:600 12px/1.4 ui-monospace,monospace;letter-spacing:.16em}}
.hero{{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:4vw;min-height:75vh;align-items:center;position:relative}}
.kicker,.seq{{font:700 11px/1.5 ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase;color:var(--rust)}}
h1{{font:500 clamp(50px,7.5vw,137px)/.98 Georgia,"Noto Serif CJK SC","Songti SC",serif;letter-spacing:-.068em;margin:24px 0 28px;overflow-wrap:anywhere}}
.lead{{font-size:clamp(16px,1.5vw,22px);line-height:1.9;max-width:33em}}
.hero .bottom{{display:flex;align-items:center;gap:20px;margin-top:40px;font:600 12px ui-monospace,monospace}}
.marker{{width:40px;height:1px;background:var(--rust)}}.paper-art{{position:relative;aspect-ratio:4/5;width:min(100%,520px);margin:auto;isolation:isolate}}
.paper-art svg{{position:absolute;inset:0;width:100%;height:100%;filter:drop-shadow(22px 25px 20px #1b2e261c);animation:float 9s ease-in-out infinite}}
.paper-art .art-label{{position:absolute;bottom:12%;left:-5%;font:11px ui-monospace,monospace;letter-spacing:.14em;transform:rotate(-90deg);transform-origin:left bottom}}
@keyframes float{{50%{{transform:translateY(-13px) rotate(1deg)}}}}
.details{{border-top:3px solid var(--ink);margin-top:4vw;display:grid;grid-template-columns:minmax(160px,.8fr) minmax(0,2.1fr);gap:8vw;padding-top:32px}}
.details-intro{{position:sticky;top:35px;align-self:start}}.details-intro h2{{font:500 clamp(30px,4vw,60px)/1.12 Georgia,"Songti SC",serif;margin:18px 0}}
.detail-item{{padding:0 0 34px;margin-bottom:32px;border-bottom:1px solid #1e29272a;display:grid;grid-template-columns:100px 1fr 1.4fr;gap:16px;align-items:baseline}}
.detail-item h3{{font-size:clamp(18px,1.8vw,26px);letter-spacing:-.03em;margin:0}}.detail-item p{{font-size:15px;line-height:1.9;margin:0;color:#4D5651}}
@media(max-width:760px){{.page{{padding:24px 22px 55px}}.topline{{font-size:10px}}.hero{{grid-template-columns:1fr;gap:10px;min-height:auto;padding-top:60px}}h1{{font-size:clamp(54px,13vw,90px)}}.paper-art{{width:min(78%,400px);aspect-ratio:1/1}}.details{{display:block}}.details-intro{{position:static;margin-bottom:32px}}.detail-item{{grid-template-columns:54px 1fr;gap:8px}}.detail-item p{{grid-column:2}}}}
</style></head><body><div class="pitch-watermark">视觉提案 · 非正式成品<br>文案待用户审批</div><main class="page">
<header class="topline"><span>{E(b["project"])} / STUDY 01</span><span>THE EDITORIAL APPROACH ↗</span></header>
<section class="hero" id="hero"><div><div class="kicker">01 — FROM SOURCE TO EXPERIENCE</div><h1>{E(b["headline"])}</h1><p class="lead">{E(b["summary"])}</p><div class="bottom"><span class="marker"></span>SCROLL TO EXPLORE / 001</div></div>
<div class="paper-art" aria-label="抽象纸面折叠装置"><svg viewBox="0 0 420 520" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="原创折页图形"><rect x="45" y="90" width="315" height="375" fill="#DFD7C6"/><path d="M45 90L285 45L358 465L115 415L45 90Z" fill="#B8CBBF" stroke="#1E2927" stroke-width="1.5"/><path d="M122 102L285 45L358 465L122 102Z" fill="#D9DECC"/><path d="M122 102L85 415L358 465L122 102Z" fill="#BB5E42"/><path d="M122 102L285 45L85 415" stroke="#1E2927" stroke-width="1"/><path d="M65 472H375M65 486H300M65 500H260" stroke="#1E2927" stroke-width="1" opacity=".5"/><circle cx="323" cy="118" r="24" stroke="#1E2927" stroke-width="1.4"/><path d="M307 118H339M323 102V134" stroke="#1E2927"/></svg><span class="art-label">STUDY OF FORM / MATERIAL 01</span></div></section>
<section class="details" id="details"><div class="details-intro"><span class="kicker">INFORMATION ARCHITECTURE / 02</span><h2>重要的内容，<br>值得被看见。</h2><p style="line-height:1.75;color:#65716a">这是信息密集页的排版试样，展示层级和阅读节奏。</p></div><div>{article}</div></section>
</main></body></html>'''

def signal(b):
    art=sections_html(b, "signal")
    return f'''<!doctype html><html lang="zh-CN"><head>{shared_meta(b)}<style>{COMMON}
:root{{--base:#0B1320;--ink:#DFF9F7;--line:#59E1D2;--signal:#FA7756}}body{{color:var(--ink);background:var(--base);font-family:"Noto Sans CJK SC","Microsoft YaHei",sans-serif}}
body:before{{content:"";position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px);background-size:72px 72px;mask-image:linear-gradient(to bottom,black,transparent);z-index:0}}
.page{{isolation:isolate;position:relative;max-width:1600px;margin:auto;padding:28px clamp(22px,5vw,86px) 75px}}
.topline{{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #dff9f72a;padding-bottom:18px;color:#9FB8BD;font:12px ui-monospace,monospace;letter-spacing:.12em}}
.live{{display:inline-flex;align-items:center;gap:9px}}.live i{{width:7px;height:7px;background:var(--line);border-radius:100%;box-shadow:0 0 12px var(--line)}}
.hero{{position:relative;min-height:80vh;display:grid;grid-template-columns:1.1fr .9fr;align-items:center;gap:0}}
.eyebrow,.seq{{font:11px ui-monospace,monospace;letter-spacing:.21em;color:var(--line)}}h1{{font:800 clamp(52px,8vw,142px)/.95 "Arial Narrow","Noto Sans CJK SC","Microsoft YaHei",sans-serif;letter-spacing:-.084em;margin:28px 0 30px;overflow-wrap:anywhere}}
.lead{{color:#AEC5C9;font-size:clamp(16px,1.5vw,21px);max-width:37ch;line-height:1.7}}.callout{{border-left:2px solid var(--line);padding:4px 0 4px 20px;margin-top:55px;font:12px ui-monospace,monospace;color:#80A4AC;letter-spacing:.08em}}
.space-art{{position:relative;aspect-ratio:1/1;min-width:0;perspective:740px;overflow:visible;display:grid;place-items:center}}
.space-art svg{{width:110%;overflow:visible;filter:drop-shadow(0 0 22px #59e1d236)}}.orbit{{transform-origin:center;animation:spin 15s linear infinite}}.orbit.reverse{{animation-direction:reverse;animation-duration:21s}}@keyframes spin{{to{{transform:rotate(360deg)}}}}
.space-label{{position:absolute;bottom:13%;right:8%;color:#87B5BC;font:11px ui-monospace,monospace;letter-spacing:.16em}}
.details{{border-top:1px solid #6e9eac7d;padding-top:34px;display:grid;grid-template-columns:1fr 2.2fr;gap:5vw}}
.details-intro h2{{font:750 clamp(34px,4vw,72px)/1 "Arial Narrow","Noto Sans CJK SC",sans-serif;letter-spacing:-.055em;margin:25px 0}}.details-intro p{{font-size:15px;line-height:1.8;color:#9DB6BF;max-width:260px}}
.detail-grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 28px}}.detail-item{{position:relative;min-height:210px;padding:20px 0 28px;border-top:1px solid #DFF9F741}}
.detail-item h3{{font-size:clamp(20px,2vw,30px);line-height:1.2;letter-spacing:-.035em;margin:27px 0 13px}}.detail-item p{{font-size:14px;line-height:1.8;color:#A2B9C2;max-width:32ch}}.trace{{position:absolute;top:-1px;left:0;width:30%;height:1px;background:var(--line);box-shadow:0 0 11px #59e1d288}}
@media(max-width:760px){{.page{{padding:22px 20px 60px}}.topline{{font-size:10px}}.hero{{display:flex;flex-direction:column;align-items:stretch;padding-top:64px}}h1{{font-size:clamp(52px,13vw,91px)}}.space-art{{width:min(94%,390px);align-self:center;margin-top:25px}}.details{{display:block}}.detail-grid{{grid-template-columns:1fr}}.detail-item{{min-height:0}}.details-intro p{{max-width:none}}}}
</style></head><body><div class="pitch-watermark">视觉提案 · 非正式成品<br>文案待用户审批</div><main class="page">
<header class="topline"><span>{E(b["project"])} / SYSTEM {E(b.get("issue", "26"))}</span><span class="live"><i></i>LIVE DESIGN SIGNAL</span></header>
<section class="hero" id="hero"><div><div class="eyebrow">RESEARCH / SYSTEM DESIGN / 01—03</div><h1>{E(b["headline"])}</h1><p class="lead">{E(b["summary"])}</p><div class="callout">RENDER READY · FRAME-SEEKABLE APPROACH</div></div><div class="space-art" aria-label="原创空间轨道装置">
<svg viewBox="0 0 540 540" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="原创轨道几何"><circle cx="270" cy="270" r="200" stroke="#3B6872" stroke-width="1"/><g class="orbit"><ellipse cx="270" cy="270" rx="205" ry="85" transform="rotate(-28 270 270)" stroke="#59E1D2" stroke-width="2"/><circle cx="83" cy="314" r="9" fill="#59E1D2"/></g><g class="orbit reverse"><ellipse cx="270" cy="270" rx="130" ry="218" transform="rotate(35 270 270)" stroke="#FA7756" stroke-width="1.5"/><circle cx="170" cy="90" r="6" fill="#FA7756"/></g><circle cx="270" cy="270" r="103" stroke="#7CCCD0" stroke-dasharray="2 12"/><circle cx="270" cy="270" r="50" stroke="#DFF9F7" stroke-width="1"/><circle cx="270" cy="270" r="11" fill="#59E1D2"/><path d="M0 270H540M270 0V540" stroke="#375560" stroke-width="1" stroke-dasharray="6 17"/><path d="M349 198L472 113H529M172 343L72 433H15" stroke="#59E1D2"/><path d="M458 100H527M15 447H95" stroke="#7CCCD0"/></svg>
<span class="space-label">VECTOR / PATH_001<br>STABLE TIMELINE</span></div></section>
<section class="details" id="details"><div class="details-intro"><span class="eyebrow">DATA LAYER / INFORMATION</span><h2>把信息，<br>变成结构。</h2><p>同样的材料，采用高精度数据层级、空间纵深与场景标识重新组织。</p></div><div class="detail-grid">{art}</div></section>
</main></body></html>'''

def collision(b):
    art=sections_html(b, "collision")
    return f'''<!doctype html><html lang="zh-CN"><head>{shared_meta(b)}<style>{COMMON}
:root{{--paper:#EEEBD9;--blue:#132BEB;--orange:#FA5932;--black:#151515}}body{{background:var(--paper);color:var(--black);font-family:"Noto Sans CJK SC","Microsoft YaHei",sans-serif}}
.page{{max-width:1650px;margin:auto;position:relative;overflow:hidden;min-height:100vh;padding:22px clamp(18px,4vw,72px) 78px}}
.page:before{{content:"";position:absolute;top:170px;left:-10%;width:120%;height:460px;pointer-events:none;background-image:radial-gradient(#132beb22 1.3px,transparent 1.3px);background-size:12px 12px;transform:skewY(-7deg)}}
.header{{position:relative;display:flex;justify-content:space-between;align-items:flex-start;border-top:8px solid var(--black);padding-top:14px;font:800 12px ui-monospace,monospace;letter-spacing:.13em}}
.stamp{{padding:8px 12px;border:1px solid var(--black);transform:rotate(3deg);margin-right:110px}}
.hero{{isolation:isolate;position:relative;min-height:77vh;display:grid;grid-template-columns:minmax(0,1.4fr) minmax(240px,.6fr);align-items:center}}
.big-num{{position:absolute;top:5%;right:-1%;font:900 clamp(140px,22vw,360px)/1 Arial,sans-serif;color:var(--blue);opacity:.12;letter-spacing:-.15em;transform:rotate(12deg);pointer-events:none}}
.kicker,.seq{{font:800 12px ui-monospace,monospace;letter-spacing:.07em}}.kicker{{display:inline-block;background:var(--black);color:white;padding:10px 14px;transform:rotate(-2deg)}}
h1{{position:relative;z-index:2;font:900 clamp(56px,9vw,160px)/.95 "Arial Black","Noto Sans CJK SC","Microsoft YaHei",sans-serif;letter-spacing:-.094em;color:var(--blue);overflow-wrap:anywhere;margin:32px 0 20px;max-width:850px}}
.lead{{position:relative;z-index:3;background:var(--paper);display:inline-block;max-width:40ch;font-size:clamp(17px,1.6vw,25px);line-height:1.65;letter-spacing:-.015em;padding:9px 15px 9px 0}}
.art{{width:100%;aspect-ratio:4/4.5;display:grid;place-items:center;position:relative}}.block{{position:absolute;width:75%;height:56%;transform:rotate(-12deg);background:var(--orange);top:15%;right:0;box-shadow:20px 20px 0 #151515}}.disc{{width:62%;aspect-ratio:1;position:absolute;top:28%;left:0;border-radius:50%;background:var(--blue);display:grid;place-items:center;color:white;font:900 clamp(60px,9vw,125px) Arial,sans-serif;transform:rotate(13deg);animation:tilt 8s ease-in-out infinite}}
@keyframes tilt{{50%{{transform:rotate(-2deg) translateY(-12px)}}}}.hatch{{position:absolute;right:8%;bottom:5%;width:66%;height:20%;border:2px solid var(--black);background:repeating-linear-gradient(-40deg,transparent 0 8px,#151515 9px 12px,transparent 12px 20px);transform:rotate(9deg)}}
.details{{position:relative;border-top:9px solid var(--black);padding-top:27px}}.details-header{{display:flex;align-items:baseline;justify-content:space-between;gap:20px;margin-bottom:30px}}.details-header h2{{font:900 clamp(40px,6vw,105px)/.99 Arial,"Noto Sans CJK SC",sans-serif;letter-spacing:-.08em;color:var(--blue);margin:0}}
.detail-item{{border-top:2px solid var(--black);padding:23px 0 34px;display:grid;grid-template-columns:120px 1fr;gap:20px}}.detail-item .seq{{font:900 clamp(45px,6vw,80px)/1 Arial,sans-serif;color:var(--orange)}}.detail-item h3{{font:900 clamp(22px,2.4vw,38px)/1.15 Arial,"Microsoft YaHei",sans-serif;margin:0 0 14px}}.detail-item p{{font-size:15px;line-height:1.9;max-width:55ch;margin:0}}
@media(max-width:760px){{.page{{padding:20px 19px 55px}}.header{{font-size:10px}}.stamp{{margin-right:125px}}.hero{{display:flex;flex-direction:column;align-items:stretch;padding-top:68px;min-height:0}}h1{{font-size:clamp(58px,12vw,92px)}}.art{{width:65%;align-self:flex-end;aspect-ratio:1/1;max-width:300px;margin:10px 0 55px}}.details-header{{display:block}}.detail-item{{grid-template-columns:65px 1fr;gap:10px}}.detail-item .seq{{font-size:55px}}.big-num{{top:20%;font-size:180px}}}}
</style></head><body><div class="pitch-watermark">视觉提案 · 非正式成品<br>文案待用户审批</div><main class="page">
<header class="header"><span>{E(b["project"])}<br>DESIGN STUDY / 003</span><span class="stamp">NOT A TEMPLATE<br>CREATIVE STUDY</span></header><section class="hero" id="hero"><div class="big-num">03</div><div><span class="kicker">EXPERIMENTAL / TYPOGRAPHY</span><h1>{E(b["headline"])}</h1><p class="lead">{E(b["summary"])}</p></div><div class="art" aria-label="原创字体实验几何插画"><div class="block"></div><div class="disc">↗</div><div class="hatch"></div></div></section>
<section class="details" id="details"><div class="details-header"><h2>意义先行。<br>形式随后。</h2><span class="kicker">INFORMATION STUDY / 02</span></div>{art}</section></main></body></html>'''

RENDER={"editorial":editorial,"signal":signal,"collision":collision}

HUB_CSS='''
*{box-sizing:border-box}body{margin:0;background:#f5f4f0;color:#1c2522;font-family:system-ui,"Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased}
header{max-width:1480px;margin:auto;padding:30px 28px 20px;display:flex;align-items:start;justify-content:space-between;gap:20px}
.eyebrow{font:700 11px ui-monospace,monospace;letter-spacing:.15em;color:#777}h1{font-size:clamp(26px,3.1vw,48px);letter-spacing:-.055em;margin:9px 0 8px}p{line-height:1.65;color:#69716e}
nav{max-width:1480px;margin:auto;padding:0 28px;display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}
.tab{background:white;color:#26302e;text-align:left;border:1px solid #d9dcd6;border-radius:15px;padding:17px 18px;cursor:pointer;transition:border-color .2s,transform .2s}.tab:hover{transform:translateY(-3px)}.tab[aria-selected="true"]{border-color:#1e4138;box-shadow:inset 0 0 0 1px #1e4138}
.tab strong{display:block;font-size:18px;margin:8px 0}.tab small{color:#66706c}.swatches{display:flex;gap:4px}.swatches i{width:18px;height:18px;border-radius:50%}
.stage{max-width:1480px;margin:14px auto 50px;padding:0 28px}.bar{background:#222b27;color:#fff;padding:11px 16px;border-radius:12px 12px 0 0;display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:13px}
button{font:inherit}button.action{background:#f8faef;border:0;border-radius:6px;padding:8px 11px;cursor:pointer;color:#151e19}.tip{margin-left:auto;color:#bbc4be}
.framebox{width:100%;height:680px;background:#e1e5de;border:1px solid #bac3b9;overflow:auto;display:flex;justify-content:center}
iframe{border:0;width:100%;height:100%;background:white;flex-shrink:0}.framebox.mobile iframe{width:390px;max-width:100%;box-shadow:0 0 0 1px #ddd}
.note{font-size:13px;max-width:1380px;margin:18px auto;color:#626c69;padding:0 28px}
@media(max-width:720px){header{display:block;padding:22px 14px}nav{padding:0 14px;grid-template-columns:1fr;gap:7px}.tab{padding:11px 13px}.tab strong{display:inline;margin-left:7px;font-size:15px}.tab small{display:block;font-size:12px}.stage{padding:0 8px}.framebox{height:580px}.note{padding:0 14px}}
'''

def choose_directions(mode: str, style: str | None = None) -> list[dict]:
    if style is not None:
        matches = [meta for meta in STYLES if meta['id'] == style]
        if not matches:
            raise ValueError(f'unknown visual style: {style}')
        return matches
    if mode not in ('quick', 'studio'):
        raise ValueError(f'unknown visual pitch mode: {mode}')
    return STYLES[:2] if mode == 'quick' else STYLES


def make_hub(b, pages, metas=None):
    # All iframe content is embedded; the hub still functions as a single offline HTML.
    if metas is None:
        metas = [meta for meta in STYLES if meta['id'] in pages]
    if not metas:
        raise ValueError('at least one visual direction is required')
    styles=[]
    for meta in metas:
        palette=''.join(f'<i style="background:{c}"></i>' for c in meta["palette"])
        styles.append(f'<button class="tab" type="button" data-s="{meta["id"]}" role="tab" aria-selected="false"><span class="swatches">{palette}</span><strong>{E(meta["title"])}</strong><small>{E(meta["tone"])} · {E(meta["composition"])}</small></button>')
    # Embed JSON in a type=application/json script safely by escaping closing tags.
    jsdata=json.dumps(pages,ensure_ascii=False).replace("<", "\\u003C").replace(">", "\\u003E")
    return f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{E(b["project"])} | Visual Pitch</title><style>{HUB_CSS}</style></head><body>
<header><div><div class="eyebrow">HCS / V1.7 / VISUAL PITCH</div><h1>{E(b["project"])} · 视觉提案</h1><p>{len(metas)} 种不同布局、字形节奏与视觉主体的实际 HTML 样稿。先看画面，再确定设计方向。</p></div><div class="eyebrow">DRAFT / NOT APPROVED<br>本地预览 · 不上传资料</div></header>
<nav role="tablist">{''.join(styles)}</nav><section class="stage"><div class="bar"><strong id="current">编辑设计方案</strong><button class="action" id="desktop">电脑预览</button><button class="action" id="mobile">手机预览</button><button class="action" id="copy">复制选择说明</button><span class="tip">真实 HTML · 可滚动 · 可截图</span></div><div class="framebox" id="framebox"><iframe id="preview" title="视觉提案预览"></iframe></div></section>
<p class="note">这是视觉评审草稿：页面文案尚未审批，素材均为内联原创矢量形状，不依赖 CDN。方向确认后还需完整观众文案审批、真实内容实现、桌面与手机视觉 QA。</p>
<script id="pitch-pages" type="application/json">{jsdata}</script>
<script>
(()=>{{const pages=JSON.parse(document.getElementById('pitch-pages').textContent);const tabs=[...document.querySelectorAll('[data-s]')];let selected='editorial';const frame=document.getElementById('preview');const box=document.getElementById('framebox');const descriptions={{editorial:'暖纸编辑式构图、原创纸张装置、静态阅读优先',signal:'电影空间构图、原生 SVG 动态轨道、精密数据排版',collision:'瑞士实验排版、强烈撞色、破格大标题'}};
function choose(id){{selected=id;frame.srcdoc=pages[id];for(const tab of tabs){{tab.setAttribute('aria-selected',String(tab.dataset.s===id));}}document.getElementById('current').textContent=({{editorial:'01 / 纸面建筑',signal:'02 / 信号空间',collision:'03 / 字体碰撞'}})[id];}}
tabs.forEach(t=>t.addEventListener('click',()=>choose(t.dataset.s)));document.getElementById('mobile').onclick=()=>box.classList.add('mobile');document.getElementById('desktop').onclick=()=>box.classList.remove('mobile');document.getElementById('copy').onclick=async()=>{{const value=`选择设计方向：${{selected}}（${{descriptions[selected]}}）。请根据我的真实附件扩展成完整作品，保留内容真实性。此为视觉选择，不代表批准任何成品文案、旁白、字幕或公开部署。`;
let ok=false;try{{await navigator.clipboard.writeText(value);ok=true}}catch(e){{const t=document.createElement('textarea');t.value=value;document.body.append(t);t.select();ok=!!document.execCommand('copy');t.remove()}}const b=document.getElementById('copy');b.textContent=ok?'已复制选择说明':'复制受限，请手动复制';setTimeout(()=>b.textContent='复制选择说明',1800);}};choose(Object.keys(pages)[0]);}})();
</script></body></html>'''

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--brief',required=True,help='JSON brief based strictly on provided material')
    ap.add_argument('--out',required=True,help='output folder (refuse to overwrite by default)')
    ap.add_argument('--force',action='store_true',help='replace our own generated files only')
    ap.add_argument('--mode',choices=('quick','studio'),default='studio',help='Quick=2, Studio=3 visual reference directions')
    ap.add_argument('--style',choices=tuple(RENDER),help='render just this specific direction; overrides mode')
    args=ap.parse_args()
    brief=validate(json.loads(pathlib.Path(args.brief).read_text(encoding='utf8')))
    out=pathlib.Path(args.out).resolve()
    if out.exists() and any(out.iterdir()) and not args.force:
        raise SystemExit('目标目录非空；请换目录或使用 --force（只覆盖同名生成文件）')
    out.mkdir(parents=True,exist_ok=True)
    directions=choose_directions(args.mode,args.style)
    pages={d['id']:RENDER[d['id']](brief) for d in directions}
    for id,blob in pages.items(): (out/f'{id}.html').write_text(blob,encoding='utf8')
    (out/'index.html').write_text(make_hub(brief,pages,directions),encoding='utf8')
    manifest={'version':'1.8.0-dev.1','mode':args.mode,'project':brief['project'],'status':'pitch_unapproved','user_selection':None,
              'input_source':'brief provided by creator; no independent fact verification',
              'directions':[dict(d,filename=f'{d["id"]}.html') for d in directions],
              'approval_notice':'选择视觉方向不等于确认文案或批准对外发布',
              'generated_files':['index.html']+[f'{d["id"]}.html' for d in directions]}
    (out/'pitch-manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False),encoding='utf8')
    print(json.dumps({'status':'PASS','out':str(out),'files':manifest['generated_files']},ensure_ascii=False))
if __name__=='__main__':
    main()
