import { z } from 'zod';
import type { VisualMaster, Scene, VisualAsset } from './visual.js';

export const sceneLayouts = {auto:'沿用整体布局',title:'标题封面',text:'正文阅读', 'image-left':'左图右文','image-right':'左文右图',steps:'步骤流程',comparison:'对比卡片',quote:'引文重点',table:'数据表格'} as const;
export const sceneMotions = {auto:'AI 选择',none:'静止',progress:'进度线展开',pulse:'轻微呼吸',sway:'轻微摆动',reveal:'标题与正文揭示',pan:'图片缓慢移动',steps:'逐项展示',sequence:'图片序列播放'} as const;
export const SceneEdit = z.object({
  id:z.string().min(1).max(160),blockId:z.string().max(160).default(''),
  title:z.string().max(300),text:z.string().max(1800),notes:z.string().max(3000).default(''),
  claimIds:z.array(z.string().max(120)).max(30).default([]),narration:z.string().max(3000).default(''),
  layout:z.enum(['auto','title','text','image-left','image-right','steps','comparison','quote','table']).default('auto'),
  assetIds:z.array(z.string().max(120)).max(8).optional(),items:z.array(z.string().max(300)).max(8).default([]),
  table:z.object({headers:z.array(z.string().max(100)).max(6),rows:z.array(z.array(z.string().max(180)).max(6)).max(8)}).optional(),
  seconds:z.number().min(1).max(60).default(5),hold:z.number().min(0).max(10).default(.4),
  motion:z.enum(['auto','none','progress','pulse','sway','reveal','pan','steps','sequence']).default('auto'),
  gifSeconds:z.number().min(1).max(6).default(3),transparent:z.boolean().default(true),
});
export type EditableScene=z.infer<typeof SceneEdit>;
export const SceneList=z.array(SceneEdit).min(1).max(80);
export function normalizeAIScenes(raw:unknown):EditableScene[]{
  return SceneList.parse(raw).map(scene=>{
    const s={...scene};
    if(['steps','comparison'].includes(s.layout)&&!s.items.some(x=>x.trim())){
      s.items=(s.table?.rows.length?s.table.rows.map(row=>row.filter(Boolean).join(' · ')):s.text.split(/[；;\n]+/)).map(x=>x.trim()).filter(Boolean).slice(0,8).map(x=>x.slice(0,300));
    }
    if(s.motion==='steps'&&(!['steps','comparison'].includes(s.layout)||!s.items.length))s.motion='reveal';
    return s;
  });
}
export function editableScenes(master:VisualMaster):EditableScene[]{
  return master.scenes.map((scene,index)=>SceneEdit.parse({...scene,assetIds:scene.assetIds??(master.assets.length?[master.assets[index%master.assets.length].id]:[])}));
}
export function sceneAssets(master:VisualMaster,scene:Scene):VisualAsset[]{
  const ids=scene.assetIds??(master.assets.length?[master.assets[scene.index%master.assets.length].id]:[]);
  return ids.map(id=>master.assets.find(a=>a.id===id)).filter(Boolean) as VisualAsset[];
}
export function applySceneEdits(master:VisualMaster,raw:unknown):VisualMaster{
  const invalid=(message:string)=>{throw Object.assign(new Error(message),{code:'VISUAL_EDIT_INVALID',statusCode:422})};
  const list=SceneList.parse(raw),ids=new Set<string>();
  const claims=new Set([...master.scenes.flatMap(s=>s.claimIds),...(master.evidence||[]).map(c=>c.id)]);
  const blocks=new Set(master.scenes.map(s=>s.blockId));
  const content=(s:any)=>JSON.stringify([s.title,s.text,s.narration,s.items||[],s.table]);
  const scenes=list.map((s,index)=>{
    if(ids.has(s.id))invalid('场景 ID 重复，请重新复制或新增页面');ids.add(s.id);
    if(s.blockId&&!blocks.has(s.blockId))invalid('场景引用了不属于此项目的内容章节');
    if(s.claimIds.some(id=>!claims.has(id)))invalid('场景引用了未授权的事实');
    if(s.assetIds?.some(id=>!master.assets.some(a=>a.id===id)))invalid('请先将所选配图加入共享素材');
    if(s.table&&s.table.rows.some(row=>row.length!==s.table!.headers.length))invalid('表格每行的列数必须与表头一致');
    const previous=master.scenes.find(x=>x.id===s.id);
    return {...s,index,edited:previous?.edited||!previous||content(previous)!==content(s)};
  });
  return {...master,scenes};
}
export function narrationParts(text:string,mode:'scene'|'sentence'|'off'){
  if(mode!=='sentence')return text.trim()?[text.trim()]:[];
  const parts:string[]=[];let current='';
  for(const segment of text.match(/[^。！？!?；;\n]+[。！？!?；;\n]*|[。！？!?；;\n]+/gu)||[]){
    if(current&&Array.from(current+segment).length>65){parts.push(current.trim());current='';}
    current+=segment;
  }
  if(current.trim())parts.push(current.trim());
  return parts.flatMap(part=>{const chars=Array.from(part),result:string[]=[];while(chars.length)result.push(chars.splice(0,100).join(''));return result;}).filter(Boolean);
}
