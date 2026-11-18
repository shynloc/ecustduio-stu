#!/usr/bin/env python3
"""Render and inspect the standalone HTML master with local Chromium/Playwright."""
import argparse,json,pathlib,sys
try:
 from playwright.sync_api import sync_playwright
except ImportError:
 print('SKIP: Python playwright not installed. pip install playwright; playwright install chromium');sys.exit(2)

def smoke(html,out):
    out=pathlib.Path(out);out.mkdir(parents=True,exist_ok=True)
    errors=[];result={'status':'PASS','scenes':[],'errors':errors}
    with sync_playwright() as p:
        b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=b.new_page(viewport={'width':1440,'height':900},device_scale_factor=1)
        page.on('pageerror',lambda e: errors.append(str(e)))
        page.set_content(pathlib.Path(html).read_text(encoding='utf8'),wait_until='domcontentloaded')
        if not page.evaluate('Boolean(window.HCS)'):errors.append('Window HCS renderer missing')
        frames=[60,240,420,600,780,960]
        for idx,frame in enumerate(frames,1):
            page.evaluate('(f)=>window.HCS.renderAtFrame(f)',frame)
            visible=page.locator('.scene').evaluate_all('(xs)=>xs.filter(x=>Number(getComputedStyle(x).opacity)>.9).map(x=>x.dataset.scene)')
            if visible!=[f'S{idx:02d}']:errors.append(f'Frame {frame} wrong visible scene: {visible}')
            file=out/f'landscape-S{idx:02d}.png';page.screenshot(path=str(file))
            result['scenes'].append({'frame':frame,'visible':visible,'screenshot':file.name})
        page.evaluate('(f)=>window.HCS.renderAtFrame(f)',420)
        page.locator('#portrait').check()
        metrics=page.evaluate('()=>({width:document.querySelector(".stage").offsetWidth,height:document.querySelector(".stage").offsetHeight})')
        if metrics!={'width':1080,'height':1920}:errors.append(f'Portrait dimensions incorrect: {metrics}')
        page.screenshot(path=str(out/'portrait-S03.png'))
        page.locator('.scene-2 [data-review-id="director.title"]').click(force=True)
        chosen=page.locator('#selected').inner_text()
        if 'director.title' not in chosen:errors.append(f'Precision locator incorrect: {chosen}')
        page.evaluate('(f)=>window.HCS.renderAtFrame(f)',420)
        repeat1=page.locator('#frameStyles').inner_text()
        page.evaluate('(f)=>window.HCS.renderAtFrame(f)',420)
        repeat2=page.locator('#frameStyles').inner_text()
        if repeat1!=repeat2:errors.append('Frame CSS not deterministic')
        b.close()
    result['status']='FAIL' if errors else 'PASS';result['portrait']=metrics;result['precisionLocator']=chosen
    (out/'visual-smoke.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
    return result
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--html',required=True);p.add_argument('--out',default='qa/browser');a=p.parse_args()
    r=smoke(a.html,a.out);print(json.dumps(r,ensure_ascii=False,indent=2));sys.exit(0 if r['status']=='PASS' else 1)
