import {sourceStatus,lineage} from './lineage.js';
export {sourceStatus} from './lineage.js';
import {z} from 'zod';
import {get,all,run,tx,parse,json,id,now,hash,err,requireRow} from './db.js';
import {owned,noteView} from './explore.js';
import {knowledgeView,Categories,saveDocument,preserveNote} from './knowledge.js';
import {snapshotView,saveSnapshot,versionView} from './domain.js';
import {checkMediaAsset,ownedMedia,grantMediaAsset} from './media-access.js';
import {checkJobAccess} from './auth.js';
import {creationDefaults} from '../shared/creation.js';
import {makeBundle} from './workflows.js';
const Ref=z.object({kind:z.enum(['note','snapshot','project','version','message','media','asset']),id:z.string().min(1).max(100),revision:z.number().int().optional(),hash:z.string().max(64).optional()}).strict();
export function resolveRef(ref:any,user:any){
 let row:any;
 if(ref.kind==='note')row=noteView(owned('notes',ref.id,user));
 else if(ref.kind==='snapshot')row=snapshotView(requireRow(get('SELECT * FROM snapshots WHERE id=?',ref.id)));
 else if(ref.kind==='project')row=requireRow(get('SELECT * FROM projects WHERE id=?',ref.id));
 else if(ref.kind==='version')row=versionView(requireRow(get('SELECT * FROM versions WHERE id=?',ref.id)));
 else if(ref.kind==='message'){row=requireRow(get('SELECT * FROM messages WHERE id=?',ref.id));owned('conversations',row.conversation_id,user);}
 else if(ref.kind==='media'){row=ownedMedia(ref.id,user);row={...row,result:parse(row.result)};}
 else {row=requireRow(get('SELECT id,name,mime,size,hash FROM assets WHERE id=?',ref.id));checkMediaAsset(ref.id,user);}
 const digest=hash({body:row.body??row.content??row.result??row.hash,sources:row.sources,scope:row.scope,snapshotIds:row.snapshot_ids,revision:row.revision});
 if(ref.hash&&ref.hash!==digest||ref.revision!==undefined&&row.revision!==ref.revision)err('CONTEXT_STALE','引用的资料已更新，请重新从来源载入；当前内容仍保留',409);
 return {ref:{kind:ref.kind,id:ref.id,hash:digest,...(row.revision?{revision:row.revision}:{})},value:row};
}

function evidence(kind:string,entityId:string,user:any){
 const {value:r}=resolveRef({kind,id:entityId},user);let blocks:any[]=[],digest='';
 if(kind==='snapshot'){digest=hash({body:r.hash,scope:r.scope});blocks=r.paragraphs.map((p:any)=>({id:p.id,text:p.text,page:p.page||null,region:null,method:'source-text',assetId:r.asset_id||null}));blocks.push(...r.figures.map((f:any,i:number)=>({id:'figure-'+i,text:f.text||f.description||'',page:f.page||null,region:null,method:'image-recognition',...f})));}
 else if(kind==='media'){const out=r.result;digest=out.sourceHash||hash(out);blocks=(out.parts?.length?out.parts:[{text:out.text,pageStart:1,pageEnd:out.pageCount}]).map((p:any,i:number)=>({id:'part-'+i,text:p.text||'',pageStart:p.pageStart??p.start??null,pageEnd:p.pageEnd??p.end??null,region:p.region||null,method:out.action,assetId:out.sourceAssetId,coverage:out.coverage}));}
 else err('EVIDENCE_KIND','请选择原始资料或识别任务',422);
 for(const b of blocks)run('INSERT OR IGNORE INTO evidence_blocks VALUES(?,?,?,?,?,?)',hash({kind,entityId,digest,id:b.id}),kind,entityId,digest,json(b),now());
 return {kind,id:entityId,hash:digest,blocks,lineage:lineage(kind,entityId),reviews:all('SELECT actor_id,created_at FROM evidence_reviews WHERE source_kind=? AND source_id=? AND source_hash=?',kind,entityId,digest)};
}
export async function registerPipeline(app:any){
 app.post('/api/contexts',async(req:any)=>{const b=z.object({refs:z.array(Ref).min(1).max(20),purpose:z.enum(['explore','production','speech','steward','input']).default('production'),returnTo:z.string().regex(/^[a-z]+(?:\/[a-zA-Z0-9_-]+)?$/).default('input')}).strict().parse(req.body);const refs=b.refs.map(r=>resolveRef(r,req.user).ref),cid=id();run('INSERT INTO context_refs VALUES(?,?,?,?)',cid,req.user.id,json({...b,refs}),now());return {id:cid};});
 app.get('/api/contexts/:id',async(req:any)=>{const c=requireRow(get('SELECT * FROM context_refs WHERE id=?',req.params.id));if(c.owner_id!==req.user.id)err('FORBIDDEN','此交接记录属于其他账号',403);const body=parse(c.body);return {...body,id:c.id,items:body.refs.map((r:any)=>resolveRef(r,req.user))};});
 app.get('/api/evidence/:kind/:id',async(req:any)=>evidence(req.params.kind,req.params.id,req.user));
 app.post('/api/evidence/:kind/:id/review',async(req:any)=>{const b=z.object({hash:z.string(),confirmed:z.literal(true)}).strict().parse(req.body),e=evidence(req.params.kind,req.params.id,req.user);if(b.hash!==e.hash)err('VERSION_CONFLICT','来源已变化，请重新核对',409);run('INSERT OR REPLACE INTO evidence_reviews VALUES(?,?,?,?,?)',e.kind,e.id,e.hash,req.user.id,now());return {ok:true};});
 app.post('/api/knowledge/batch',async(req:any)=>{const b=z.object({notes:z.array(z.object({id:z.string(),revision:z.number().int()})).min(1).max(100),categories:Categories.partial()}).strict().parse(req.body);if(new Set(b.notes.map(n=>n.id)).size!==b.notes.length)err('DUPLICATE_NOTE','请勿重复选择笔记');const notes=b.notes.map(ref=>{const n=owned('notes',ref.id,req.user);if(n.revision!==ref.revision)err('VERSION_CONFLICT','部分笔记已更新，请刷新列表后重试',409);return n;});return tx(()=>{const before=notes.map(n=>({id:n.id,categories:knowledgeView(n).categories,revision:n.revision+1}));for(const n of notes){const view=knowledgeView(n);preserveNote(n);run('UPDATE notes SET revision=revision+1,updated_at=? WHERE id=?',now(),n.id);saveDocument({...n,revision:n.revision+1},view.documentJson,{...view.categories,...b.categories});}const op=id();run('INSERT INTO knowledge_operations VALUES(?,?,?,0,?)',op,req.user.id,json(before),now());return {operationId:op,count:notes.length};});});
 app.post('/api/knowledge/undo/:id',async(req:any)=>{const op=requireRow(get('SELECT * FROM knowledge_operations WHERE id=?',req.params.id));if(op.owner_id!==req.user.id)err('FORBIDDEN','无法撤销其他账号的操作',403);if(op.undone)err('ALREADY_UNDONE','此操作已撤销',409);const rows=parse(op.body,[]).map((b:any)=>{const n=owned('notes',b.id,req.user);if(n.revision!==b.revision)err('VERSION_CONFLICT','操作后笔记已有新修改，撤销不会覆盖新内容',409);return {n,b};});return tx(()=>{for(const {n,b}of rows){const d=knowledgeView(n);preserveNote(n);run('UPDATE notes SET revision=revision+1,updated_at=? WHERE id=?',now(),n.id);saveDocument({...n,revision:n.revision+1},d.documentJson,b.categories);}run('UPDATE knowledge_operations SET undone=1 WHERE id=?',op.id);return {ok:true};});});
 app.post('/api/pipeline/prepare',async(req:any)=>{
 const b=z.object({refs:z.array(Ref).min(1).max(20),shareNotes:z.boolean().default(false),reviewed:z.boolean().default(false)}).strict().parse(req.body),items=b.refs.map(r=>resolveRef(r,req.user));
 for(const {ref,value:n}of items){if(!['note','snapshot'].includes(ref.kind))err('INVALID_SOURCE','请选择笔记或共享资料');if(ref.kind==='note'){if(!b.shareNotes)err('SHARING_REQUIRED','请确认将所选笔记版本转为团队可见的创作素材',409);const sources=parse(typeof n.sources==='string'?n.sources:json(n.sources),[]);if(sources.some((s:any)=>s.coverage==='partial'))err('SOURCE_INCOMPLETE','部分识别笔记不能作为完整原件使用，请先完成识别',409);if(sources.some((s:any)=>s.needsReview)&&!b.reviewed)err('SOURCE_REVIEW_REQUIRED','请对照原件核对后确认',409);}if(sourceStatus(ref.kind,ref.id).some(s=>s.reason.includes('新版')))err('SOURCE_STALE','所选材料存在新版，请重新选择最新来源',409);}
 const snapshots=items.map(({ref,value:n})=>{if(ref.kind==='snapshot')return n;const old=get('SELECT snapshot_id FROM note_materials WHERE note_id=? AND revision=?',n.id,n.revision);if(old)return snapshotView(get('SELECT * FROM snapshots WHERE id=?',old.snapshot_id));const defaults=creationDefaults([{title:n.title,scope:{domain:'general',region:'不限地区',district:'',stage:'综合',year:new Date().getFullYear(),audience:'相关读者'}}], '成果');const s=saveSnapshot({url:'note:'+n.id,title:n.title,text:n.body.length<20?n.title+'\n'+n.body+'\n用户手动笔记，待核实':n.body,scope:defaults?.scope,publisher:'创作笔记',documentType:'媒体解读'});run('INSERT INTO note_materials VALUES(?,?,?)',n.id,n.revision,s.id);return s;});
 return {snapshotIds:snapshots.map(s=>s.id),...creationDefaults(snapshots,'内容包')};
 });
 app.get('/api/pipeline/artifacts',async(req:any)=>all('SELECT a.*,s.name FROM artifacts a JOIN assets s ON s.id=a.asset_id ORDER BY a.created_at DESC LIMIT 500').filter(a=>{try{const owner=parse(a.manifest).ownerId;if(owner&&owner!==req.user.id&&req.user.role!=='admin')return false;checkMediaAsset(a.asset_id,req.user);const j=get('SELECT id FROM jobs WHERE id=?',a.job_id);if(j)checkJobAccess(j.id,req.user);return true;}catch{return false;}}).map(a=>({...a,manifest:parse(a.manifest),sourceStatus:sourceStatus(get('SELECT id FROM versions WHERE id=?',a.target_id)?'version':'project',a.target_id)})));
 app.post('/api/pipeline/bundle',async(req:any)=>{const b=z.object({artifactIds:z.array(z.string()).min(1).max(50)}).strict().parse(req.body);const files=b.artifactIds.map(aid=>{const a=requireRow(get('SELECT a.*,s.name FROM artifacts a JOIN assets s ON s.id=a.asset_id WHERE a.id=?',aid));checkMediaAsset(a.asset_id,req.user);const owner=parse(a.manifest).ownerId;if(owner&&owner!==req.user.id&&req.user.role!=='admin')err('FORBIDDEN','无法打包其他账号的成果',403);const j=get('SELECT id FROM jobs WHERE id=?',a.job_id);if(j)checkJobAccess(j.id,req.user);return a;});const bundle=makeBundle(files,'bundle:'+id(),files[0].target_id,{ownerId:req.user.id,sourceStatus:files.flatMap(a=>sourceStatus('version',a.target_id))});grantMediaAsset(bundle.asset_id,req.user.id);return bundle;});
}
