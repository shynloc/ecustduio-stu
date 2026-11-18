import {z} from 'zod';
import {Scope,ImportInput} from '../shared/schema.js';
import {get,run,parse,json,settings,err} from './db.js';
import {importMaterial,createProject,saveVersion,addClaim} from './domain.js';
import {createVisualDraft} from './visual-studio.js';
import {workflowActor} from './workflow-agent.js';
import {publicUrl} from './security.js';
import {paginateText} from '../shared/visual.js';
export const WebVisualInput=z.object({url:z.string().url().max(3000),title:z.string().max(200).default(''),scope:Scope,designBrief:z.string().max(3000).default('整理为清晰可读的网页和可编辑演示稿，保留原文条件与引用')}).strict();
export async function runVisualWebImport(input:any,jobId:string,progress:any,signal:AbortSignal,transport:typeof fetch=fetch,importer=importMaterial){
 workflowActor(input.actorId);let c=parse(get('SELECT checkpoint FROM jobs WHERE id=?',jobId)?.checkpoint);
 const save=()=>run('UPDATE jobs SET checkpoint=? WHERE id=?',json(c),jobId);
 if(!c.snapshot){progress('import',{message:'安全导入网页正文与来源'});c.snapshot=await importer(ImportInput.parse({url:input.url,title:input.title||undefined,scope:input.scope,documentType:'待判断'}),signal);save();}
 signal.throwIfAborted();workflowActor(input.actorId);
 if(!c.version){
  const snapshot=c.snapshot,parts=paginateText(snapshot.body||snapshot.text||snapshot.paragraphs.map((p:any)=>p.text).join('\n'),180);
  if(parts.length>80)err('WEB_TOO_LONG','网页原文已存入资料库，超过80页。请从任务管家生成摘要后制作演示，避免静默删减原文。',422);
  if(!c.project){c.project=createProject({title:input.title||snapshot.title,scope:input.scope,snapshotIds:[snapshot.id]});save();}
  const existing=get("SELECT id FROM versions WHERE job_id=? AND kind='master'",jobId);
  if(existing)c.version={id:existing.id};
  else{
   const blocks=snapshot.paragraphs.flatMap((p:any)=>paginateText(p.text,180).map((text,index)=>{
    const claim=p.text.length>=5?addClaim({snapshotId:snapshot.id,paragraphId:p.id,quote:p.text,text:p.text}):null;
    return {id:p.id+'-'+index,title:'原文章节 '+p.id.replace(/^p/,''),text,claimIds:claim?[claim.id]:[],locked:false,notes:'网页原文导入，尚未完成人工事实核验'};
   }));
   if(blocks.length>80)err('WEB_TOO_LONG','网页段落超过80页，资料已导入，请先在任务管家整理摘要',422);
   c.version=saveVersion({projectId:c.project.id,kind:'master',body:{schemaVersion:'1.0',title:input.title||snapshot.title,summary:'从公开网页导入正文，原文和适用条件保留。',blocks,unverified:['网页内容未经人工核实；外部网页样式和脚本不会直接执行']},expectedRevision:get('SELECT revision FROM projects WHERE id=?',c.project.id).revision,origin:'web-visual-import',jobId});
  }save();
 }
 const visual=await createVisualDraft({actorId:input.actorId,versionId:c.version.id,designBrief:input.designBrief,config:input.config||settings()},jobId+':visual',progress,signal,transport);
 return {projectId:c.project.id,versionId:c.version.id,visualId:visual.id,snapshotId:c.snapshot.id,artifacts:[visual.artifact],message:'网页正文、来源和可编辑视觉项目已建立，可继续修改页面并制作 PPT、动图和视频。'};
}
export async function registerVisualWeb(app:any,enqueue:any){
 app.post('/api/visuals/from-web',async(req:any,reply:any)=>{workflowActor(req.user.id);const b=WebVisualInput.parse(req.body);await publicUrl(b.url);return reply.code(202).send(enqueue('visual-web-import',{...b,actorId:req.user.id,config:settings()}));});
}
