# Personal Design DNA · v1.8 离线样例（完全虚构）

本目录仅用于测试**流程与文件结构**。三个 Profile、简历林舟、用户确认记录、艺术指导、审美证据均属虚构 Fixture。没有进行真实图片理解、用户审美验证或正式部署。

## 浏览样稿

直接在本地打开 `rendered/standalone-preview.html`，**单文件包含三套虚构简历站**，可切换审美、桌面/手机预览，并可下载当前单页 HTML。也可在解压后打开 `rendered/index.html`，或分别打开 `rendered/precision-resume.html`、`warm-resume.html`、`quiet-resume.html`。文件是试验展示壳，其 iframe 内的页面必须单独检查。

## 可复现命令（在 Skill 根目录运行）

```bash
python scripts/beta_doctor.py --run-tests
python scripts/design_dna.py check-intake --intake examples/personal-dna-pilot/intake-blocked.json
# 预期 BLOCKED，退出码 2：未上传完成、未实际看图、未收到开始分析

python scripts/design_dna.py check-intake --intake examples/personal-dna-pilot/intake-text-ready.json
# 预期 READY：纯文字来源且用户已明确要求分析

python scripts/extract_resume.py \
  --input examples/personal-dna-pilot/fictional-resume.md \
  --out /tmp/hcs-v18-fictional-resume-evidence.json
# 只提取原文，不会自动变成已核实的履历或允许公开的个人网站

python scripts/design_dna.py validate --profile examples/personal-dna-pilot/precision-profile.json
python scripts/project_art_direction.py \
  --profile examples/personal-dna-pilot/precision-profile.json \
  --brief examples/personal-dna-pilot/brief-resume.json \
  --out /tmp/hcs-v18-precision-direction.json
python scripts/build_resume_site.py \
  --resume examples/personal-dna-pilot/fictional-resume.json \
  --profile examples/personal-dna-pilot/precision-profile.json \
  --direction /tmp/hcs-v18-precision-direction.json \
  --out /tmp/hcs-v18-precision-resume.html

python scripts/visual_qa.py \
  --cases examples/personal-dna-pilot/qa-cases.json \
  --out /tmp/hcs-v18-browser-qa
```

要重新生成单文件展示页：

`python scripts/build_dna_standalone_preview.py --hub examples/personal-dna-pilot/rendered/index.html --out /tmp/hcs-v18-standalone-preview.html`

`visual_qa.py` 需要真实可启动的 Chromium。输出 PASS/REVIEW/FAIL/BLOCKED 和截图；Chromium 安全限制禁止启动时，必须报告 BLOCKED，而不能把结构测试当作视觉验收。

## 现实世界仍需验收

1. 真人上传多张参考图、核对可见性、说“上传完成”与“开始分析”；实际有视觉能力的 Agent 描述局部审美，**不得凭文件名**确认。
2. 用户逐项确认/拒绝审美信号，回看长期档案是否符合本人品味。负向偏好、项目临时决定和长期修改必须隔离。
3. 从真实 DOCX、PDF（包含表格或扫描件）抽取事实，检查地址和私人联系人在 HTML、元信息和源码中均未泄露。
4. 对同一资料实做不同构图、字体、素材与交互的 HTML，不拿四种演示结构代替内容创意。
5. 真浏览器桌面+手机截图、键盘/触摸导航及外链检查，再决定能否进入公测。
