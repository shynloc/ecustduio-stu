import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import AdmZip from 'adm-zip';
import {createCanvas} from '@napi-rs/canvas';
import {setupInjected,setupBrowser} from './auth-helper.js';
import {editableScenes,applySceneEdits,narrationParts} from '../shared/visual-edit.js';
mkdirSync('test-results',{recursive:true});process.env.ECUSTUDIO_DATA_DIR=mkdtempSync(join(process.cwd(),'test-results/visual-editor-'));process.env.DEEPSEEK_API_KEY='synthetic-editor-test';
const D=await import('../server/db.js'),domain=await import('../server/domain.js'),V=await import('../server/visual-studio.js'),E=await import('../server/visual-export.js'),A=await import('../server/visual-editor.js'),W=await import('../server/visual-web.js'),T=await import('../server/tasks.js');
const {makeWav}=await import('../server/wav.js'),{grantMediaAsset}=await import('../server/media-access.js');
const app=await(await import('../server/app.js')).buildApp(false),session=await setupInjected(app),user=D.get('SELECT * FROM users LIMIT 1');
D.run('UPDATE settings SET body=?',D.json({...D.settings(),allowExternalAI:true,maxInputChars:200000}));
const scope={region:'北京',district:'全市',stage:'中考',year:2026,audience:'软件测试'};
const snap=domain.saveSnapshot({title:'合成软件测试',text:'本资料仅用于软件测试。\n报名必须先核对条件。\n参加活动不承诺录取。',scope,url:'https://example.com/editor',publisher:'测试',documentType:'待判断'});
const claim=domain.addClaim({snapshotId:snap.id,paragraphId:'p2',quote:snap.paragraphs[1].text,text:snap.paragraphs[1].text});
const project=domain.createProject({title:'可编辑视觉测试',scope,snapshotIds:[snap.id]});
const copy={schemaVersion:'1.0',title:'合成活动说明',summary:'非真实政策',blocks:[{id:'a',title:'报名条件',text:'报名必须先核对条件。',claimIds:[claim.id],notes:'原备注',locked:false},{id:'b',title:'活动边界',text:'参加活动不承诺录取。',claimIds:[],notes:'',locked:false}],unverified:['合成测试材料']};
const version=domain.saveVersion({projectId:project.id,kind:'master',body:copy,expectedRevision:project.revision,origin:'test'});
const design={name:'编辑测试',rationale:'清晰的测试场景',layout:'editorial',background:'#f7f4ec',foreground:'#233d34',accent:'#51755e',font:'sans-serif',density:'spacious'};
const pictures=['#dca55c','#5ca3aa'].map((color,i)=>{const c=createCanvas(128,128),g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,128,128);g.fillStyle='#fff';g.font='40px sans-serif';g.fillText(String(i+1),50,80);const a=domain.asset(c.toBuffer('image/png'),'测试画面'+i+'.png','image/png','test');grantMediaAsset(a.id,user.id);return a;});
const pcm=Buffer.alloc(16000);for(let n=0;n<8000;n++)pcm.writeInt16LE(Math.round(Math.sin(n/16000*440*Math.PI*2)*1200),n*2);
const music=domain.asset(makeWav(pcm),'测试配乐.wav','audio/wav','test');grantMediaAsset(music.id,user.id);
let voiceCalls=0,modelCalls=0;
const transport:any=async(url:any,opt:any)=>{if(String(url).endsWith('/tts')){voiceCalls++;return new Response(makeWav(pcm),{headers:{'content-type':'audio/wav'}})}modelCalls++;const p=JSON.parse(opt.body),context=JSON.parse(p.messages[1].content);
 if(p.tool_choice){const names=p.messages[0].content.includes('统一规划')?['html-creator-studio','gif-factory']:['html-creator-studio'];return Response.json({choices:[{message:{role:'assistant',content:null,tool_calls:names.map(name=>({id:name,type:'function',function:{name:'read_skill',arguments:JSON.stringify({name})}}))}}]})}
 const content=p.messages[0].content.includes('统一规划')?{design:{...context.design,background:'#112233'},scenes:[{...context.scenes[0],title:'AI 修改后的标题',layout:'steps',items:['核对条件','保留边界']}],summary:'已调整当前页'}:design;
 return Response.json({choices:[{message:{role:'assistant',content:JSON.stringify(content)}}],usage:{prompt_tokens:1,completion_tokens:1}});
};
const signal=AbortSignal.timeout(600000),progress=()=>{};let base:any,edited:any,exported:any;
const req=(path:string,body?:any)=>app.inject({method:body?'POST':'GET',url:'/api'+path,payload:body,headers:{host:'localhost',cookie:session.cookie,'x-csrf-token':session.csrf}});
test('逐页修改保存新修订，原文不改，配图/顺序/表格与来源约束生效',async()=>{
 base=await V.createVisualDraft({actorId:user.id,versionId:version.id,design,assetIds:pictures.map(a=>a.id)},'editor-base',progress,signal);
 const scenes=editableScenes(base.body.master);scenes[0]={...scenes[0],title:'已编辑的条件页',layout:'steps',items:['确认资料','核对条件'],narration:'报名必须先核对条件。',seconds:1,hold:.1,gifSeconds:1,motion:'steps',assetIds:[]};
 scenes[1]={...scenes[1],layout:'image-left',assetIds:pictures.map(a=>a.id),motion:'sequence',gifSeconds:1,seconds:1,hold:.1};
 scenes.push({...scenes[0],id:'table-page',blockId:'',title:'示例表格',text:'测试对比。',narration:'测试对比。',items:[],layout:'table',table:{headers:['项目','状态'],rows:[['适用条件','待核对'],['活动结果','不承诺录取']]},seconds:1,hold:.1,motion:'none',transparent:false});
 assert.throws(()=>applySceneEdits(base.body.master,[{...scenes[0],claimIds:['foreign-id']}]),/未授权/);
 assert.throws(()=>applySceneEdits(base.body.master,[{...scenes[0],assetIds:['foreign-image']}]),/共享素材/);
 edited=await V.createVisualDraft({actorId:user.id,versionId:version.id,design,assetIds:pictures.map(a=>a.id),scenes,parentId:base.id},'editor-revision',progress,signal);
 assert.equal(edited.body.master.scenes.length,3);assert.equal(edited.body.master.scenes[0].edited,true);assert.equal(edited.copyHash,base.copyHash);assert.notEqual(edited.visualHash,base.visualHash);assert.deepEqual(D.parse(D.get('SELECT body FROM versions WHERE id=?',version.id).body),version.body);
});
test('未保存预览不写入视觉版本；过期哈希、无权访问和内网网址被拒绝',async()=>{
 const count=D.get('SELECT count(*) n FROM visual_drafts').n,scenes=editableScenes(edited.body.master);scenes[0].title='仅预览，不保存';
 const r=await req('/visuals/'+edited.id+'/draft-preview',{visualHash:edited.visualHash,design,scenes,assetIds:pictures.map(a=>a.id)});assert.equal(r.statusCode,200,r.body);
 const preview=await app.inject({url:r.json().url,headers:{host:'localhost',cookie:session.cookie}});assert.equal(preview.statusCode,200);assert.ok(preview.body.includes('仅预览，不保存'));assert.equal(D.get('SELECT count(*) n FROM visual_drafts').n,count);
 assert.equal((await req('/visuals/'+edited.id+'/draft-preview',{visualHash:'old',design,scenes,assetIds:[]})).statusCode,409);
 assert.equal((await req('/visuals/from-web',{url:'http://127.0.0.1/test',scope})).statusCode,400);
});
test('实际导出逐页版式、原生PPT表格、序列GIF、语速/配乐/字幕视频且重试复用',async()=>{
 const scenes=edited.body.master.scenes;
 const j=V.approveVisualExport(edited.id,{copyHash:edited.copyHash,visualHash:edited.visualHash,approveCopy:true,approveVisual:true,outputs:['pptx','pdf','gif','mp4'],gifSceneIds:scenes.map((s:any)=>s.id),voice:'stella',speed:1.25,subtitles:'sentence',transition:'slide',useSceneDurations:true,musicAssetId:music.id,musicVolume:.12},user,T.enqueue);
 const input=D.parse(D.get('SELECT input FROM jobs WHERE id=?',j.id).input);exported=await E.runVisualExport(input,j.id,progress,signal,transport);
 const ppt=exported.artifacts.find((a:any)=>a.format==='pptx'),zip=new AdmZip(domain.assetBuffer(ppt.asset_id).data);assert.ok(zip.readAsText('ppt/slides/slide1.xml').includes('已编辑的条件页'));assert.ok(zip.readAsText('ppt/slides/slide3.xml').includes('<a:tbl>'));
 assert.equal(exported.captions.length,3);assert.ok(exported.captions.every((c:any)=>c.end>c.start&&c.end-c.start<.5));assert.ok(Math.abs(exported.timeline[2].end-3.3)<.001);
 const video=exported.artifacts.find((a:any)=>a.format==='mp4'),meta=D.parse(video.manifest);assert.equal(meta.musicIncluded,true);assert.equal(meta.speed,1.25);assert.equal(meta.silent,false);
 for(const gif of exported.artifacts.filter((a:any)=>a.format==='gif'))assert.equal(D.parse(gif.manifest).report.durationMs,1000);
 assert.equal(modelCalls,0);const previous=voiceCalls;await E.runVisualExport(input,j.id,progress,signal,transport);assert.equal(voiceCalls,previous);
 for(const format of ['pptx','pdf','gif','mp4','wav','srt','zip']){const a=exported.artifacts.find((a:any)=>a.format===format);writeFileSync(join(D.dataDir,'editor-sample.'+format),domain.assetBuffer(a.asset_id).data);}
});
test('AI 实际读取两个技能，仅修改指定页，用户其他编辑保留',async()=>{
 const input={actorId:user.id,visualId:edited.id,visualHash:edited.visualHash,design,assetIds:pictures.map(a=>a.id),scenes:editableScenes(edited.body.master),sceneId:edited.body.master.scenes[0].id,prompt:'只调整当前页标题和步骤',config:D.settings()};
 const j=T.enqueue('visual-assistant',input),result=await A.runVisualAssistant(input,j.id,progress,signal,transport),v=V.visualView(result.visualId,user);
 assert.equal(v.body.master.scenes[0].title,'AI 修改后的标题');assert.deepEqual(v.body.design,edited.body.design);assert.deepEqual(v.body.master.scenes[1],edited.body.master.scenes[1]);assert.equal(v.body.master.scenes[2].table.rows[1][1],'不承诺录取');assert.deepEqual(v.body.skill.map((c:any)=>c.args.name),['html-creator-studio','gif-factory']);
});
test('网页安全导入后建立来源/内容/视觉项目，重试不重复生成',async()=>{
 const input={url:snap.url,scope,actorId:user.id,title:'网页转演示测试',designBrief:'保持原文',config:D.settings()},j=T.enqueue('visual-web-import',input);
 const result=await W.runVisualWebImport(input,j.id,progress,signal,transport,async()=>snap);assert.ok(result.snapshotId&&result.versionId&&result.visualId);
 const v=V.visualView(result.visualId,user);assert.ok(v.body.master.scenes.every((s:any)=>s.claimIds.length));const again=await W.runVisualWebImport(input,j.id,progress,signal,transport,async()=>{throw new Error('不应重复请求网页')});assert.equal(again.visualId,result.visualId);
});
test('音乐上传真实解码 MP3、OGG、FLAC，拒绝假音频',async()=>{
 const {command,ffmpegPath}=await import('../server/visual-runtime.js');writeFileSync(join(D.dataDir,'music.wav'),makeWav(pcm));
 const upload=async(bytes:Buffer,filename:string)=>{const boundary='test-audio-boundary';return app.inject({method:'POST',url:'/api/visuals/music',headers:{host:'localhost',cookie:session.cookie,'x-csrf-token':session.csrf,'content-type':'multipart/form-data; boundary='+boundary},payload:Buffer.concat([Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="'+filename+'"\r\nContent-Type: application/octet-stream\r\n\r\n'),bytes,Buffer.from('\r\n--'+boundary+'--\r\n')])})};
 for(const ext of ['mp3','ogg','flac']){const out=join(D.dataDir,'music.'+ext);await command(ffmpegPath(),['-v','error','-y','-i',join(D.dataDir,'music.wav'),out],signal);const response=await upload(readFileSync(out),'test.'+ext);assert.equal(response.statusCode,200,response.body);assert.ok(response.json().durationMs>400)}
 assert.equal((await upload(Buffer.from('not audio'),'bad.mp3')).statusCode,422);
});
test('句群保持全部内容，桌面/手机编辑、实时预览、撤销与保存接口可用',async()=>{
 const text='报名必须先核对条件。参加活动不承诺录取。';assert.equal(narrationParts(text,'sentence').join(''),text);
 const origin=await app.listen({host:'127.0.0.1',port:0}),browser=await(await import('../server/visual-runtime.js')).visualBrowser();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];page.on('pageerror',(e:any)=>errors.push(e.message));page.setDefaultTimeout(20000);await setupBrowser(page,origin);
  for(const theme of ['scholar','obsidian'])for(const width of [1440,390]){
   D.run('UPDATE settings SET body=?',D.json({...D.settings(),theme}));await page.setViewportSize({width,height:1000});await page.goto(origin+'/#visual/'+edited.id);await page.reload();await page.getByRole('heading',{name:'当前页编辑',exact:true}).waitFor();
   await page.getByLabel('页面标题',{exact:true}).fill('浏览器编辑测试');await page.frameLocator('iframe[title="共享视觉预览"]').getByRole('heading',{name:'浏览器编辑测试'}).waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:join(D.dataDir,theme+'-'+width+'.png')});if(width===1440){const bounds=await page.locator('.visual-editor-center').boundingBox();assert.ok(bounds!.width>480)}
   await page.getByRole('button',{name:'撤销',exact:true}).click();await page.getByRole('button',{name:'重做',exact:true}).click();assert.equal(await page.getByLabel('页面标题',{exact:true}).inputValue(),'浏览器编辑测试');
  }
  const wait=page.waitForResponse((r:any)=>r.url().endsWith('/revise')&&r.request().method()==='POST');await page.getByRole('button',{name:'保存新修订',exact:true}).click();const response=await wait;assert.equal(response.status(),202,await response.text());
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
after(async()=>{writeFileSync('test-results/visual-editor-location.txt',D.dataDir);await app.close();D.db.close()});
