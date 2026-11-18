#!/usr/bin/env python3
"""Strict HCS v1.4 data/DOM/timing sanity checks without npm dependencies."""
import argparse,json,pathlib,re,sys
from html.parser import HTMLParser

class DOMParser(HTMLParser):
    def __init__(self):super().__init__();self.reviews=[];self.scenes=[];self.scene_classes={};self.stages=0;self.externals=[];self.handlers=[];self.unsafe_urls=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'data-review-id' in a:self.reviews.append(a['data-review-id'])
        if a.get('id')=='stage':self.stages+=1
        if 'data-scene' in a:
            self.scenes.append(a['data-scene']);self.scene_classes[a['data-scene']]=a.get('class','').split()
        if tag in ('script','iframe') or tag=='link':self.externals.append((tag,a))
        if any(k.lower().startswith('on') for k,v in attrs):self.handlers.append((tag,a))
        if any(k in ('href','src','srcdoc','formaction') and (str(v).lstrip().lower().startswith(('javascript:','data:text/html','vbscript:')) or k=='srcdoc') for k,v in attrs):self.unsafe_urls.append((tag,a))

def validate(source):
    src=pathlib.Path(source)
    directory=src/'visual-master'
    names=['timeline','storyboard','design-tokens','content','approval','source-map']
    objects={name:json.loads((directory/(name+'.json')).read_text(encoding='utf8')) for name in names}
    tl=objects['timeline'];sb=objects['storyboard'];tokens=objects['design-tokens']
    html=(src/'stage'/'stage-markup.html').read_text(encoding='utf8')
    css=(src/'stage'/'stage.css').read_text(encoding='utf8')
    dom=DOMParser();dom.feed(html)
    errors=[];warnings=[]
    def check(ok,msg):
        if not ok:errors.append(msg)
    fps=tl.get('fps',0);total=tl.get('durationFrames',0)
    check(isinstance(fps,int) and fps>0,'fps must be positive integer')
    check(isinstance(total,int) and total>0,'durationFrames must be positive integer')
    check(fps==tokens.get('viewport',{}).get('fps'),'FPS disagrees with tokens')
    check(total==tokens.get('viewport',{}).get('durationFrames'),'duration differs from tokens')
    check(sb.get('durationFrames')==total,'Storyboard duration mismatch')
    check(sb.get('fps')==fps,'Storyboard fps mismatch')
    scenes=tl.get('scenes',[]);last=-1
    check(bool(scenes),'No scenes')
    check(dom.stages==1,'Stage markup must contain exactly one id=stage root for frame seeking')
    for i,sc in enumerate(scenes):
        sid=sc.get('id','?');start=sc.get('startFrame',-1);end=sc.get('endFrame',-1)
        check(start==last+1,f'{sid} timeline gap/overlap: start {start} expected {last+1}')
        check(end>=start,f'{sid} end frame earlier than start frame')
        last=end
        check(sid in dom.scenes,f'{sid} absent in stage markup')
        check(('scene-'+str(i)) in dom.scene_classes.get(sid,[]),f'{sid} DOM class must include scene-{i} for frame renderer')
        if i>0:check(sc.get('visualMode') in ('paper','night'),f'{sid} visual mode invalid')
    check(last==total-1,f'timeline end {last} != duration-1 {total-1}')
    check(len(scenes)==len(sb.get('scenes',[])),'Storyboard count mismatches timeline')
    check(len(set(dom.reviews))==len(dom.reviews),'Duplicate data-review-id in stage markup')
    check(len(set(dom.scenes))==len(dom.scenes),'Duplicate data-scene in stage markup')
    check(not dom.externals,'Stage markup cannot contain external script/iframe/link nodes')
    check(not dom.handlers,'Inline event handlers detected in stage markup')
    check(not dom.unsafe_urls,'Unsafe active URLs in stage markup')
    ids={sc.get('id') for sc in scenes};elements=set(dom.reviews)
    track_ids=set()
    supported={'opacity','translateX','translateY','rotateDeg','scale','progress','strokeDashProgress'}
    allowed_easings={'linear','easeOutCubic','easeInCubic','easeInOut'}
    for track in tl.get('tracks',[]):
        scene=track.get('scene');el=track.get('element');a=track.get('animation',{})
        check(scene in ids,f'Track references missing scene: {scene}')
        check(el in elements,f'Track references missing DOM data-review-id: {el}')
        check((scene,el) not in track_ids,f'Duplicate track: {scene}/{el}')
        track_ids.add((scene,el))
        check(0<=track.get('startFrame',-1)<=track.get('endFrame',-1)<total,f'Track frame span invalid: {el}')
        check(isinstance(a.get('startFrame'),int) and isinstance(a.get('endFrame'),int),'Non-integer keyframe: '+str(el))
        if isinstance(a.get('startFrame'),int) and isinstance(a.get('endFrame'),int):
            check(0<=a['startFrame']<=a['endFrame']<total,f'Animation outside timeline: {el}')
        check(a.get('easing','easeOutCubic') in allowed_easings,f'Unknown easing: {el}')
        for role in ('from','to'):
            for key,value in a.get(role,{}).items():
                check(key in supported,f'Unsupported animation property {role}.{key}: {el}')
                check(isinstance(value,(int,float)),f'Unsupported nonnumeric {role}.{key}: {el}')
    for sc in sb.get('scenes',[]):
        check(sc.get('sceneId') in ids,f'Storyboard scene missing: {sc.get("sceneId")}')
        for el in sc.get('elementIds',[]):
            check(el in elements,f'Storyboard element missing from DOM: {el}')
    if 'animation:' in css or '@keyframes' in css:warnings.append('CSS contains autonomous animation declarations; ensure no frame-dependent state is clock-driven')
    if 'https://' in html or 'http://' in html:warnings.append('Stage markup includes external URLs; check privacy and offline guarantees')
    approved=objects['approval'].get('user_approved_visual_master',False)
    if not approved:warnings.append('User has not approved this visual master (pilot only)')
    return {'status':'PASS' if not errors else 'FAIL','errors':errors,'warnings':warnings,'sceneCount':len(scenes),'trackCount':len(tl.get('tracks',[])),'uniqueReviewIds':len(elements),'fps':fps,'durationFrames':total,'durationSeconds':round(total/fps,3) if fps else None,'approved':approved}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--out',default='');a=p.parse_args()
    result=validate(a.source);print(json.dumps(result,ensure_ascii=False,indent=2))
    if a.out:pathlib.Path(a.out).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
    sys.exit(0 if result['status']=='PASS' else 1)
