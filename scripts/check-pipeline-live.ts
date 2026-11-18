import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,mkdtempSync,copyFileSync,unlinkSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {setupInjected,loginInjected} from '../tests/auth-helper.js';
if(process.env.ECUSTUDIO_REAL_TEST!=='1')throw new Error('Explicit live opt-in required');
mkdirSync('test-results',{recursive:true});const source=new DatabaseSync('D:/EduStudio/data/app.sqlite',{readOnly:true}),cfg=JSON.parse((source.prepare('SELECT body FROM settings').get() as any).body);source.close();if(!cfg.allowExternalAI)throw new Error('AI consent is disabled');
const folder=process.env.ECUSTUDIO_RESUME_TEST||mkdtempSync(join(process.cwd(),'test-results/pipeline-live-'));process.env.ECUSTUDIO_DATA_DIR=folder;process.env.DEEPSEEK_API_KEY='';copyFileSync('D:/EduStudio/data/secrets.dpapi',join(folder,'secrets.dpapi'));
const D=await import('../server/db.js'),{buildApp}=await import('../server/app.js'),P=await import('../server/production.js'),V=await import('../server/visual-studio.js'),E=await import('../server/visual-export.js'),T=await import('../server/tasks.js');
const app=await buildApp(false),auth=D.get('SELECT id FROM users LIMIT 1')?await loginInjected(app):await setupInjected(app),user=D.get('SELECT * FROM users LIMIT 1'),headers={host:'localhost',cookie:auth.cookie,'x-csrf-token':auth.csrf};
const request=async(url:string,body:any)=>{const r=await app.inject({method:'POST',url:'/api'+url,payload:body,headers});assert.ok(r.statusCode<300,r.body);return r.json();};
const report:any={version:'0.9.0',realAPI:true,syntheticSource:true,isolatedData:folder,checks:[],startedAt:D.now()};
const progress=(stage:string,p:any)=>console.log(JSON.stringify({stage,message:p.message}));
try{
 D.run('UPDATE settings SET body=?',D.json({...cfg,model:'deepseek-flash',thinkingMode:'disabled',maxRequests:4,maxTokens:8192,timeoutSeconds:900}));
 const note=D.get('SELECT * FROM notes LIMIT 1')||await request('/notes',{title:'【合成验收】光合作用教学安排',body:'本材料为软件验收使用的合成教学记录。主题是光合作用。课堂先观察叶片10分钟，再讨论光照与水分15分钟，最后整理观察记录。不得据此推断任何招生或考试政策。'});
 const c=await request('/contexts',{refs:[{kind:'note',id:note.id,revision:note.revision}],purpose:'production'});assert.ok(c.id);
 const prepared=await request('/pipeline/prepare',{refs:[{kind:'note',id:note.id,revision:note.revision}],shareNotes:true});report.checks.push({name:'private-note-to-shared-creation',ok:true});
 const j=D.get("SELECT id FROM jobs WHERE type='production' LIMIT 1")||await request('/production',{template:'presentation',title:'合成教学全流程验收',scope:prepared.scope,snapshotIds:prepared.snapshotIds,prompt:'制作3页非常简短的教学演示：主题、活动安排、小结。每页正文不超过50字。配音总字数不超过100字。严格保留10分钟和15分钟，声明为合成材料。不要联网。',slideCount:3,lectureMinutes:5,duration:10,formats:['html','pptx','docx','pdf']});
 const input=D.parse(D.get('SELECT input FROM jobs WHERE id=?',j.id).input),result=await P.runProduction(input,j.id,progress,AbortSignal.timeout(900000));D.run("UPDATE jobs SET state='succeeded',result=?,finished_at=? WHERE id=?",D.json(result),D.now(),j.id);assert.deepEqual(result.artifacts.map((a:any)=>a.format).sort(),['docx','html','pdf','pptx']);report.checks.push({name:'research-master-static-outputs',ok:true,formats:result.artifacts.map((a:any)=>a.format),usage:result.usage});
 let visual=V.visualView(result.visualId,user);const scenes=visual.body.master.scenes.map((s:any)=>({...s,motion:'reveal'}));
 // Deterministic animation on a synthetic, explicitly approved test fixture; speech still uses the real provider.
 const revision=await request('/visuals/'+visual.id+'/revise',{visualHash:visual.visualHash,design:visual.body.design,assetIds:[],scenes});const ri=D.parse(D.get('SELECT input FROM jobs WHERE id=?',revision.id).input),rv=await V.runVisualCreate(ri,revision.id,progress,AbortSignal.timeout(180000));visual=V.visualView(rv.visualId,user);
 const render=V.approveVisualExport(visual.id,{copyHash:visual.copyHash,visualHash:visual.visualHash,approveCopy:true,approveVisual:true,outputs:['gif','mp4'],voice:'stella',duration:10,gifSceneIds:[visual.body.master.scenes[0].id]},user,T.enqueue);
 const dynamic=await E.runVisualExport(D.parse(D.get('SELECT input FROM jobs WHERE id=?',render.id).input),render.id,progress,AbortSignal.timeout(900000));D.run("UPDATE jobs SET state='succeeded',result=?,finished_at=? WHERE id=?",D.json(dynamic),D.now(),render.id);assert.ok(dynamic.artifacts.some((a:any)=>a.format==='gif'));assert.ok(dynamic.artifacts.some((a:any)=>a.format==='mp4'));
 report.checks.push({name:'real-gif-and-deepseek-voiced-video',ok:true,formats:dynamic.artifacts.map((a:any)=>a.format),duration:dynamic.duration});
 const bundle=await request('/pipeline/bundle',{artifactIds:[...result.artifacts,...dynamic.artifacts.filter((a:any)=>a.format!=='zip')].map((a:any)=>a.id)});report.checks.push({name:'unified-package',ok:true});
 const output='D:/EduStudio/deliverables/0.9.0/examples';mkdirSync(output,{recursive:true});for(const a of [...result.artifacts,...dynamic.artifacts,bundle]){const asset=D.get('SELECT * FROM assets WHERE id=(SELECT asset_id FROM artifacts WHERE id=?)',a.id);if(asset)copyFileSync(join(folder,asset.path),join(output,asset.id.slice(0,8)+'_'+asset.name));}
 report.ok=true;
}catch(e:any){report.ok=false;report.error={code:e.code||e.name,message:e.message};process.exitCode=1;}finally{await app.close();D.db.close();unlinkSync(join(folder,'secrets.dpapi'));writeFileSync('test-results/pipeline-live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
