// Short synthetic fixture, real provider; production records are read-only.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,mkdtempSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {setupInjected} from './auth-helper.js';
import {editableScenes} from '../shared/visual-edit.js';
if(process.env.ECUSTUDIO_REAL_TEST!=='1')throw new Error('Set ECUSTUDIO_REAL_TEST=1 to use the real provider');
const sourceRoot='D:/EduStudio/data',source=new DatabaseSync(join(sourceRoot,'app.sqlite'),{readOnly:true});
const config=JSON.parse((source.prepare('SELECT body FROM settings').get() as any).body);source.close();
mkdirSync('test-results',{recursive:true});const folder=mkdtempSync(join(process.cwd(),'test-results/editor-real-'));process.env.ECUSTUDIO_DATA_DIR=folder;process.env.DEEPSEEK_API_KEY='';
copyFileSync(join(sourceRoot,'secrets.dpapi'),join(folder,'secrets.dpapi'));
const D=await import('../server/db.js'),domain=await import('../server/domain.js'),V=await import('../server/visual-studio.js'),A=await import('../server/visual-editor.js'),E=await import('../server/visual-export.js'),T=await import('../server/tasks.js');
const app=await(await import('../server/app.js')).buildApp(false);await setupInjected(app);const user=D.get('SELECT * FROM users LIMIT 1');
D.run('UPDATE settings SET body=?',D.json({...config,allowExternalAI:true,maxInputChars:200000,thinkingMode:'disabled',maxTokens:8192,timeoutSeconds:1800}));
const signal=AbortSignal.timeout(900000),progress=(stage:string,p:any)=>console.log(JSON.stringify({stage,message:p.message}));
const report:any={startedAt:D.now(),folder,realDeepSeek:true,fixture:'synthetic software test, no real policy',checks:[]};
try{
 const scope={region:'北京',district:'全市',stage:'中考',year:2026,audience:'软件测试人员'};
 const snapshot=domain.saveSnapshot({title:'合成软件测试材料',text:'本材料仅用于软件测试。\n报名先确认条件。\n活动不承诺录取。',scope,url:'https://example.com/editor-test',publisher:'测试夹具',documentType:'待判断'});
 const claims=[1,2].map(i=>domain.addClaim({snapshotId:snapshot.id,paragraphId:snapshot.paragraphs[i].id,quote:snapshot.paragraphs[i].text,text:snapshot.paragraphs[i].text}));
 const project=domain.createProject({title:'【测试】视觉编辑',scope,snapshotIds:[snapshot.id]});
 const copy={schemaVersion:'1.0',title:'【测试】活动说明',summary:'用于软件验证的合成材料',blocks:[{id:'a',title:'报名条件',text:'报名先确认条件。',claimIds:[claims[0].id],notes:'保留原文限制',locked:false},{id:'b',title:'活动边界',text:'活动不承诺录取。',claimIds:[claims[1].id],notes:'第二页保持不变',locked:false}],unverified:['合成测试材料，不用于招生决策']};
 const version=domain.saveVersion({projectId:project.id,kind:'master',body:copy,expectedRevision:project.revision,origin:'isolated-real-editor-test'});
 const design={name:'书院演示',rationale:'清晰的活动说明',layout:'editorial',background:'#f7f4ec',foreground:'#233d34',accent:'#51755e',font:'sans-serif',density:'spacious'};
 const base=await V.createVisualDraft({actorId:user.id,versionId:version.id,design},'base',progress,signal);
 const scenes=editableScenes(base.body.master).map(s=>({...s,seconds:1,hold:.2,gifSeconds:1,motion:'progress' as const}));
 const request={actorId:user.id,visualId:base.id,visualHash:base.visualHash,design,assetIds:[],scenes,sceneId:scenes[0].id,config:D.settings(),prompt:'仅修改当前页，改成两个步骤：先确认报名条件，再核对来源。保留原正文和事实ID；不要编造政策。layout=steps，items只包含这两个步骤，motion=steps，gifSeconds=1，seconds=1，hold=0.2，narration=报名先确认条件，再核对来源。本材料仅用于软件测试。整体设计保持不变。'};
 const j=T.enqueue('visual-assistant',request),result=await A.runVisualAssistant(request,j.id,progress,signal),v=V.visualView(result.visualId,user);
 assert.deepEqual(v.body.design,design);assert.equal(v.body.master.scenes.length,2);assert.equal(v.body.master.scenes[1].title,scenes[1].title);assert.equal(v.body.master.scenes[1].text,scenes[1].text);assert.equal(v.body.master.scenes[1].notes,scenes[1].notes);
 assert.ok(['html-creator-studio','gif-factory'].every(name=>v.body.skill.some((c:any)=>c.args.name===name)));assert.equal(v.body.master.scenes[0].layout,'steps');
 report.checks.push('Real DeepSeek reads HCS and GIF Factory; single-scene edit preserves global design and other page');report.visualId=v.id;
 const exportJob=V.approveVisualExport(v.id,{copyHash:v.copyHash,visualHash:v.visualHash,approveCopy:true,approveVisual:true,outputs:['html','pptx','pdf','gif','mp4'],gifSceneIds:[v.body.master.scenes[0].id],voice:'stella',speed:1.15,subtitles:'sentence',transition:'fade',useSceneDurations:true},user,T.enqueue);
 const output=await E.runVisualExport(D.parse(D.get('SELECT input FROM jobs WHERE id=?',exportJob.id).input),exportJob.id,progress,signal);
 for(const format of ['html','pptx','pdf','gif','mp4','wav','srt','zip']){const a=output.artifacts.find((a:any)=>a.format===format);assert.ok(a,format);writeFileSync(join(folder,'编辑与制作实测.'+format),domain.assetBuffer(a.asset_id).data);}
 assert.ok(output.duration>2);assert.ok(output.captions.length>=2);assert.ok(output.captions.every((c:any)=>c.end>c.start));
 const video=output.artifacts.find((a:any)=>a.format==='mp4'),meta=D.parse(video.manifest);assert.equal(meta.speed,1.15);assert.equal(meta.silent,false);
 report.checks.push('Native PPT/PDF/HTML, actual GIF Factory GIF, real DeepSeek TTS at 1.15 speed, sentence-group captions, voiced MP4 and ZIP');
 report.timeline=output.timeline;report.captions=output.captions;report.duration=output.duration;report.ok=true;
}catch(e:any){report.ok=false;report.error=e.stack;process.exitCode=1}
finally{await app.close();D.db.close();rmSync(join(folder,'secrets.dpapi'),{force:true});report.finishedAt=new Date().toISOString();writeFileSync('test-results/visual-editor-real-result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))}
