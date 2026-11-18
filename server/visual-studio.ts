import { get, all, run, tx, parse, json, hash, id, now, requireRow, err, settings, audit, root } from './db.js';
import { join, sep } from 'node:path';
import { mkdtempSync,readFileSync,writeFileSync,rmSync } from 'node:fs';
import { imageSize } from 'image-size';
import { asset, assetBuffer, versionView, snapshotView } from './domain.js';
import { checkMediaAsset, grantMediaAsset } from './media-access.js';
import { structuredTask, workflowActor } from './workflow-agent.js';
import { VisualDesign, VisualCreate, VisualRevision, VisualExport, buildVisualMaster } from '../shared/visual.js';
import { musicAsset } from './visual-audio.js';
import { applySceneEdits } from '../shared/visual-edit.js';
import { getDraftPreview, registerVisualEditor } from './visual-editor.js';
import { masterHtml } from './visual-document.js';
import { visualBrowser, visualCapabilities, command, gifPython } from './visual-runtime.js';
import { checkVisualSource } from './visual-export.js';
export { approveVisual, runVisualVideo } from './visual-legacy.js';

export function visualHtml(copy:any,design:any) { return masterHtml(buildVisualMaster(copy,design)); }
export async function inspectVisual(html:string,signal:AbortSignal) {
  const browser=await visualBrowser(),qa:any={engine:'Chromium',screenshots:[],horizontalOverflow:false};
  try{
    const context=await browser.newContext({serviceWorkers:'block'});await context.route('**/*',r=>r.abort());
    const page=await context.newPage();page.setDefaultTimeout(15000);
    for(const [name,width,height] of [['desktop',1440,900],['mobile',390,844]] as const){
      signal.throwIfAborted();await page.setViewportSize({width,height});await page.setContent(html,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
      qa.horizontalOverflow ||= await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
      const a=asset(await page.screenshot({fullPage:true}),`网页预览_${name}.png`,'image/png','artifact');qa.screenshots.push({name,width,height,assetId:a.id});
    }
    if(qa.horizontalOverflow)err('VISUAL_OVERFLOW','网页存在水平溢出，请调整设计',422);
    return qa;
  }finally{await browser.close();}
}
export function visualAssets(ids:string[],actorId:string) {
  let total=0;
  return [...new Set(ids)].map(aid=>{
    checkMediaAsset(aid,{id:actorId,role:get('SELECT role FROM users WHERE id=?',actorId).role});
    const {a,data}=assetBuffer(aid);
    total+=data.length;if(total>12*1024*1024)err('VISUAL_ASSET_INVALID','共享配图总大小最多12MB，请缩小素材后继续',422);
    if(!['image/png','image/jpeg','image/webp','image/gif'].includes(a.mime)||data.length>3*1024*1024)err('VISUAL_ASSET_INVALID','视觉配图需为 PNG/JPEG/WebP/GIF，每张最多3MB',422);
    const size=imageSize(data);if(!size.width||!size.height||size.width*size.height>16000000)err('VISUAL_ASSET_INVALID','配图尺寸超过限制',422);
    return {id:a.id,hash:a.hash,name:a.name,mime:a.mime,data:`data:${a.mime};base64,${data.toString('base64')}`};
  });
}
export async function createVisualDraft(input:any,jobId:string,progress:any,signal:AbortSignal,transport:typeof fetch=fetch) {
  workflowActor(input.actorId,!input.design);
  const previous=get('SELECT id FROM visual_drafts WHERE job_id=? AND version_id=?',jobId,input.versionId);
  if(previous)return visualView(previous.id,{id:input.actorId,role:'creator'});
  const version=versionView(requireRow(get('SELECT * FROM versions WHERE id=?',input.versionId)));
  if(version.stale)err('COPY_STALE','此版本的来源已变化，请先生成新版内容',409);
  if(input.copyHash&&hash(version.body)!==input.copyHash)err('COPY_STALE','提交后文案发生变化，请重新创建',409);
  const project=requireRow(get('SELECT * FROM projects WHERE id=?',version.project_id));
  const sources=parse(project.snapshot_ids,[]).map((sid:string)=>requireRow(get('SELECT id,title,url FROM snapshots WHERE id=?',sid)));
  const assets=visualAssets(input.assetIds||[],input.actorId);
  for(const a of assets)if(a.mime==='image/gif'){
    const {dataDir}=await import('./db.js'),folder=mkdtempSync(join(dataDir,'staging','gif-decode-'));
    try{
      const python=await gifPython(signal),source=join(folder,'source.gif'),out=join(folder,'frames.json');
      writeFileSync(source,assetBuffer(a.id).data);
      await command(python.file,[...python.args,join(root,'scripts/gif-factory-decode.py'),source,out],signal);
      (a as any).frames=parse(readFileSync(out,'utf8'),[]);
      if(assets.reduce((sum,item)=>sum+((item as any).frames||[]).reduce((n:number,f:any)=>n+f.data.length,0),0)>24*1024*1024)err('VISUAL_ASSET_INVALID','动图解码后的帧总大小超过24MB，请减少动图或使用静态封面',422);
    }finally{
      // mkdtemp produced this direct child of the explicitly selected staging directory.
      if(folder.startsWith(join(dataDir,'staging')+sep))rmSync(folder,{recursive:true,force:true});
    }
  }
  const response=input.design?{content:VisualDesign.parse(input.design),toolLog:input.skill||[],usage:null}:await structuredTask({
    actorId:input.actorId,config:input.config||settings(),snapshots:parse(project.snapshot_ids,[]).map((sid:string)=>snapshotView(requireRow(get('SELECT * FROM snapshots WHERE id=?',sid)))),requiredSkill:'html-creator-studio',schema:VisualDesign,
    instruction:'必须先调用 read_skill 读取 html-creator-studio。为同一个创作项目设计网页、演示稿、动图和视频共享的视觉规范。支持 editorial、cards、timeline、comparison。只返回 JSON {name,rationale,layout,background,foreground,accent,font,density}。三个颜色为#六位十六进制；font为serif或sans-serif；density为spacious或compact。高对比、手机可读。宿主绑定原文与来源，按章节分页并输出原生可编辑PPT文字；不要改写文案、返回代码或虚构批准。',
    context:{brief:input.designBrief,copy:version.body,assets:assets.map(a=>({id:a.id,name:a.name,mime:a.mime})),videoDuration:input.duration}},progress,signal,transport);
  let master=buildVisualMaster(version.body,response.content,sources,assets);
  master.evidence=[...new Set<string>(master.scenes.flatMap(s=>s.claimIds))].map(cid=>{
    const c=get('SELECT c.*,s.title,s.url FROM claims c JOIN snapshots s ON s.id=c.snapshot_id WHERE c.id=?',cid);
    return c?{id:c.id,quote:c.quote,snapshotId:c.snapshot_id,paragraphId:c.paragraph_id,title:c.title,url:c.url}:null;
  }).filter(Boolean) as any;
  if(input.scenes)master=applySceneEdits(master,input.scenes);
  if(input.parentId){const previousMaster=parse(get('SELECT body FROM visual_drafts WHERE id=?',input.parentId)?.body).master;for(const s of master.scenes)if(previousMaster?.scenes.find((x:any)=>x.id===s.id)?.edited)s.edited=true;}
  const body={copy:version.body,master,design:response.content,duration:input.duration||45,projectId:version.project_id,
    workflowJobId:input.workflowJobId||jobId.replace(/:(html|video|visual)$/,''),parentId:input.parentId||null,
    skill:response.toolLog,engine:'EcuStudio shared visual master',usage:response.usage};
  const html=masterHtml(master);progress('visual_qa',{message:'检查共享设计的桌面和手机页面'});
  const qa=await inspectVisual(html,signal);signal.throwIfAborted();workflowActor(input.actorId,false);
  if(get('SELECT stale FROM versions WHERE id=?',version.id)?.stale)err('COPY_STALE','制作期间来源变化，保留旧版，请重新创建',409);
  const a=asset(Buffer.from(html),version.body.title.replace(/[\\/:*?"<>|]/g,'_')+'_视觉网页.html','text/html','artifact'),vid=id();
  tx(()=>{
    run('INSERT INTO visual_drafts VALUES(?,?,?,?,?,?,?,?,?,?)',vid,input.actorId,version.id,jobId,json(body),hash(body.copy),hash(html),a.id,json(qa),now());
    run('INSERT INTO artifacts VALUES(?,?,?,?,?,?,?,?,?)',id(),a.id,version.id,'draft','html',json({visualId:vid,ownerId:input.actorId,projectId:project.id}),json(qa),jobId,now());
    for(const aid of [a.id,...qa.screenshots.map((s:any)=>s.assetId)])grantMediaAsset(aid,input.actorId);
  });
  return visualView(vid,{id:input.actorId,role:'creator'});
}
export function visualView(vid:string,user:any) {
  const row=requireRow(get('SELECT * FROM visual_drafts WHERE id=?',vid));
  if(user.role!=='admin'&&row.owner_id!==user.id)err('FORBIDDEN','无权访问此视觉项目',403);
  const body=parse(row.body),a=requireRow(get("SELECT * FROM artifacts WHERE job_id=? AND format='html'",row.job_id));
  const exports=all("SELECT a.*,s.name FROM artifacts a JOIN assets s ON s.id=a.asset_id WHERE json_extract(a.manifest,'$.visualId')=? ORDER BY a.created_at DESC",vid);
  return {id:vid,versionId:row.version_id,copyHash:row.copy_hash,visualHash:row.visual_hash,body,
    html:assetBuffer(row.html_asset_id).data.toString('utf8'),qa:parse(row.qa),stale:!!get('SELECT stale FROM versions WHERE id=?',row.version_id)?.stale||!!body.master?.sources.some((s:any)=>get('SELECT id FROM snapshots WHERE previous_id=? LIMIT 1',s.id)),
    artifact:{...a,name:get('SELECT name FROM assets WHERE id=?',row.html_asset_id).name},exports};
}
export function approveVisualExport(vid:string,raw:any,user:any,enqueue:any,key?:string,parentProductionId?:string) {
  workflowActor(user.id,false);const v=visualView(vid,user),options=VisualExport.parse(raw);checkVisualSource(v);
  if(options.copyHash!==v.copyHash||options.visualHash!==v.visualHash)err('APPROVAL_STALE','内容或设计已变化，请重新核对',409);
  if(!v.body.master)err('VISUAL_UPGRADE_REQUIRED','请保存设计新版本后再导出',409);
  if(new Set(options.outputs).size!==options.outputs.length)err('DUPLICATE_OUTPUT','输出类型重复',422);
  if(options.outputs.includes('gif'))for(const s of v.body.master.scenes.filter((s:any)=>(options.gifSceneIds||[v.body.master.scenes[0].id]).includes(s.id))){
    if(s.motion==='steps'&&(!['steps','comparison'].includes(s.layout)||!s.items?.some((x:string)=>x.trim())))err('GIF_MOTION_EMPTY','“逐项展示”需要步骤或对比版式中的条目，请填写条目或改选“标题与正文揭示”',422);
  }
  if(options.outputs.includes('gif')&&v.body.master.scenes.some((s:any)=>(!options.gifSceneIds||options.gifSceneIds.includes(s.id))&&(!s.motion||s.motion==='auto'))||options.outputs.includes('mp4')&&options.voice!=='none')workflowActor(user.id);
  if(options.musicAssetId)musicAsset(options.musicAssetId,user.id);
  const requestKey='visual-export:'+user.id+':'+(key||id()),requestHash=hash({vid,options});
  const old=get('SELECT * FROM jobs WHERE idempotency_key=?',requestKey);if(old){if(parse(old.input).requestHash!==requestHash)err('IDEMPOTENCY_CONFLICT','相同请求键不能用于不同输出',409);return {id:old.id,state:old.state};}
  return tx(()=>{const aid=id();run('INSERT INTO visual_approvals VALUES(?,?,?,?,?,?,?)',aid,vid,user.id,v.copyHash,v.visualHash,json(options),now());
    const job=enqueue('visual-export',{actorId:user.id,visualId:vid,approvalId:aid,options,requestHash,...(parentProductionId?{parentProductionId}:{}),config:{...settings(),timeoutSeconds:3600}},requestKey);
    if(parentProductionId)run("UPDATE jobs SET checkpoint=json_set(COALESCE(checkpoint,'{}'),'$.deliveryJobId',?) WHERE id=?",job.id,parentProductionId);
    audit('visual.export',vid,{actor:user.id,outputs:options.outputs,approvalId:aid});return job;});
}
export async function runVisualCreate(input:any,jobId:string,progress:any,signal:AbortSignal) {
  const v=await createVisualDraft(input,jobId,progress,signal);
  return {visualId:v.id,projectId:v.body.projectId,artifacts:[v.artifact],message:'共享视觉项目已建立，可继续制作网页、演示、动图和视频。'};
}
export async function runVisualRuntime(input:any,progress:any,signal:AbortSignal) {
  workflowActor(input.actorId,false);if(get('SELECT role FROM users WHERE id=?',input.actorId)?.role!=='admin')err('FORBIDDEN','仅管理员可以安装依赖',403);
  progress('install',{message:'正在为动图建立独立 Python 环境并安装 Pillow'});
  await command(process.execPath,[join(root,'scripts/setup-gif-runtime.mjs')],signal,360000);
  return {capabilities:await visualCapabilities(),message:'动图运行环境已准备好'};
}
export async function registerVisualStudio(app:any,enqueue:any) {
  await registerVisualEditor(app,enqueue);
  app.get('/api/visuals/:id/preview',async(req:any,reply:any)=>{
    const v=visualView(req.params.id,req.user);
    const source=req.query.draft?getDraftPreview(req.query.draft,v.id,req.user.id):v.html;
    const html=req.query.mode==='slides'?source.replace('</body>','<script>document.getElementById("present")?.click()</script></body>'):source;
    return reply.type('text/html; charset=utf-8').send(html);
  });
  app.get('/api/visual-runtime',async()=>visualCapabilities());
  app.post('/api/visual-runtime/install',async(req:any,reply:any)=>{if(req.user.role!=='admin')err('FORBIDDEN','仅管理员可以安装依赖',403);return reply.code(202).send(enqueue('visual-runtime',{actorId:req.user.id,config:{timeoutSeconds:600}}));});
  app.post('/api/visuals/from-version',async(req:any,reply:any)=>{
    const b=VisualCreate.parse(req.body);workflowActor(req.user.id);const v=requireRow(get('SELECT * FROM versions WHERE id=?',b.versionId));
    visualAssets(b.assetIds,req.user.id);
    return reply.code(202).send(enqueue('visual-create',{...b,copyHash:hash(parse(v.body)),actorId:req.user.id,config:settings()}));
  });
  app.post('/api/visuals/:id/revise',async(req:any,reply:any)=>{
    workflowActor(req.user.id,false);const b=VisualRevision.parse(req.body),v=visualView(req.params.id,req.user);checkVisualSource(v);
    if(b.visualHash!==v.visualHash)err('VERSION_CONFLICT','当前设计已变化，请刷新',409);visualAssets(b.assetIds,req.user.id);
    return reply.code(202).send(enqueue('visual-create',{versionId:v.versionId,copyHash:v.copyHash,design:b.design,assetIds:b.assetIds,scenes:b.scenes,duration:v.body.duration,parentId:v.id,workflowJobId:v.body.workflowJobId,skill:v.body.skill,actorId:req.user.id,config:{timeoutSeconds:600}}));
  });
  app.post('/api/visuals/:id/export',async(req:any,reply:any)=>reply.code(202).send(approveVisualExport(req.params.id,req.body,req.user,enqueue,req.headers['idempotency-key'])));
  app.get('/api/projects/:id/visuals',async(req:any)=>all('SELECT * FROM visual_drafts WHERE version_id IN (SELECT id FROM versions WHERE project_id=?) ORDER BY created_at DESC',req.params.id).filter(v=>req.user.role==='admin'||v.owner_id===req.user.id).map(v=>({id:v.id,versionId:v.version_id,createdAt:v.created_at,name:parse(v.body).design.name,parentId:parse(v.body).parentId,stale:!!get('SELECT stale FROM versions WHERE id=?',v.version_id)?.stale})));
}
