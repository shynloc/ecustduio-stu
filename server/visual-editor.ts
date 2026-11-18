import {registerVisualWeb} from './visual-web.js';
import {registerVisualMusic} from './visual-music.js';
import { z } from 'zod';
import { id, err, settings,get } from './db.js';
import { VisualDesign, VisualRevision, buildVisualMaster } from '../shared/visual.js';
import { SceneList, SceneEdit, editableScenes, applySceneEdits,sceneLayouts,sceneMotions,normalizeAIScenes } from '../shared/visual-edit.js';
import { masterHtml } from './visual-document.js';
import { createVisualDraft, visualView, visualAssets } from './visual-studio.js';
import { structuredTask,workflowActor } from './workflow-agent.js';
import { checkVisualSource } from './visual-export.js';

const previews=new Map<string,{owner:string;visualId:string;html:string;expires:number}>();
export function getDraftPreview(token:string,visualId:string,owner:string){
  const item=previews.get(token);
  if(!item||item.owner!==owner||item.visualId!==visualId||item.expires<Date.now())err('PREVIEW_EXPIRED','编辑预览已过期，请修改内容或刷新预览',404);
  return item.html;
}
const AssistantInput=z.object({visualHash:z.string(),prompt:z.string().trim().min(2).max(3000),sceneId:z.string().max(160).optional(),design:VisualDesign,assetIds:z.array(z.string().max(120)).max(8),scenes:SceneList}).strict();
export async function runVisualAssistant(input:any,jobId:string,progress:any,signal:AbortSignal,transport:typeof fetch=fetch){
  const actor=workflowActor(input.actorId),v=visualView(input.visualId,actor);checkVisualSource(v);
  if(v.visualHash!==input.visualHash)err('VERSION_CONFLICT','视觉版本已变化，请重新提交',409);
  const existing=get('SELECT id FROM visual_drafts WHERE job_id=?',jobId);
  if(existing){const saved=visualView(existing.id,actor);return {visualId:saved.id,projectId:v.body.projectId,artifacts:[saved.artifact],message:'已恢复本任务生成的修订版，请核对文案和画面。'};}
  const sceneId=input.sceneId,base=v.body.master||buildVisualMaster(v.body.copy,v.body.design);
  const current=applySceneEdits({...base,design:input.design,assets:visualAssets(input.assetIds,input.actorId)},input.scenes);
  if(sceneId&&!current.scenes.some((s:any)=>s.id===sceneId))err('SCENE_NOT_FOUND','指定页面不存在',404);
  const response=await structuredTask({actorId:input.actorId,config:input.config||settings(),requiredSkills:['html-creator-studio','gif-factory'],schema:z.object({design:VisualDesign,scenes:SceneList,summary:z.string().max(1200)}).strict(),
    instruction:`先使用 read_skill 读取 html-creator-studio 和 gif-factory，统一规划页面和动效。输出 JSON {design,scenes,summary}。design 保留结构。每个 scene 包含 id,blockId,title,text,notes,claimIds,narration,layout,assetIds,items,seconds,hold,motion,gifSeconds,transparent，可选 table:{headers,rows}。layout 为 ${Object.keys(sceneLayouts).join('|')}；motion 为 ${Object.keys(sceneMotions).join('|')}。每页 text 最多1800字，建议不超过180字；title最多300字；items最多8项，每项300字；table最多6列8行。seconds为1-60，hold为0-10，gifSeconds为1-6。只使用上下文中给出的素材、事实ID和原始blockId，新增页可用空blockId和空claimIds；不得编造政策日期、条件或数字。保留用户未要求更改的内容。${sceneId?'只返回当前指定的一页，保留其ID，不改其他页。':'按用户要求返回完整场景列表，保持稳定ID，新建页使用不重复的新ID。'} 不返回代码、不自动发布。`,
    context:{request:input.prompt,design:current.design,scenes:sceneId?current.scenes.filter((s:any)=>s.id===sceneId):current.scenes,sourceCopy:v.body.copy,evidence:base.evidence||[],assets:current.assets.map((a:any)=>({id:a.id,name:a.name})),allowedBlockIds:[...new Set(base.scenes.map((s:any)=>s.blockId))]}},progress,signal,transport);
  let scenes=normalizeAIScenes(response.content.scenes);
  if(sceneId){if(scenes.length!==1)err('MODEL_SCHEMA_INVALID','单页编辑必须返回一页，请重试',422);scenes=current.scenes.map((s:any)=>s.id===sceneId?{...scenes[0],id:sceneId}:s);}
  // Validate references against the immutable source master, not AI-supplied claims.
  applySceneEdits({...base,assets:current.assets},scenes);
  const revised=await createVisualDraft({actorId:input.actorId,versionId:v.versionId,copyHash:v.copyHash,design:sceneId?input.design:response.content.design,assetIds:input.assetIds,scenes,parentId:v.id,workflowJobId:v.body.workflowJobId,skill:response.toolLog,duration:v.body.duration},jobId,progress,signal,transport);
  return {visualId:revised.id,projectId:v.body.projectId,artifacts:[revised.artifact],usage:response.usage,message:response.content.summary+'；已另存为修订版，请核对文案和画面。'};
}
export async function registerVisualEditor(app:any,enqueue:any){
  await registerVisualWeb(app,enqueue);
  registerVisualMusic(app);
  app.post('/api/visuals/:id/draft-preview',async(req:any)=>{
    workflowActor(req.user.id,false);const v=visualView(req.params.id,req.user),b=VisualRevision.parse(req.body);
    if(b.visualHash!==v.visualHash)err('VERSION_CONFLICT','视觉版本已变化',409);
    const base=v.body.master||buildVisualMaster(v.body.copy,v.body.design);
    const assets=visualAssets(b.assetIds,req.user.id).map(a=>({...a,frames:base.assets.find((x:any)=>x.id===a.id)?.frames}));
    const master=applySceneEdits({...base,design:b.design,assets},b.scenes||editableScenes(base));
    for(const [key,p]of previews)if(p.expires<Date.now()||p.owner===req.user.id&&p.visualId===v.id)previews.delete(key);
    if(previews.size>=100)previews.delete(previews.keys().next().value!);
    const html=masterHtml(master),bytes=Buffer.byteLength(html);
    if(bytes>64*1024*1024)err('PREVIEW_TOO_LARGE','预览素材过大，请减少动图或缩小图片',422);
    while(previews.size&&[...previews.values()].reduce((n,p)=>n+Buffer.byteLength(p.html),bytes)>128*1024*1024)previews.delete(previews.keys().next().value!);
    const token=id();previews.set(token,{owner:req.user.id,visualId:v.id,html,expires:Date.now()+10*60*1000});
    return {url:'/api/visuals/'+v.id+'/preview?draft='+token,scenes:master.scenes.length};
  });
  app.post('/api/visuals/:id/assistant',async(req:any,reply:any)=>{
    workflowActor(req.user.id);const v=visualView(req.params.id,req.user);checkVisualSource(v);
    const b=AssistantInput.parse(req.body);if(b.visualHash!==v.visualHash)err('VERSION_CONFLICT','视觉版本已变化',409);
    const base=v.body.master||buildVisualMaster(v.body.copy,v.body.design);
    applySceneEdits({...base,assets:visualAssets(b.assetIds,req.user.id)},b.scenes);
    return reply.code(202).send(enqueue('visual-assistant',{...b,actorId:req.user.id,visualId:v.id,config:settings()}));
  });
}
