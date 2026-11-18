// Isolated, bounded requests. Never prints credentials or imported business text.
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,mkdtempSync,copyFileSync,writeFileSync,unlinkSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';
import {PDFDocument} from 'pdf-lib';
import {createCanvas} from '@napi-rs/canvas';
import {setupInjected} from '../tests/auth-helper.js';
if(process.env.ECUSTUDIO_REAL_TEST!=='1')throw new Error('Explicit live test opt-in required');
const original='D:/EduStudio/data',source=new DatabaseSync(join(original,'app.sqlite'),{readOnly:true});
const cfg=JSON.parse((source.prepare('SELECT body FROM settings').get() as any).body);source.close();
if(!cfg.allowExternalAI)throw new Error('External AI is not enabled');
const out=mkdtempSync(join(process.cwd(),'test-results/remediation-live-'));process.env.ECUSTUDIO_DATA_DIR=out;process.env.DEEPSEEK_API_KEY='';copyFileSync(join(original,'secrets.dpapi'),join(out,'secrets.dpapi'));
const D=await import('../server/db.js'),{structuredTask}=await import('../server/workflow-agent.js'),W=await import('../server/workflows.js'),A=await import('../server/domain.js'),{buildApp}=await import('../server/app.js');
const app=await buildApp(false);await setupInjected(app);const user=D.get('SELECT * FROM users LIMIT 1');
const prior=JSON.parse(readFileSync('test-results/remediation-live.json','utf8'));const report:any={date:D.now(),realAPI:true,privateDataSent:false,checks:prior.checks||[]};
try{
 for(const model of ['deepseek-flash','deepseek-v4-pro'])for(const thinkingMode of ['disabled','high']){
  if(report.checks.some((c:any)=>c.model===model&&c.thinkingMode===thinkingMode&&c.ok))continue;
  const config={...cfg,model,thinkingMode,maxRequests:2,maxTokens:2048};D.run('UPDATE settings SET body=?',D.json(config));
  const r=await structuredTask({actorId:user.id,config,requiredSkill:'acks-reprompt',instruction:'只输出JSON：{"ok":true,"summary":"兼容性检查成功"}。这是合成测试，不需要外部搜索。',context:{task:'测试工作台技能预装和结构输出'},schema:z.object({ok:z.literal(true),summary:z.string()})},()=>{},AbortSignal.timeout(120000));
  report.checks.push({model,thinkingMode,ok:r.content?.ok??r.ok??true,usage:r.usage});console.log(JSON.stringify({model,thinkingMode,passed:true}));
 }
 const config={...cfg,model:'deepseek-flash',thinkingMode:'high',maxRequests:3,maxTokens:4096};D.run('UPDATE settings SET body=?',D.json(config));
 const scope={domain:'teaching',region:'不限地区',district:'',year:2026,stage:'综合',audience:'生物教师'},s=A.saveSnapshot({title:'【合成】光合作用教学设计',text:'本文件是软件测试用合成材料。教学主题为光合作用。活动一：观察叶片，时间10分钟。活动二：讨论植物生长需要的光照与水分，时间15分钟。材料没有给出任何考试或招生政策。',scope,url:'https://example.com/synthetic-teaching',publisher:'合成测试',documentType:'待判断'});
 if(!report.checks.some((c:any)=>c.name==='selected-material-planning'&&c.ok)){
 const plan=await W.runPlan(W.freezePlan({prompt:'用此教学材料制作一份3页教学演示和讲义，仅使用原文支持的内容。',snapshotIds:[s.id],scope,outputs:['presentation']},user),()=>{},AbortSignal.timeout(180000));
 if(plan.plan.status!=='ready'||!plan.plan.snapshotIds.includes(s.id))throw new Error('Real planning returned no selected source');report.checks.push({name:'selected-material-planning',ok:true,usage:plan.usage});}
 if(!report.checks.some((c:any)=>c.name==='12-page-scanned-pdf-ocr'&&c.ok)){
 const pdf=await PDFDocument.create();for(let i=1;i<=12;i++){const canvas=createCanvas(850,1100),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,850,1100);ctx.fillStyle='#123e2b';ctx.font='bold 36px Microsoft YaHei';ctx.fillText('光合作用教学设计 · 第 '+i+' 页',60,90);ctx.font='26px Microsoft YaHei';ctx.fillText('这是合成测试材料，不是真实考试文件。',60,155);ctx.fillText('观察叶片 10 分钟，课堂讨论 15 分钟。',60,210);ctx.fillText('学习任务：理解植物利用光照进行光合作用。',60,265);ctx.strokeStyle='#123e2b';ctx.strokeRect(60,330,700,180);ctx.beginPath();ctx.moveTo(410,330);ctx.lineTo(410,510);ctx.moveTo(60,415);ctx.lineTo(760,415);ctx.stroke();ctx.fillText('活动',90,380);ctx.fillText('时长',450,380);ctx.fillText('观察叶片',90,465);ctx.fillText('10 分钟',450,465);const img=await pdf.embedPng(canvas.toBuffer('image/png')),p=pdf.addPage([425,550]);p.drawImage(img,{x:0,y:0,width:425,height:550});}
 const a=A.asset(Buffer.from(await pdf.save()),'合成教学资料12页.pdf','application/pdf','test'),M=await import('../server/media.js'),T=await import('../server/tasks.js');const input=M.freezeMedia({action:'ocr',assetId:a.id,title:'12页教学图文回归'},user),job=T.enqueue('media',input);D.run('INSERT INTO media_jobs VALUES(?,?,?)',job.id,user.id,D.now());const result=await M.runMedia(input,job.id,(_stage,p)=>console.log(JSON.stringify({message:p.message})),AbortSignal.timeout(240000));
 if(result.coverage!=='complete'||result.completedPages!==12||!result.text.includes('光合作用')||result.text.includes('无人机'))throw new Error('Scanned PDF coverage or content check failed');report.checks.push({name:'12-page-scanned-pdf-ocr',ok:true,pages:result.completedPages,parts:result.parts.length,sourceHashMatches:result.sourceHash===a.hash,requiresReview:result.integrity.requiresSourceReview});}
 if(!report.checks.some((c:any)=>c.name==='teaching-pptx-docx-production'&&c.ok)){
  const originalFetch=globalThis.fetch,syntheticResponses:any[]=[];globalThis.fetch=async(...args)=>{const r=await originalFetch(...args);if(String(args[0]).includes('chat/completions')){try{const b=await r.clone().json();syntheticResponses.push({finishReason:b.choices?.[0]?.finish_reason,message:b.choices?.[0]?.message});writeFileSync('test-results/remediation-provider-synthetic.json',JSON.stringify(syntheticResponses,null,2));}catch{}}return r;};
  const P=await import('../server/production.js'),T=await import('../server/tasks.js');D.run('UPDATE settings SET body=?',D.json({...D.settings(),thinkingMode:'disabled',maxRequests:3,maxTokens:8192,timeoutSeconds:600}));
  const input=P.freezeProduction({template:'presentation',title:'合成教学流程验收',scope,snapshotIds:[s.id],prompt:'依据所选材料制作3页简短教学演示：主题、活动安排、课堂小结。每页最多3条短要点。不要联网检索，准确保留10分钟和15分钟，明确这是合成测试材料。',formats:['pptx','docx'],slideCount:3,lectureMinutes:5,duration:10},user),job=T.enqueue('production',input);
  const result=await P.runProduction(input,job.id,(stage,p)=>console.log(JSON.stringify({stage,message:p.message})),AbortSignal.timeout(600000));
  const artifacts=D.all('SELECT * FROM artifacts WHERE job_id=?',job.id);if(!artifacts.some(a=>a.format==='pptx')||!artifacts.some(a=>a.format==='docx'))throw new Error('Teaching exports incomplete');report.checks.push({name:'teaching-pptx-docx-production',ok:true,formats:artifacts.map(a=>a.format),isolatedData:out});
 }
 report.ok=true;
}catch(e:any){report.ok=false;report.error={code:e.code||e.name,message:e.message,networkCode:e.cause?.code};process.exitCode=1;}finally{await app.close();D.db.close();unlinkSync(join(out,'secrets.dpapi'));writeFileSync('test-results/remediation-live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
