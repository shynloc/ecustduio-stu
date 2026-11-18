#!/usr/bin/env python3
"""Screenshot-backed visual QA for local HTML, video frames and layout states.

Browser checks can identify concrete regressions, not independently grade art.
Usage: python scripts/visual_qa.py --cases qa-cases.json --out qa-report-dir
Requires playwright package + a Chromium executable. Screenshots are local.
"""
from __future__ import annotations
import argparse
import json
import os
import pathlib
import sys
from urllib.parse import urlparse, unquote
import re


def read_cases(file: pathlib.Path):
    cfg=json.loads(file.read_text(encoding='utf8'))
    cases=cfg.get('cases',[])
    if not cases or not isinstance(cases,list):
        raise ValueError('cases JSON 必须包含非空的 cases 数组')
    out=[]
    for c in cases:
        if not isinstance(c,dict) or not c.get('id') or not (c.get('path') or c.get('url')):
            raise ValueError('每个 case 至少含 id 和 path 或 url')
        if not str(c['id']).replace('-','').replace('_','').isalnum():
            raise ValueError('case id 只能含字母数字、-、_')
        u=c.get('url')
        if not u:
            raw=pathlib.Path(c['path'])
            u=(raw if raw.is_absolute() else file.parent/raw).resolve().as_uri()
        elif not urlparse(u).scheme:
            raise ValueError('url 必须是完整 URL；相对本地文件请使用 path')
        w=int(c.get('width',1440));h=int(c.get('height',900))
        if not 250 <= w <= 3840 or not 250 <= h <= 3840:
            raise ValueError('viewport 尺寸不合理')
        out.append(dict(c,id=str(c['id']),url=u,width=w,height=h))
    return out

MEASURE_JS=r'''() => {
 const vw=window.innerWidth;
 const root=document.documentElement;
 const findVisible=(el)=>{
   const s=getComputedStyle(el),r=el.getBoundingClientRect();
   if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0||r.width<1||r.height<1) return false;
   return true;
 };
 const all=[...document.querySelectorAll('h1,h2,h3,p,button,a,[data-qa-important]')].filter(findVisible);
 const clipped=[], offscreen=[], tiny=[];
 for(const el of all){
   const r=el.getBoundingClientRect(),s=getComputedStyle(el),text=(el.innerText||el.textContent||'').trim();
   if(!text || text.length<3)continue;
   if((s.overflowY==='hidden'||s.overflowY==='clip'||s.textOverflow==='ellipsis') && el.scrollHeight>el.clientHeight+4 && text.length>16)clipped.push({element:el.tagName,text:text.slice(0,45),by:el.scrollHeight-el.clientHeight});
   if((r.right<0||r.left>vw+4) && s.position!=='fixed' && text.length>10)offscreen.push({element:el.tagName,text:text.slice(0,45)});
   if(parseFloat(s.fontSize)<12 && text.length>42)tiny.push({element:el.tagName,px:parseFloat(s.fontSize),text:text.slice(0,45)});
 }
 const badImages=[...document.images].filter(im=>findVisible(im)&&im.complete&&im.naturalWidth===0).map(im=>im.getAttribute('src')||'[inline]');
 const headings=[...document.querySelectorAll('h1,h2,h3')].filter(findVisible).map(x=>({tag:x.tagName,content:(x.innerText||'').slice(0,75),size:getComputedStyle(x).fontSize}));
 return {url:location.href,width:vw,height:innerHeight,scroll_width:root.scrollWidth,
 horizontal_overflow_px:Math.max(0,root.scrollWidth-vw),bad_images:badImages,
 clipped:clipped.slice(0,15),offscreen:offscreen.slice(0,15),tiny_body_text:tiny.slice(0,15),headings};
}'''

def compare_png(current: pathlib.Path, baseline: pathlib.Path, out: pathlib.Path):
    try:
        from PIL import Image, ImageChops, ImageStat
    except ImportError:
        return {'status':'SKIP','reason':'Pillow unavailable'}
    if not baseline.exists():
        return {'status':'SKIP','reason':'baseline does not exist'}
    a=Image.open(current).convert('RGB'); b=Image.open(baseline).convert('RGB')
    if a.size!=b.size:
        return {'status':'WARN','reason':f'size mismatch {a.size} vs {b.size}'}
    d=ImageChops.difference(a,b)
    stat=ImageStat.Stat(d)
    mae=sum(stat.mean)/3
    d.save(out)
    return {'status':'OK','mean_abs_pixel_delta':round(mae,3),'diff_png':out.name,
            'note':'Image difference detects change, not aesthetic quality; motion/antialiasing may cause noise.'}

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--cases',required=True)
    ap.add_argument('--out',required=True)
    ap.add_argument('--baseline-dir',help='optional pre-approved baseline screenshot directory')
    ap.add_argument('--strict',action='store_true',help='nonzero exit when any case has layout or JS errors')
    args=ap.parse_args()
    cases=read_cases(pathlib.Path(args.cases).resolve())
    out=pathlib.Path(args.out).resolve();out.mkdir(parents=True,exist_ok=True)
    from playwright.sync_api import sync_playwright
    reports=[]
    with sync_playwright() as p:
        launch={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage','--allow-file-access-from-files']}
        chromium=os.environ.get('CHROMIUM_PATH')
        if chromium:launch['executable_path']=chromium
        elif pathlib.Path('/usr/bin/chromium').exists():launch['executable_path']='/usr/bin/chromium'
        try:
            browser=p.chromium.launch(**launch)
        except Exception as exc:
            # A binary on PATH is not proof that browser sandbox policy permits
            # launching it. Return a machine-readable BLOCKED result instead
            # of presenting an unhandled traceback as a layout test failure.
            blocked={
                'status':'BLOCKED', 'totals':{'PASS':0,'REVIEW':0,'FAIL':0,'BLOCKED':len(cases)},
                'cases':[], 'browser_error':str(exc)[:2400],
                'limitations':['Browser could not launch, so no screenshots or page actions were tested.',
                               'Retry on a permitted desktop/browser environment; do not report this as PASS.']}
            (out/'visual-qa.json').write_text(json.dumps(blocked,indent=2,ensure_ascii=False),encoding='utf8')
            (out/'VISUAL-QA.md').write_text('# Visual QA · BLOCKED\n\n浏览器启动失败；尚未执行截图或页面交互检查。\n\n请在允许 Chromium 启动的环境复测。\n',encoding='utf8')
            print(json.dumps({'status':'BLOCKED','cases':len(cases),'report':str(out/'visual-qa.json')},ensure_ascii=False))
            return 2
        for case in cases:
            errors=[]
            page=browser.new_page(viewport={'width':case['width'],'height':case['height']},device_scale_factor=1,
                                  reduced_motion='reduce' if case.get('reduce_motion',True) else 'no-preference')
            page.on('pageerror',lambda error, arr=errors:arr.append(f'pageerror: {error}'))
            page.on('console',lambda msg, arr=errors:arr.append(f'console: {msg.text}') if msg.type=='error' else None)
            record={'id':case['id'],'url':case['url'],'viewport':[case['width'],case['height']]}
            try:
                try:
                    page.goto(case['url'],wait_until='load',timeout=25000)
                    record['capture_mode']='browser_navigation'
                except Exception as nav_error:
                    if case['url'].startswith('file:') and 'ERR_BLOCKED_BY_ADMINISTRATOR' in str(nav_error):
                        # Some managed Chromium builds refuse all file:// URLs, but
                        # still render inline HTML correctly. Reopen a clean tab;
                        # report the degraded mode rather than hiding this limitation.
                        page.close()
                        errors=[]
                        page=browser.new_page(viewport={'width':case['width'],'height':case['height']},device_scale_factor=1,
                            reduced_motion='reduce' if case.get('reduce_motion',True) else 'no-preference')
                        page.on('pageerror',lambda error, arr=errors:arr.append(f'pageerror: {error}'))
                        page.on('console',lambda msg, arr=errors:arr.append(f'console: {msg.text}') if msg.type=='error' else None)
                        f=pathlib.Path(unquote(urlparse(case['url']).path))
                        code=f.read_text(encoding='utf8')
                        page.set_content(code,wait_until='load',timeout=25000)
                        record['capture_mode']='local_inline_fallback'
                        if re.search(r'<(?:script|link|img|iframe)\b[^>]*(?:src|href)\s*=\s*["\'](?!data:|https?:|#)',code,re.I):
                            record['resource_warning']='Managed Chromium blocks file://; relative assets may not load in fallback.'
                    else:
                        raise
                page.evaluate('document.fonts.ready')
                if case.get('anchor'):
                    page.locator('#'+str(case['anchor']).lstrip('#')).scroll_into_view_if_needed(timeout=4000)
                if case.get('frame') is not None:
                    # One call shape, not arbitrary JS supplied by a config.
                    f=int(case['frame'])
                    frame_status=page.evaluate('''f=>{if(typeof window.renderAtFrame==='function'){window.renderAtFrame(f);return 'renderAtFrame'}if(typeof window.setFrame==='function'){window.setFrame(f);return 'setFrame'}if(typeof window.__renderAtFrame==='function'){window.__renderAtFrame(f);return '__renderAtFrame'}return 'unavailable'}''',f)
                    record['frame_seek']=frame_status
                page.wait_for_timeout(min(3000,int(case.get('wait_ms',180))))
                metrics=page.evaluate(MEASURE_JS)
                record.update(metrics)
                imagefile=out/(case['id']+'.png')
                page.screenshot(path=str(imagefile),full_page=bool(case.get('full_page',False)),animations='disabled')
                record['screenshot']=imagefile.name
                flags=[]
                if record['horizontal_overflow_px']>3:flags.append('HORIZONTAL_OVERFLOW')
                if record['bad_images']:flags.append('BROKEN_IMAGES')
                if record['clipped']:flags.append('CLIPPED_CONTENT_REVIEW')
                if record['tiny_body_text']:flags.append('TINY_BODY_TEXT_REVIEW')
                if errors:flags.append('BROWSER_ERRORS')
                record['flags']=flags
                record['errors']=errors
                record['status']='FAIL' if any(x in flags for x in ('HORIZONTAL_OVERFLOW','BROKEN_IMAGES','BROWSER_ERRORS')) else ('REVIEW' if flags else 'PASS')
                if args.baseline_dir:
                    bas=pathlib.Path(args.baseline_dir)/imagefile.name
                    record['pixel_comparison']=compare_png(imagefile,bas,out/(case['id']+'-diff.png'))
            except Exception as exc:
                record['status']='FAIL';record['errors']=[str(exc)]
            finally:page.close()
            reports.append(record)
        browser.close()
    total={'PASS':0,'REVIEW':0,'FAIL':0}
    for r in reports:total[r['status']]+=1
    body={'status':'FAIL' if total['FAIL'] else ('REVIEW' if total['REVIEW'] else 'PASS'),
          'totals':total,'cases':reports,
          'limitations':['Screenshot evidence does not prove artistic quality. Human direction approval required.',
                        'The script cannot verify external video engines, TTS rights or copy approvals.',
                        'On managed Chromium blocking local navigation, inline fallback does not load relative assets reliably.',
                        'Automated clip/overflow checks are heuristics; review visual screenshots.']}
    (out/'visual-qa.json').write_text(json.dumps(body,indent=2,ensure_ascii=False),encoding='utf8')
    md=['# Visual QA · 实际浏览器截图验收','',f'结果：**{body["status"]}**；PASS {total["PASS"]} / REVIEW {total["REVIEW"]} / FAIL {total["FAIL"]}。','',
        '| Case | Viewport | Result | Issues | Screenshot |','|---|---|---|---|---|']
    for r in reports:
        md.append(f'| {r["id"]} | {r["viewport"][0]}×{r["viewport"][1]} | {r["status"]} | {", ".join(r.get("flags",[])) or "—"} | {r.get("screenshot","—")} |')
    md+=['','## 必须人工审查','',
         '- 两套方案是否只是换配色？请比对真实构图、字体、素材、动效与信息密度。',
         '- 文字、数字和图表是否符合用户已批准版本？请检查来源映射。',
         '- 16:9 与 9:16 是否重新构图？字幕安全区、中文断行是否正常？',
         '- 主题素材是否为合法原创/授权资源？精细动效能否减少？',
         '- 复核 Chrome、目标浏览器和真实移动设备（如可用），修复缺陷后重测。','',
         '自动化检查不能独立判断设计是否高级，也不能替代用户对视觉与观众文案的审批。']
    (out/'VISUAL-QA.md').write_text('\n'.join(md)+'\n',encoding='utf8')
    print(json.dumps({'status':body['status'],'totals':total,'report':str(out/'visual-qa.json')},ensure_ascii=False))
    return 1 if args.strict and total['FAIL'] else 0

if __name__=='__main__':sys.exit(main())
