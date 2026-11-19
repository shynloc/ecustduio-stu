// Offline reader for the proposal. This does not build or change the product UI.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import AdmZip from 'adm-zip';

const source = dirname(fileURLToPath(import.meta.url));
const root = resolve(source, '../..');
const out = process.argv[2] ? resolve(process.argv[2]) : join(root, '.artifacts/experience-plan-2026-11-19');
mkdirSync(out, { recursive: true });
const entries = [
  { file: '2026-11-19-experience-redesign.md', stem: 'EcuStudio-全面体验整改方案', title: '全面体验整改方案', caption: '产品与交互设计', number: '01' },
  { file: '2026-11-19-experience-implementation.md', stem: 'EcuStudio-整改实施与验收计划', title: '整改实施与验收计划', caption: '工程任务与审计记录', number: '02' },
];
const esc = value => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const css = `
:root{--bg:#f2f1eb;--paper:#fffefb;--ink:#223e35;--muted:#66796f;--line:#d7dfd6;--accent:#285b49;--soft:#e7eee3;--warm:#a3753e;--code:#1d3930;color-scheme:light}
:root[data-theme=dark]{--bg:#111722;--paper:#182132;--ink:#ecf2f8;--muted:#a5b8ca;--line:#314254;--accent:#a3dfcf;--soft:#223447;--warm:#dfbb82;--code:#0d1420;color-scheme:dark}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:28px}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.85 system-ui,'Microsoft YaHei','PingFang SC',sans-serif}a{color:var(--accent);text-underline-offset:4px;overflow-wrap:anywhere}button{font:inherit;cursor:pointer}button:focus-visible,a:focus-visible{outline:3px solid var(--warm);outline-offset:4px}button,a{touch-action:manipulation}.shell{max-width:1440px;margin:auto;padding:0 42px}.top{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-top:25px}.brand{font-weight:750;font-size:19px;letter-spacing:.2px}.top small{color:var(--muted)}.pill{font-size:12px;background:var(--soft);padding:5px 12px;border-radius:30px;display:inline-block;color:var(--accent)}.hero{display:grid;grid-template-columns:1.35fr 1fr;gap:50px;padding:48px 0 30px;align-items:center}.eyebrow{color:var(--warm);font-size:12px;font-weight:700;letter-spacing:2px}h1{font-size:clamp(32px,3.6vw,49px);line-height:1.25;letter-spacing:-1px;margin:18px 0}.lead{font-size:19px;color:var(--muted);max-width:690px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:26px}.actions a,.actions button,.theme{border:1px solid var(--line);border-radius:9px;background:var(--paper);color:var(--accent);padding:10px 15px;text-decoration:none;font-size:14px;min-height:44px}.actions .primary{background:var(--accent);color:var(--bg);border-color:var(--accent)}.meta{font-size:13px;color:var(--muted);margin-top:15px}.scene{height:290px;position:relative;perspective:1000px;isolation:isolate}.scene:before{content:'';position:absolute;inset:5% 0;border-radius:50%;background:radial-gradient(ellipse,var(--soft),transparent 70%)}.stage{position:absolute;inset:25px 10px;transform-style:preserve-3d;transform:rotateX(15deg) rotateY(-22deg);animation:float 7s ease-in-out infinite}.plate{position:absolute;width:210px;height:130px;border:1px solid var(--line);background:var(--paper);border-radius:18px;box-shadow:0 22px 30px #0000000d;padding:18px 24px;transition:transform .3s;transform-style:preserve-3d;display:flex;flex-direction:column;text-decoration:none}.plate b{font-size:24px}.plate span{font-size:12px;color:var(--muted)}.plate em{font-style:normal;font-size:10px;color:var(--warm);letter-spacing:2px}.plate:nth-child(1){top:0;left:0;transform:translateZ(-30px)}.plate:nth-child(2){top:55px;left:65px;transform:translateZ(25px)}.plate:nth-child(3){top:110px;left:130px;transform:translateZ(80px)}.plate:hover{transform:translateZ(110px) translateY(-7px)}.scene-note{position:absolute;bottom:-15px;left:0;right:0;text-align:center;color:var(--muted);font-size:11px}.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:24px 0 30px}.summary>div{padding:18px;border:1px solid var(--line);border-radius:12px;background:var(--paper)}.summary b{font-size:18px;display:block}.summary span{font-size:13px;color:var(--muted)}.layout{display:grid;grid-template-columns:230px minmax(0,1fr);gap:30px;align-items:start;padding-bottom:50px}.toc{position:sticky;top:22px;max-height:92vh;overflow:auto;padding-right:8px}.toc strong{display:block;color:var(--warm);font-size:12px;letter-spacing:2px;margin:4px 0 14px}.toc a{display:block;padding:8px 0;border-bottom:1px solid var(--line);text-decoration:none;font-size:13px;color:var(--muted);line-height:1.6}.toc a:hover{color:var(--accent)}article{min-width:0;background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:36px 40px}article>h1{font-size:28px;margin:0 0 20px;letter-spacing:0}h2{font-size:24px;line-height:1.5;border-top:1px solid var(--line);padding-top:28px;margin:42px 0 20px}h3{font-size:19px;margin:25px 0 12px;line-height:1.6}p,li{overflow-wrap:anywhere}li+li{margin-top:8px}ul,ol{padding-left:25px}blockquote{margin:24px 0;border-left:3px solid var(--warm);background:var(--soft);padding:10px 20px}.table-wrap{overflow:auto;max-width:100%;margin:24px 0;border-radius:8px;border:1px solid var(--line)}table{border-collapse:collapse;width:100%;font-size:14px;min-width:620px}th,td{padding:13px 15px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top;line-height:1.8}th{background:var(--soft);white-space:nowrap}tr:last-child td{border-bottom:0}td+td,th+th{border-left:1px solid var(--line)}code{background:var(--soft);padding:2px 5px;border-radius:4px;font-size:.85em;overflow-wrap:anywhere}pre{background:var(--code);color:#e7f0eb;padding:22px;border-radius:10px;overflow:auto;line-height:1.65;font-size:13px}pre code{background:transparent;padding:0;color:inherit;white-space:pre}footer{padding:5px 0 35px;color:var(--muted);font-size:13px}.no-motion .stage{animation:none}.no-motion *{scroll-behavior:auto!important}.no-motion .plate{transition:none}
@keyframes float{0%,100%{transform:rotateX(15deg) rotateY(-22deg) translateY(0)}50%{transform:rotateX(11deg) rotateY(-14deg) translateY(-9px)}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.stage{animation:none}.plate{transition:none}}
@media(max-width:1080px){.shell{padding:0 25px}.hero{gap:16px}.stage{scale:.85;transform-origin:30% 50%}.layout{grid-template-columns:185px minmax(0,1fr);gap:20px}article{padding:27px}.summary{gap:9px}.summary>div{padding:14px}}
@media(max-width:760px){.shell{padding:0 18px}.top small{display:none}.hero{grid-template-columns:1fr;padding-top:30px;gap:12px}.scene{height:240px;max-width:390px;width:100%;margin:auto}.stage{scale:.8;inset:0 0 25px;transform-origin:center}.scene-note{bottom:0}.lead{font-size:17px}.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.summary b{font-size:16px}.layout{grid-template-columns:minmax(0,1fr)}.toc{position:static;max-height:230px;padding:12px 16px;border:1px solid var(--line);border-radius:10px}.toc strong{margin-bottom:4px}.toc a{font-size:13px;padding:7px 0}.layout article{padding:22px 18px}article>h1{font-size:24px}h2{font-size:21px}.actions{gap:8px}.actions a,.actions button{font-size:13px;padding:9px 11px}.table-wrap{margin:18px 0}table{font-size:13px}.meta{font-size:12px}}
@media print{html{scroll-behavior:auto}body{background:white;color:#182b24;font-size:10pt}.shell{padding:0;max-width:none}.hero{display:block;padding:0}.scene,.top,.summary,.toc,.actions{display:none}.lead{font-size:12pt}.layout{display:block;padding:0}article{border:0;padding:0;border-radius:0}h1{font-size:25pt}h2{font-size:17pt;break-after:avoid}.table-wrap{overflow:visible}table{min-width:0;font-size:9pt}pre{white-space:pre-wrap;overflow:visible;background:#eef2ed;color:#222}pre code{white-space:pre-wrap}.plate{animation:none}footer{padding-top:15px}@page{size:A4;margin:16mm}}
`;

for (const entry of entries) {
  let md = readFileSync(join(source, entry.file), 'utf8');
  let body = sanitizeHtml(marked.parse(md), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2']),
    allowedAttributes: { a: ['href', 'title'], code: ['class'] },
    allowedSchemes: ['http', 'https'],
  });
  for (const other of entries) body = body.replaceAll(`href="${other.file}"`, `href="${other.stem}.html"`);
  const headings = [];
  body = body.replace(/<h2>([\s\S]*?)<\/h2>/g, (_, label) => {
    const id = `section-${headings.length + 1}`;
    headings.push({ id, label: label.replace(/<[^>]*>/g, '') });
    return `<h2 id="${id}">${label}</h2>`;
  });
  body = body.replaceAll('<table>', '<div class="table-wrap"><table>').replaceAll('</table>', '</table></div>');
  const other = entries.find(item => item !== entry);
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EcuStudio · ${entry.title}</title><style>${css}</style></head>
<body><div class="shell"><div class="top"><div class="brand">EcuStudio <small>教创工作台</small></div><button class="theme" id="theme" aria-pressed="false">切换为曜石阅读</button></div>
<header class="hero"><div><div class="eyebrow">EXPERIENCE REDESIGN · ${entry.number} / 02</div><h1>${entry.title}</h1><p class="lead">输入资料，积累知识，交付作品。<br>把每一步变得直观，让创作能够自然继续。</p><span class="pill">2026.11.19 · ${entry.caption} · 待实施</span><div class="actions"><a class="primary" href="#section-1">开始阅读</a><a href="${other.stem}.html">${other.title}</a><button id="print">打印 / 保存 PDF</button><button id="motion" aria-pressed="false">暂停示意动画</button></div><p class="meta">本次交付方案与审计，不修改工作台运行程序。<br>源码审计基线 7834f5d；17 项针对性测试通过。</p></div>
<div class="scene" aria-label="输入、知识、作品的立体关系示意"><div class="stage"><a class="plate" href="#section-1"><em>01 / INPUT</em><b>放入资料</b><span>网址 · 文档 · 图片 · 录音</span></a><a class="plate" href="#section-1"><em>02 / KNOWLEDGE</em><b>积累知识</b><span>阅读 · 整理 · 检索 · 对话</span></a><a class="plate" href="#section-1"><em>03 / CREATE</em><b>交付作品</b><span>文档 · 网页 · 演示 · 音视频</span></a></div><div class="scene-note">立体关系示意 · 非产品实现与运行数据</div></div></header>
<div class="summary"><div><b>直接看见排版</b><span>全局图标工具栏 · 所见即所得</span></div><div><b>始终知道进展</b><span>可见步骤 · 中断恢复 · 明确去向</span></div><div><b>一次选入材料</b><span>多选知识 · 完整 Agent 工作区</span></div><div><b>持续完成作品</b><span>资料 / 写稿 / 作品 · 历史保留</span></div></div>
<main class="layout"><nav class="toc" aria-label="文档目录"><strong>CONTENTS / 目录</strong>${headings.map(item => `<a href="#${item.id}">${esc(item.label)}</a>`).join('')}</nav><article>${body}</article></main>
<footer>本页可离线阅读。<a href="${entry.stem}.md" download>下载 Markdown 原文件</a> · 阅读版不加载外部字体、脚本或服务。</footer></div>
<script>const theme=document.getElementById('theme');theme.addEventListener('click',()=>{const dark=document.documentElement.dataset.theme!=='dark';document.documentElement.dataset.theme=dark?'dark':'light';theme.setAttribute('aria-pressed',String(dark));theme.textContent=dark?'切换为书院阅读':'切换为曜石阅读';});document.getElementById('print').addEventListener('click',()=>window.print());const motion=document.getElementById('motion');motion.addEventListener('click',()=>{const paused=document.documentElement.classList.toggle('no-motion');motion.setAttribute('aria-pressed',String(paused));motion.textContent=paused?'播放示意动画':'暂停示意动画';});</script></body></html>`;
  writeFileSync(join(out, `${entry.stem}.html`), html, 'utf8');
  // Keep the downloadable Markdown companion links valid after using friendly names.
  for (const other of entries) md = md.replaceAll(`](${other.file})`, `](${other.stem}.md)`);
  writeFileSync(join(out, `${entry.stem}.md`), md, 'utf8');
}
const archive = new AdmZip();
for (const entry of entries) for (const ext of ['.html', '.md']) archive.addLocalFile(join(out, `${entry.stem}${ext}`));
archive.writeZip(join(out, 'EcuStudio-全面体验整改方案-2026-11-19.zip'));
console.log(JSON.stringify({ directory: out, files: entries.map(entry => `${entry.stem}.html`) }, null, 2));
