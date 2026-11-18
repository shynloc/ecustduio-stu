/**
 * Offline integration check for compiled Remotion component render functions.
 * Executes the real project TSX via TypeScript transpilation and a tiny test
 * double for React/Remotion hooks. This is NOT a real Remotion CLI render.
 */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os'),cp=require('node:child_process');
let ts;try{ts=require('typescript')}catch(e){try{ts=require(path.join(cp.execSync('npm root -g',{encoding:'utf8'}).trim(),'typescript'))}catch(err){throw new Error('TypeScript required for offline adapter check; npm install it first')}}
const source=path.resolve(process.argv[2]||path.join(__dirname,'../examples/hcs-brand-pilot/remotion'));
const compile=(f)=>ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
let currentFrame=0,config={width:1920,height:1080,fps:30,durationInFrames:1080};
const jsx=(type,props)=>({type,props});
const stubReact={default:{},useMemo:(fn)=>fn()};
const mock={
 'react':stubReact,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},
 'remotion':{AbsoluteFill:'AbsoluteFill',Composition:'Composition',useCurrentFrame:()=>currentFrame,useVideoConfig:()=>config,registerRoot:()=>{}},
 './generated/stage.css':{},'./generated/portrait.css':{}
};
function run(sourceFile,localMocks={}){
 const js=compile(path.join(source,'src',sourceFile));
 const exports={};const module={exports};
 const sandbox={exports,module,require:(name)=>{
   if(name in localMocks)return localMocks[name];
   if(name in mock)return mock[name];
   throw new Error('Unexpected dependency in '+sourceFile+': '+name);
 }};
 vm.runInNewContext(js,sandbox,{filename:sourceFile});return sandbox.exports;
}
const data=run('generated/master.ts');
const engine=fs.readFileSync(path.join(source,'src/generated/frame-styles.mjs'),'utf8');
(async()=>{
 const dyn=await import('file://'+path.join(source,'src/generated/frame-styles.mjs'));
 const component=run('VideoMaster.tsx',{'./generated/master':data,'./generated/frame-styles.mjs':dyn});
 const root=run('Root.tsx',{'./VideoMaster':component,'./generated/master':data});
 const tree=root.RemotionRoot();const specs=tree.props.children;
 const comps=(Array.isArray(specs)?specs:[specs]).filter(Boolean);
 if(comps.length!==(data.MASTER.hasPortrait?2:1))throw new Error('Wrong number of registered Remotion Compositions');
 for(const [i,id] of (data.MASTER.hasPortrait?['HCS-Landscape','HCS-Portrait']:['HCS-Landscape']).entries()){
  if(comps[i].props.id!==id)throw new Error('Composition missing '+id);
  if(comps[i].props.durationInFrames!==1080||comps[i].props.fps!==30)throw new Error('Unexpected fps/duration');
 }
 let checks=0;
 for(const profile of (data.MASTER.hasPortrait?['landscape','portrait']:['landscape'])){
  config=profile==='portrait'?{width:1080,height:1920,fps:30,durationInFrames:1080}:{width:1920,height:1080,fps:30,durationInFrames:1080};
  for(const frame of [0,60,240,420,600,780,960,1079]){
   currentFrame=frame;
   const a=component.VideoMaster({profile});
   const group=a.props.children;
   const children=group.props.children;
   const markup=children[0].props.dangerouslySetInnerHTML.__html;
   const css=children[1].props.children;
   const expected=dyn.frameCSS(frame,data.MASTER.timeline,data.MASTER.storyboard,data.MASTER.tokens,data.MASTER.preset);
   if(css!==expected)throw new Error(`${profile}/${frame}: CSS not derived from shared frame engine`);
   if(!markup.includes('data-review-id'))throw new Error(`${profile}/${frame}: markup missing review ids`);
   if(!markup.includes('id="stageCurrent"'))throw new Error(`${profile}/${frame}: stage counter missing`);
   if(!group.props.className.includes(profile==='portrait'?'hcs-portrait':'hcs-landscape'))throw new Error('Profile class mismatch');
   if(frame===420 && data.MASTER.timeline.scenes.length===6 && !markup.includes('id="stageCurrent">03'))throw new Error('Frame-scene text not updated');
   checks+=5;
  }
 }
 console.log(JSON.stringify({result:'PASS',checks,framesTested:8,profiles:data.MASTER.hasPortrait?2:1,compositions:comps.map(x=>x.props.id),note:'TSX function+shared CSS integration checked offline; official CLI remains untested.'},null,2));
})().catch(e=>{console.error(e.stack);process.exit(1)});
