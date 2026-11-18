#!/usr/bin/env python3
"""Build a portable offline, frame-seekable HTML visual master from existing assets."""
import argparse, json, pathlib, re, sys
from validate_master import validate
from resolve_content import from_source

def build(source, output, production=False):
    source=pathlib.Path(source).resolve();output=pathlib.Path(output).resolve()
    if production:
        from lint_audience_copy import check as check_copy
        copy_quality=check_copy(source,'production')
        if copy_quality['status']!='PASS':
            raise ValueError('Audience copy approval gate FAILED: '+str(copy_quality['errors']))

    quality=validate(source)
    if quality['status']!='PASS':raise ValueError('Visual master failed validation: '+str(quality['errors']))
    contract=source/'visual-master'
    data={key:json.loads((contract/(key+'.json')).read_text(encoding='utf8')) for key in ('timeline','storyboard','design-tokens')}
    markup=from_source(source,(source/'stage'/'stage-markup.html').read_text(encoding='utf8'))
    css=(source/'stage'/'stage.css').read_text(encoding='utf8')
    has_portrait=(source/'stage'/'portrait.css').exists()
    pc=(source/'stage'/'portrait.css').read_text(encoding='utf8') if has_portrait else ''
    engine=(pathlib.Path(__file__).resolve().parent.parent/'shared'/'frame-styles.mjs').read_text(encoding='utf8')
    engine=re.sub(r'^export (?=(const|function))','',engine, flags=re.M)
    t=data['timeline'];duration=t['durationFrames'];fps=t['fps']
    preset='hcs-brand-pilot' if (source/'stage'/'hcs-brand.preset').exists() else 'generic'
    controller='''
const DATA=__DATA__;
const timeline=DATA.timeline, tokens=DATA['design-tokens'], storyboard=DATA.storyboard;
const stage=document.getElementById('stage'), stageRoot=document.getElementById('stageRoot');
const styleEl=document.getElementById('frameStyles'), slider=document.getElementById('frame'),timecode=document.getElementById('timecode');
const preset=__PRESET__;
const fps=timeline.fps, duration=timeline.durationFrames;
const portrait=document.getElementById('portrait');
let currentFrame=0,playing=false,playBase=0,playFrame=0;
function layout(){const vertical=portrait.checked;stageRoot.classList.toggle('hcs-portrait',vertical);
 const vp=tokens.viewport, portraitSize=vp.portrait||{width:1080,height:1920};
 const w=vertical?portraitSize.width:vp.width,h=vertical?portraitSize.height:vp.height;const holder=document.getElementById('holder');
 const available=Math.max(200,window.innerWidth-28), vh=Math.max(200,window.innerHeight-190);
 const scale=Math.min(available/w,vh/h);stageRoot.style.width=(w*scale)+'px';stageRoot.style.height=(h*scale)+'px';
 stage.style.transform='scale('+scale+')';document.getElementById('profile').textContent=vertical?'PORTRAIT / 9:16':'LANDSCAPE / 16:9';}
function seek(requested){currentFrame=clamp(Math.round(requested),0,duration-1);
 styleEl.textContent=frameCSS(currentFrame,timeline,storyboard,tokens,preset);
 stage.setAttribute('data-theme',sceneAtFrame(currentFrame,timeline).visualMode);
 const scene=sceneAtFrame(currentFrame,timeline),index=timeline.scenes.indexOf(scene)+1;
 document.getElementById('stageCurrent').textContent=String(index).padStart(2,'0');
 const sec=Math.floor(currentFrame/fps);document.getElementById('stageTime').textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');
 const change=stage.querySelector('.selected-element h3');if(change && preset==='hcs-brand-pilot'){
  change.innerHTML=(currentFrame/fps>=27.75)?'BUILD <b>REMARKABLE.</b>':'BUILD <b>BEAUTIFUL.</b>';
 }
 slider.value=currentFrame;timecode.textContent=(currentFrame/fps).toFixed(2)+'s / '+(duration/fps).toFixed(2)+'s · '+scene.id+' · F'+currentFrame;
 window.__hcs_frame=currentFrame;return currentFrame;}
window.HCS={renderAtFrame:seek,getFrame:()=>currentFrame,FPS:fps,END_FRAME:duration-1};
function pause(){playing=false;document.getElementById('play').textContent='▶ 播放'}
function tick(now){if(!playing)return;seek(playFrame+Math.floor((now-playBase)/1000*fps));if(currentFrame>=duration-1){pause();return}requestAnimationFrame(tick)}
function play(){if(playing){pause();return}playing=true;playFrame=currentFrame;playBase=performance.now();document.getElementById('play').textContent='Ⅱ 暂停';requestAnimationFrame(tick)}
document.getElementById('play').onclick=play;slider.oninput=()=>{pause();seek(Number(slider.value))};portrait.onchange=layout;
document.getElementById('prev').onclick=()=>{pause();seek(currentFrame-1)};document.getElementById('next').onclick=()=>{pause();seek(currentFrame+1)};
window.addEventListener('resize',layout);
window.addEventListener('keydown',e=>{if(e.target.matches('input,textarea'))return;if(e.code==='Space'){e.preventDefault();play()}if(e.code==='ArrowRight'){pause();seek(currentFrame+1)}if(e.code==='ArrowLeft'){pause();seek(currentFrame-1)}});
// Frame-accurate review locator. Does not mutate production source.
let selected=null;stage.addEventListener('click',e=>{const node=e.target.closest('[data-review-id]');if(!node)return;
 const scene=node.closest('[data-scene]');selected={sceneId:scene?.getAttribute('data-scene'),elementId:node.dataset.reviewId,frame:currentFrame,profile:portrait.checked?((tokens.viewport.portrait?.width??1080)+'x'+(tokens.viewport.portrait?.height??1920)):(tokens.viewport.width+'x'+tokens.viewport.height)};
 document.getElementById('selected').textContent=selected.sceneId+' / '+selected.elementId+' · F'+selected.frame;
});
document.getElementById('copy').onclick=async()=>{if(!selected){alert('请先点选画面元素');return}
 const text='【HTML Creator Studio v1.4 / 精准视频改稿】\\n场景：'+selected.sceneId+'\\n元素：'+selected.elementId+'\\n帧号：'+currentFrame+' / '+duration+'（'+(currentFrame/fps).toFixed(3)+' 秒）\\n画幅：'+selected.profile+'\\n修改要求：'+(document.getElementById('note').value.trim()||'请询问我想如何调整')+'\\n变更规则：仅调整目标和明确关联的轨道；同步更新母版、HTML预览和Remotion；比较修改前后相同帧，不改变其他内容。';
 try{await navigator.clipboard.writeText(text);document.getElementById('copy').textContent='已复制 ✓'}catch(e){const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();document.getElementById('copy').textContent='已复制 ✓'}
 setTimeout(()=>document.getElementById('copy').textContent='复制精准改稿指令',1700);
};
layout();seek(0);'''
    controller=controller.replace('__DATA__',json.dumps(data,ensure_ascii=False,separators=(',',':')).replace('</','<\\/')).replace('__PRESET__',json.dumps(preset))
    html='''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HTML Creator Studio v1.5 | Video Ready (Preview)</title>
<style>__STAGE_CSS__\n__PORTRAIT_CSS__</style><style>
*{box-sizing:border-box}body{margin:0;background:#E7EAF0;color:#101C31;font-family:system-ui,"Microsoft Yahei",sans-serif}.bar{padding:13px max(14px,4vw);display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap}.brand{font-weight:900;letter-spacing:-.02em}.tag{color:#69778d;font:600 12px monospace}.workspace{display:grid;place-items:center;min-height:160px}#stageRoot{position:relative;overflow:hidden;box-shadow:0 30px 80px #29384d30;border-radius:7px}.control{background:white;padding:14px 18px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:8px auto;max-width:1220px;border:1px solid #d3d9e7;border-radius:12px}button{border:1px solid #ccd6e4;padding:10px 14px;cursor:pointer;background:#f8fafc;border-radius:8px;font-weight:700}button:hover{background:#e9efff}button.primary{background:#2d58ed;color:white;border-color:#2d58ed}#frame{flex:1 1 260px;accent-color:#315dff}.review{max-width:1220px;margin:12px auto 18px;padding:13px 18px;background:white;border:1px solid #d3d9e7;border-radius:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}.review textarea{flex:1 1 360px;min-height:44px;border:1px solid #c7d0df;border-radius:7px;padding:10px}.review small{color:#6a788e}#stage .scene{pointer-events:auto}#stage [data-review-id]{cursor:crosshair}#stage [data-review-id]:hover{outline:4px solid #F07A50;outline-offset:5px}
@media(max-width:650px){.bar{gap:5px}.tag{font-size:9px}.control,.review{margin:8px 10px}.review button{width:100%}}</style></head><body>
<div class="bar"><div class="brand">HCS / VIDEO READY <span class="tag">v1.4</span></div><div class="tag">SHARED FRAME ENGINE · HTML / REMOTION</div><div id="profile" class="tag">LANDSCAPE / 16:9</div></div>
<div class="workspace" id="holder"><div id="stageRoot">__MARKUP__</div></div>
<div class="control"><button class="primary" id="play">▶ 播放</button><button id="prev" title="上一帧">← 帧</button><button id="next" title="下一帧">帧 →</button><input type="range" id="frame" min="0" max="__MAX__" value="0" step="1" aria-label="视频帧定位"><span class="tag" id="timecode">00:00</span><label class="tag"><input type="checkbox" id="portrait"> 9:16 竖版</label></div>
<div class="review"><span class="tag" id="selected">点击画面对象，开始定位改稿</span><textarea id="note" placeholder="例如：第 12 秒的蓝色标题小一点，进场再慢 0.3 秒，其余保持不变"></textarea><button class="primary" id="copy">复制精准改稿指令</button><small>仅生成指令；需由 AI 修改源文件</small></div>
<style id="frameStyles"></style><script>__ENGINE__\n__CONTROLLER__</script></body></html>'''
    if not has_portrait:
        html=html.replace('<label class="tag"><input type="checkbox" id="portrait"> 9:16 竖版</label>', '<label class="tag" hidden><input type="checkbox" id="portrait"> 9:16 竖版（未配置）</label>')
    html=html.replace('__STAGE_CSS__',css.replace('</style','<\\/style')).replace('__PORTRAIT_CSS__',pc.replace('</style','<\\/style')).replace('__MARKUP__',markup).replace('__MAX__',str(duration-1)).replace('__ENGINE__',engine.replace('</script','<\\/script')).replace('__CONTROLLER__',controller.replace('</script','<\\/script'))
    output.parent.mkdir(parents=True,exist_ok=True);output.write_text(html,encoding='utf8');return output
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--out',required=True);p.add_argument('--production',action='store_true',help='Require actual user-approved audience copy');a=p.parse_args()
    print('Created:',build(a.source,a.out,production=a.production))
    if not a.production: print('NOTICE: PREVIEW only. Unapproved audience copy must not be published as final work.')
