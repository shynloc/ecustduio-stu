import {z} from 'zod';
import {createReadStream,existsSync,statSync,statfsSync,openSync,closeSync,readSync,writeSync,unlinkSync,readFileSync} from 'node:fs';
import {join,extname} from 'node:path';
import {dataDir,get,all,run,parse,json,id,now,err,requireRow,hash} from './db.js';
import {receivePdf} from './uploads.js';
import {inspectMedia} from './media.js';
import {asset} from './domain.js';
import {grantMediaAsset} from './media-access.js';
const limits=z.object({maxPdfMB:z.number().int().min(10).max(200).default(200),quotaMB:z.number().int().min(200).max(20000).default(2000)}).strict();
const pathFor=(sid:string)=>join(dataDir,'staging','resume-'+sid);
const preferences=()=>limits.parse(parse(get('SELECT body FROM pipeline_preferences WHERE id=1')?.body));
const locks=new Set<string>();
function owned(sid:string,user:any){const s=requireRow(get('SELECT * FROM upload_sessions WHERE id=?',sid));if(s.owner_id!==user.id)err('FORBIDDEN','上传记录属于其他账号',403);return s;}
export async function registerResumableUploads(app:any){
 app.get('/api/upload-limits',async()=>preferences());
 app.patch('/api/settings/upload-limits',async(req:any)=>{const b=limits.parse(req.body);run('INSERT OR REPLACE INTO pipeline_preferences VALUES(1,?)',json(b));return b;});
 app.post('/api/upload-sessions',async(req:any)=>{
 const b=z.object({name:z.string().min(1).max(180),size:z.number().int().positive(),fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(req.body),cfg=preferences();
 for(const stale of all('SELECT id FROM upload_sessions WHERE asset_id IS NULL AND updated_at<?',new Date(Date.now()-7*86400000).toISOString()))if(!locks.has(stale.id)){if(existsSync(pathFor(stale.id)))unlinkSync(pathFor(stale.id));run('DELETE FROM upload_sessions WHERE id=?',stale.id);}
 const max=(extname(b.name).toLowerCase()==='.pdf'?cfg.maxPdfMB:50)*1048576;if(b.size>max)err('UPLOAD_LIMIT',`文件超过${max/1048576}MB上限`,413);
 const old=get('SELECT * FROM upload_sessions WHERE owner_id=? AND fingerprint=? AND size=? AND name=? ORDER BY created_at DESC LIMIT 1',req.user.id,b.fingerprint,b.size,b.name);if(old&&(old.asset_id||existsSync(pathFor(old.id))))return {id:old.id,offset:old.offset,size:old.size,assetId:old.asset_id};
 const reserved=get('SELECT coalesce(sum(size),0) n FROM upload_sessions WHERE asset_id IS NULL').n,fs=statfsSync(dataDir);if(reserved+b.size>cfg.quotaMB*1048576||fs.bavail*fs.bsize<reserved+b.size*2+256*1048576)err('UPLOAD_QUOTA','暂存空间不足，请稍后重试或由管理员调整上传空间',507);
 const sid=id(),fd=openSync(pathFor(sid),'wx');closeSync(fd);run('INSERT INTO upload_sessions VALUES(?,?,?,?,0,?,NULL,?,?)',sid,req.user.id,b.name,b.size,b.fingerprint,now(),now());return {id:sid,offset:0,size:b.size};
 });
 app.get('/api/upload-sessions/:id',async(req:any)=>{const s=owned(req.params.id,req.user);return {id:s.id,offset:s.offset,size:s.size,assetId:s.asset_id};});
 app.put('/api/upload-sessions/:id',async(req:any)=>{const s=owned(req.params.id,req.user),b=z.object({offset:z.number().int().nonnegative(),chunk:z.string().max(350000),hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(req.body);if(s.asset_id||locks.has(s.id))err('UPLOAD_BUSY','上传已提交或正在处理',409);const bytes=Buffer.from(b.chunk,'base64');if(!bytes.length||bytes.length>262144||hash(bytes)!==b.hash||b.offset+bytes.length>s.size)err('INVALID_CHUNK','上传分块校验失败',422);const fd=openSync(pathFor(s.id),'r+');try{if(b.offset<s.offset){const previous=Buffer.alloc(bytes.length);readSync(fd,previous,0,bytes.length,b.offset);if(b.offset+bytes.length>s.offset||!previous.equals(bytes))err('UPLOAD_CONFLICT','重复分块内容不同，请重新选择文件',409);return {offset:s.offset};}if(b.offset!==s.offset)err('UPLOAD_OFFSET','上传进度已变化，请恢复上传',409);writeSync(fd,bytes,0,bytes.length,b.offset);run('UPDATE upload_sessions SET offset=?,updated_at=? WHERE id=?',s.offset+bytes.length,now(),s.id);return {offset:s.offset+bytes.length};}finally{closeSync(fd);}});
 app.post('/api/upload-sessions/:id/complete',async(req:any)=>{const s=owned(req.params.id,req.user);if(s.asset_id){const a=get('SELECT * FROM assets WHERE id=?',s.asset_id);return {id:a.id,name:a.name,size:a.size,mime:a.mime,hash:a.hash,kind:a.mime==='application/pdf'?'document':a.mime.startsWith('image/')?'image':a.mime.startsWith('audio/')?'audio':'document'};}if(locks.has(s.id))err('UPLOAD_BUSY','正在提交，请稍后重试',409);if(s.offset!==s.size||statSync(pathFor(s.id)).size!==s.size)err('UPLOAD_INCOMPLETE','文件尚未完整上传',409);locks.add(s.id);try{let a:any,info:any;if(extname(s.name).toLowerCase()==='.pdf'){a=await receivePdf({filename:s.name,file:createReadStream(pathFor(s.id))});info={kind:'document'};}else{const bytes=readFileSync(pathFor(s.id));info=inspectMedia(bytes,s.name);a=asset(bytes,s.name,info.mime,'media-upload');}grantMediaAsset(a.id,req.user.id);run('UPDATE upload_sessions SET asset_id=?,updated_at=? WHERE id=?',a.id,now(),s.id);unlinkSync(pathFor(s.id));return {id:a.id,name:a.name,size:a.size,hash:a.hash,mime:a.mime,...info};}finally{locks.delete(s.id);}});
}
