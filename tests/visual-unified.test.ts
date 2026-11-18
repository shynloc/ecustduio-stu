import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import AdmZip from 'adm-zip';
import {setupInjected} from './auth-helper.js';
import {buildVisualMaster,paginateText} from '../shared/visual.js';

mkdirSync('test-results',{recursive:true});
process.env.ECUSTUDIO_DATA_DIR=mkdtempSync(join(process.cwd(),'test-results/visual-unified-'));
process.env.DEEPSEEK_API_KEY='synthetic-test-only';
const D=await import('../server/db.js'),domain=await import('../server/domain.js'),V=await import('../server/visual-studio.js'),E=await import('../server/visual-export.js'),T=await import('../server/tasks.js');
const {makeWav}=await import('../server/wav.js');
const app=await(await import('../server/app.js')).buildApp(false),session=await setupInjected(app),user=D.get('SELECT * FROM users LIMIT 1');
D.run('UPDATE settings SET body=?',D.json({...D.settings(),allowExternalAI:true,maxInputChars:200000}));
const design={name:'共享测试设计',rationale:'从同一内容生成四种成果',layout:'timeline',background:'#faf6ec',foreground:'#203e36',accent:'#44735c',font:'serif',density:'spacious'};
const scope={region:'北京',district:'全市',year:2026,stage:'中考',audience:'合成测试'};
const snap=domain.saveSnapshot({title:'软件测试活动',text:'以下仅用于软件测试。\n报名先向学校确认条件。\n活动不承诺录取结果。',scope,url:'https://example.com/visual-test',publisher:'测试',documentType:'待判断'});
const claim=domain.addClaim({snapshotId:snap.id,paragraphId:'p2',quote:snap.paragraphs[1].text,text:snap.paragraphs[1].text});
const project=domain.createProject({title:'统一视觉测试',scope,snapshotIds:[snap.id]});
const body={schemaVersion:'1.0',title:'软件测试说明',summary:'合成测试，非真实招生政策',blocks:[{id:'b1',title:'确认条件',text:'报名先向学校确认条件。',claimIds:[claim.id],locked:false,notes:'测试讲者备注'},{id:'b2',title:'保留边界',text:'活动不承诺录取结果。',claimIds:[],locked:false,notes:''}],unverified:['软件测试材料']};
const version=domain.saveVersion({projectId:project.id,kind:'master',body,expectedRevision:project.revision,origin:'test'});
let modelCalls=0,voiceCalls=0;
const transport:any=async(url:any,options:any)=>{
  if(String(url).endsWith('/tts')){
    voiceCalls++;const pcm=Buffer.alloc(32000);for(let i=0;i<16000;i++)pcm.writeInt16LE(Math.round(Math.sin(i/16000*440*Math.PI*2)*3000),i*2);
    return new Response(makeWav(pcm),{headers:{'content-type':'audio/wav'}});
  }
  modelCalls++;const p=JSON.parse(options.body);
  if(p.tool_choice)return Response.json({choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'read-skill',type:'function',function:{name:'read_skill',arguments:JSON.stringify({name:p.messages[0].content.includes('gif-factory')?'gif-factory':'html-creator-studio'})}}]}}]});
  return Response.json({choices:[{message:{role:'assistant',content:JSON.stringify(p.messages[0].content.includes('gif-factory')?{motion:'progress',reason:'展示流程进度'}:design)}}],model:'mock'});
};
const signal=AbortSignal.timeout(240000),progress=()=>{};let visual:any,result:any,exportJob:any;
test('分段不丢失日期、例外和字符；同一场景保留原文引用',()=>{
  const text=('2026年11月15日，仅限已确认条件者；其他情况除外。\n').repeat(25);
  assert.equal(paginateText(text).join(''),text);
  const m=buildVisualMaster({...body,blocks:[{...body.blocks[0],text}]},design);
  assert.equal(m.scenes.map(s=>s.text).join(''),text);assert.ok(m.scenes.every(s=>s.claimIds[0]===claim.id));
});
test('真实网页渲染、PPT原生文字、同页PDF、两张独立GIF、带音轨MP4与ZIP贯通',async()=>{
  visual=await V.createVisualDraft({actorId:user.id,versionId:version.id,config:D.settings(),duration:10},'visual-test-create',progress,signal,transport);
  assert.equal(visual.body.master.scenes.length,2);assert.equal(visual.qa.horizontalOverflow,false);
  const options={copyHash:visual.copyHash,visualHash:visual.visualHash,approveCopy:true,approveVisual:true,outputs:['html','pptx','pdf','gif','mp4'],aspect:'landscape',duration:10,voice:'stella',pptMode:'editable',gifSceneIds:visual.body.master.scenes.map((s:any)=>s.id)};
  exportJob=V.approveVisualExport(visual.id,options,user,T.enqueue,'all-formats');
  const input=D.parse(D.get('SELECT input FROM jobs WHERE id=?',exportJob.id).input);
  result=await E.runVisualExport(input,exportJob.id,progress,signal,transport);
  D.run("UPDATE jobs SET state='succeeded',result=? WHERE id=?",D.json(result),exportJob.id);
  for(const format of ['html','pptx','pdf','gif','mp4','wav','srt','zip'])assert.ok(result.artifacts.some((a:any)=>a.format===format),format);
  const gifs=result.artifacts.filter((a:any)=>a.format==='gif');assert.equal(gifs.length,2);assert.notEqual(gifs[0].asset_id,gifs[1].asset_id);
  for(const gif of gifs){assert.match(domain.assetBuffer(gif.asset_id).data.toString('ascii',0,6),/^GIF8/);assert.equal(D.parse(gif.manifest).report.technical,'passed');}
  const ppt=new AdmZip(domain.assetBuffer(result.artifacts.find((a:any)=>a.format==='pptx').asset_id).data);
  const slides=ppt.getEntries().filter(e=>/^ppt\/slides\/slide\d+.xml$/.test(e.entryName));assert.equal(slides.length,2);assert.ok(slides[0].getData().toString().includes('报名先向学校确认条件。'));assert.ok(slides[0].getData().toString().includes('<p:sp>'));
  const mp4=result.artifacts.find((a:any)=>a.format==='mp4');assert.equal(D.parse(mp4.manifest).silent,false);assert.equal(result.timeline.length,2);assert.equal(result.duration,2.5);
  assert.equal(voiceCalls,2);assert.equal(modelCalls,2); // Required skills are preloaded by the host; no forced-tool round trip.
  writeFileSync(join(D.dataDir,'sample.mp4'),domain.assetBuffer(mp4.asset_id).data);
  writeFileSync(join(D.dataDir,'sample.gif'),domain.assetBuffer(gifs[0].asset_id).data);
  writeFileSync(join(D.dataDir,'sample.pptx'),domain.assetBuffer(result.artifacts.find((a:any)=>a.format==='pptx').asset_id).data);
  const pdf=domain.assetBuffer(result.artifacts.find((a:any)=>a.format==='pdf').asset_id).data;
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const loading=pdfjs.getDocument({data:new Uint8Array(pdf),useSystemFonts:true});const doc=await loading.promise;assert.equal(doc.numPages,2);await loading.destroy();
  const before={modelCalls,voiceCalls},again=await E.runVisualExport(input,exportJob.id,progress,signal,transport);assert.equal(again.bundleId,result.bundleId);assert.deepEqual({modelCalls,voiceCalls},before);
});
test('拒绝伪造确认、不同用户、变造输出、过期来源；下载接口继承资产权限',async()=>{
  assert.throws(()=>V.visualView(visual.id,{id:'stranger',role:'creator'}),/无权/);
  const input=D.parse(D.get('SELECT input FROM jobs WHERE id=?',exportJob.id).input);
  await assert.rejects(E.runVisualExport({...input,options:{...input.options,voice:'tide'}},exportJob.id,progress,signal,transport),/不一致/);
  assert.throws(()=>V.approveVisualExport(visual.id,{...input.options,approveCopy:false},user,T.enqueue));
  D.run('UPDATE versions SET stale=1 WHERE id=?',version.id);
  await assert.rejects(E.runVisualExport(input,exportJob.id,progress,signal,transport),/来源|文案/);
  D.run('UPDATE versions SET stale=0 WHERE id=?',version.id);
  const actor=(await import('../server/auth.js')).canAccess;
  for(const path of ['/api/visual-runtime','/api/visuals/id/export','/api/visuals/from-version'])assert.equal(actor('sales','GET',path),false);
});
test('保存设计新版本保留旧文件；修改设计不改变文案和来源',async()=>{
  const oldHtml=visual.html,revision=await V.createVisualDraft({actorId:user.id,versionId:version.id,design:{...design,accent:'#9c5c34'},parentId:visual.id,copyHash:visual.copyHash,assetIds:[]},'visual-test-revision',progress,signal,transport);
  assert.notEqual(revision.id,visual.id);assert.equal(revision.copyHash,visual.copyHash);assert.notEqual(revision.visualHash,visual.visualHash);assert.equal(V.visualView(visual.id,user).html,oldHtml);
  const job=V.approveVisualExport(revision.id,{copyHash:revision.copyHash,visualHash:revision.visualHash,approveCopy:true,approveVisual:true,outputs:['mp4'],voice:'stella'},user,T.enqueue);
  await E.runVisualExport(D.parse(D.get('SELECT input FROM jobs WHERE id=?',job.id).input),job.id,progress,signal,transport);
  assert.equal(voiceCalls,2,'设计修改应复用已合成音频');
});
test('生成的GIF可载入共享配图；视频按帧取样可复现，PPT保留媒体对象',async()=>{
  const gif=result.artifacts.find((a:any)=>a.format==='gif');
  const revised=await V.createVisualDraft({actorId:user.id,versionId:version.id,design,assetIds:[gif.asset_id],parentId:visual.id},'gif-reuse-test',progress,signal,transport);
  assert.ok(revised.body.master.assets[0].frames.length>1);
  const browser=await(await import('../server/visual-runtime.js')).visualBrowser();
  try{
    const page=await browser.newPage({viewport:{width:1280,height:720}});await page.setContent(revised.html);await page.evaluate(()=>document.fonts.ready);
    const frame=async(n:number)=>{await page.evaluate(n=>(window as any).ecuFrame(n,15,10),n);return page.screenshot()};
    const first=await frame(8);await frame(35);const again=await frame(8);
    if(!first.equals(again)){writeFileSync(join(D.dataDir,'frame-first.png'),first);writeFileSync(join(D.dataDir,'frame-again.png'),again);}
    assert.ok(first.equals(again));assert.ok((await page.locator('.illustration').first().getAttribute('src'))?.startsWith('data:image/png'));
  }finally{await browser.close()}
  const job=V.approveVisualExport(revised.id,{copyHash:revised.copyHash,visualHash:revised.visualHash,approveCopy:true,approveVisual:true,outputs:['pptx'],voice:'none'},user,T.enqueue);
  const exported=await E.runVisualExport(D.parse(D.get('SELECT input FROM jobs WHERE id=?',job.id).input),job.id,progress,signal,transport);
  const ppt=new AdmZip(domain.assetBuffer(exported.artifacts.find((a:any)=>a.format==='pptx').asset_id).data);
  assert.ok(ppt.getEntries().some(e=>e.entryName.startsWith('ppt/media/')&&e.entryName.endsWith('.gif')));
});
test('真实HTTP阻止其他创作者和业务员读取私有导出、预览、音频与依赖安装',async()=>{
  const request=(s:any,method:any,url:string,payload?:any)=>app.inject({method,url,payload,headers:{host:'localhost',cookie:s.cookie,'x-csrf-token':s.csrf}});
  for(const role of ['creator','sales']){
    const username='visual-'+role,password='Fixture-only-2026!';assert.equal((await request(session,'POST','/api/auth/users',{username,displayName:username,role,password})).statusCode,200);
    const guest=await app.inject({url:'/api/session',headers:{host:'localhost'}}),s={cookie:String(guest.headers['set-cookie']).split(';')[0],csrf:guest.json().csrf};
    const login=await request(s,'POST','/api/auth/login',{username,password});s.cookie=String(login.headers['set-cookie']).split(';')[0];s.csrf=login.json().csrf;
    const changed=await request(s,'POST','/api/auth/password',{currentPassword:password,newPassword:password+'changed'});assert.equal(changed.statusCode,200);if(changed.headers['set-cookie'])s.cookie=String(changed.headers['set-cookie']).split(';')[0];s.csrf=changed.json().csrf||s.csrf;
    for(const file of result.artifacts){assert.equal((await request(s,'GET','/api/artifacts/'+file.id+'/download')).statusCode,403);assert.equal((await request(s,'GET','/api/assets/'+file.asset_id)).statusCode,403);}
    assert.equal((await request(s,'GET','/api/visuals/'+visual.id+'/preview')).statusCode,403);
    assert.equal((await request(s,'POST','/api/visual-runtime/install')).statusCode,403);
    assert.equal((await request(s,'GET','/api/jobs/'+exportJob.id)).statusCode,403);
    const state=(await request(s,'GET','/api/state')).json();assert.ok(!state.artifacts.some((a:any)=>result.artifacts.some((b:any)=>a.id===b.id)));
  }
});
test('素材模板制作复用共享母版，HTML、原生PPT和演示PDF保持同分页',async()=>{
  const P=await import('../server/production.js');
  const input=P.freezeProduction({template:'presentation',title:'模板视觉桥接测试',scope,snapshotIds:[snap.id],formats:['html','pptx','pdf']},user);
  const job=T.enqueue('production',input);
  const master=domain.saveVersion({projectId:input.projectId,kind:'master',body,expectedRevision:input.projectRevision,origin:'test',jobId:job.id});
  domain.saveVersion({projectId:input.projectId,kind:'presentation',body,masterId:master.id,expectedRevision:input.projectRevision+1,origin:'test',jobId:job.id});
  D.run('UPDATE jobs SET checkpoint=? WHERE id=?',D.json({research:{content:{claims:[],topics:[]},usage:{inputTokens:0,outputTokens:0}},claimIds:[],topicIds:[]}),job.id);
  const result=await P.runProduction(input,job.id,progress,signal,transport);
  assert.ok(result.visualId);const shared=V.visualView(result.visualId,user);
  assert.equal(shared.exports.filter((a:any)=>['html','pptx','pdf'].includes(a.format)).length,3);
  assert.equal(shared.body.master.scenes.length,2);assert.equal(result.artifacts.find(a=>a.format==='html')?.id,shared.artifact.id);
  const item=D.get('SELECT asset_id FROM artifacts WHERE id=?',result.artifacts.find(a=>a.format==='pptx')!.id);
  const ppt=new AdmZip(domain.assetBuffer(item.asset_id).data);
  assert.equal(ppt.getEntries().filter(e=>/^ppt\/slides\/slide\d+.xml$/.test(e.entryName)).length,2);
  assert.ok(ppt.readAsText('ppt/slides/slide1.xml').toLowerCase().includes(design.accent.slice(1).toLowerCase()));
  assert.ok(result.artifacts.some(a=>a.format==='pdf'));
  D.run("UPDATE jobs SET state='succeeded',result=?,input=json_set(input,'$.deliveryFormats',json(?)) WHERE id=?",D.json(result),D.json(['pdf','mp4']),job.id);
  const approve=(confirmed:boolean)=>app.inject({method:'POST',url:'/api/pipeline/jobs/'+job.id+'/finish-visual',headers:{host:'localhost',cookie:session.cookie,'x-csrf-token':session.csrf},payload:{copyHash:shared.copyHash,visualHash:shared.visualHash,approveCopy:confirmed,approveVisual:confirmed,outputs:['gif']}});
  assert.notEqual((await approve(false)).statusCode,202);
  const exported=await approve(true);assert.equal(exported.statusCode,202,exported.body);
  assert.equal((await approve(true)).json().id,exported.json().id);
  const child=D.get('SELECT * FROM jobs WHERE id=?',exported.json().id);
  assert.deepEqual(D.parse(child.input).options.outputs,['mp4']);
  assert.equal(T.jobView(child).parentProductionId,job.id);
  assert.equal(T.jobView(D.get('SELECT * FROM jobs WHERE id=?',job.id)).production.deliveryJobId,child.id);

});
after(async()=>{writeFileSync('test-results/visual-unified-location.txt',D.dataDir);await app.close();D.db.close()});
