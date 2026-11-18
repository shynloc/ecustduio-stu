/** Node-only determinism & contract/property tests for the shared frame engine. */
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {frameCSS, valueAt, markupAtFrame, sceneAtFrame, easingValue} from '../shared/frame-styles.mjs';
const src=path.resolve(process.argv[2]||'examples/hcs-brand-pilot');
const load=(name)=>JSON.parse(fs.readFileSync(path.join(src,'visual-master',name+'.json'),'utf8'));
const timeline=load('timeline'),storyboard=load('storyboard'),tokens=load('design-tokens');
const markup=fs.readFileSync(path.join(src,'stage','stage-markup.html'),'utf8');
const preset=fs.existsSync(path.join(src,'stage','hcs-brand.preset'))?'hcs-brand-pilot':'generic';
let checks=0;
const assert=(okay,message)=>{checks++;if(!okay)throw new Error(message)};
assert(easingValue('linear',0.5)===0.5,'Linear easing incorrect');
for(let frame=0;frame<timeline.durationFrames;frame+=11){
 const c=frameCSS(frame,timeline,storyboard,tokens,preset);
 assert(c===frameCSS(frame,timeline,storyboard,tokens,preset),`Nondeterministic CSS @${frame}`);
 assert(!/NaN|undefined/.test(c),`Invalid CSS @${frame}`);
 assert(sceneAtFrame(frame,timeline).id.startsWith('S'),'No scene');
 assert(markupAtFrame(markup,frame,timeline,preset).includes('data-review-id'),'Markup invalid');
}
for(const track of timeline.tracks){
 const a=track.animation;
 const start=valueAt(a.startFrame,track),end=valueAt(a.endFrame,track);
 for(const key of Object.keys(a.from||{}))if(key in a.to){
  assert(Math.abs(start[key]-a.from[key])<1e-6,`Start keyframe differs: ${track.element}.${key}`);
  assert(Math.abs(end[key]-a.to[key])<1e-6,`End keyframe differs: ${track.element}.${key}`);
 }
}
assert(sceneAtFrame(timeline.durationFrames-1,timeline).id===timeline.scenes.at(-1).id,'Final scene invalid');
console.log(JSON.stringify({result:'PASS',checks,framesSampled:Math.ceil(timeline.durationFrames/11),fps:timeline.fps,durationFrames:timeline.durationFrames},null,2));
