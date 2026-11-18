import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {setupInjected} from './auth-helper.js';
import {digest256} from '../shared/digest.js';
import {joinRegions} from '../server/overlap.js';
mkdirSync('test-results',{recursive:true});process.env.ECUSTUDIO_DATA_DIR=mkdtempSync(join(process.cwd(),'test-results/pipeline-'));
const D=await import('../server/db.js'),A=await import('../server/domain.js'),{buildApp}=await import('../server/app.js'),P=await import('../server/pipeline.js');
const app=await buildApp(false),auth=await setupInjected(app),headers={host:'localhost',cookie:auth.cookie,'x-csrf-token':auth.csrf};
const req=(method:any,url:string,payload?:any)=>app.inject({method,url,payload,headers});
let note:any;
test('版本引用跨页面保留，正文修改后旧引用不可悄悄继续',async()=>{
 note=(await req('POST','/api/notes',{title:'课堂教学记录',body:'学生观察叶片十分钟，然后讨论光合作用十五分钟。'})).json();
 const c=(await req('POST','/api/contexts',{refs:[{kind:'note',id:note.id,revision:1}],purpose:'production'})).json();assert.ok(c.id);
 assert.equal((await req('GET','/api/contexts/'+c.id)).json().items[0].value.body,note.body);
 note=(await req('PATCH','/api/notes/'+note.id,{revision:note.revision,title:note.title,body:note.body+'增加实验记录。'})).json();assert.equal((await req('GET','/api/contexts/'+c.id)).statusCode,409);
});
test('批量分类可撤销，后续修改冲突不覆盖，分类不影响正文',async()=>{
 const op=await req('POST','/api/knowledge/batch',{notes:[{id:note.id,revision:note.revision}],categories:{folder:'教学',tags:['课堂'],purposes:['演示']}});assert.equal(op.statusCode,200,op.body);let n=(await req('GET','/api/notes/'+note.id)).json();assert.equal(n.body,note.body);assert.equal(n.categories.folder,'教学');assert.equal((await req('POST','/api/knowledge/undo/'+op.json().operationId)).statusCode,200);n=(await req('GET','/api/notes/'+note.id)).json();assert.equal(n.categories.folder,'');assert.equal((await req('POST','/api/knowledge/undo/'+op.json().operationId)).statusCode,409);note=n;
 const op2=(await req('POST','/api/knowledge/batch',{notes:[{id:n.id,revision:n.revision}],categories:{folder:'测试'}})).json();n=(await req('GET','/api/notes/'+note.id)).json();note=(await req('PATCH','/api/notes/'+n.id,{revision:n.revision,title:n.title,body:n.body+'保留后续编辑。'})).json();assert.equal((await req('POST','/api/knowledge/undo/'+op2.operationId)).statusCode,409);
});
test('笔记需明确共享；部分识别不得转素材；修改传播到母稿和成果来源状态',async()=>{
 assert.equal((await req('POST','/api/pipeline/prepare',{refs:[{kind:'note',id:note.id}]})).statusCode,409);
 const r=await req('POST','/api/pipeline/prepare',{refs:[{kind:'note',id:note.id,revision:note.revision}],shareNotes:true});assert.equal(r.statusCode,200,r.body);const b=r.json(),sid=b.snapshotIds[0];assert.equal(b.scope.domain,'teaching');
 const project=A.createProject({title:'教学成果',scope:b.scope,snapshotIds:[sid]});const v=A.saveVersion({projectId:project.id,kind:'master',body:{title:'教学成果',summary:'课堂',blocks:[{id:'b1',title:'观察',text:note.body,claimIds:[]}],unverified:[]},expectedRevision:project.revision,origin:'test'});
 note=(await req('PATCH','/api/notes/'+note.id,{title:note.title,body:note.body+'新增来源版本。',revision:note.revision})).json();assert.equal(D.get('SELECT stale FROM versions WHERE id=?',v.id).stale,1);assert.ok(P.sourceStatus('version',v.id).length);
 D.run('UPDATE notes SET sources=? WHERE id=?',D.json([{kind:'media',coverage:'partial',needsReview:true}]),note.id);assert.equal((await req('POST','/api/pipeline/prepare',{refs:[{kind:'note',id:note.id}],shareNotes:true,reviewed:true})).statusCode,409);
});
test('来源块保留页码与核对版本，用户不能伪造来源哈希',async()=>{
 const s=A.saveSnapshot({title:'页码示例',text:'[第 1 页]\n观察叶片十分钟，记录颜色与形态。\n[第 2 页]\n讨论光合作用十五分钟并总结。',scope:{region:'不限地区',stage:'综合',year:2026,audience:'教师'}});const e=(await req('GET','/api/evidence/snapshot/'+s.id)).json();assert.ok(e.blocks.some((b:any)=>b.page===2));assert.equal((await req('POST',`/api/evidence/snapshot/${s.id}/review`,{hash:'bad',confirmed:true})).statusCode,409);assert.equal((await req('POST',`/api/evidence/snapshot/${s.id}/review`,{hash:e.hash,confirmed:true})).statusCode,200);
});
test('续传校验分块、重复提交和完整文件；拒绝错位及超限',async()=>{
 const bytes=Buffer.from('教学资料\n观察叶片十分钟，讨论十五分钟。'),fingerprint=D.hash(bytes);
 const init=(await req('POST','/api/upload-sessions',{name:'资料.txt',size:bytes.length,fingerprint})).json();assert.equal(init.offset,0);
 const first=bytes.subarray(0,20),tail=bytes.subarray(20),chunk=(offset:number,b:Buffer)=>({offset,chunk:b.toString('base64'),hash:D.hash(b)});
 assert.equal((await req('PUT','/api/upload-sessions/'+init.id,chunk(0,first))).json().offset,20);
 assert.equal((await req('POST','/api/upload-sessions',{name:'资料.txt',size:bytes.length,fingerprint})).json().offset,20);
 assert.equal((await req('PUT','/api/upload-sessions/'+init.id,chunk(0,first))).statusCode,200);
 assert.equal((await req('PUT','/api/upload-sessions/'+init.id,chunk(19,tail))).statusCode,409);
 assert.equal((await req('POST',`/api/upload-sessions/${init.id}/complete`)).statusCode,409);
 assert.equal((await req('PUT','/api/upload-sessions/'+init.id,chunk(20,tail))).statusCode,200);
 const complete=await req('POST',`/api/upload-sessions/${init.id}/complete`);assert.equal(complete.statusCode,200,complete.body);assert.equal(complete.json().hash,fingerprint);assert.equal((await req('POST',`/api/upload-sessions/${init.id}/complete`)).json().id,complete.json().id);
 assert.equal((await req('POST','/api/upload-sessions',{name:'big.pdf',size:201*1048576,fingerprint})).statusCode,413);
});
test('HTTP局域网SHA256与服务器一致；只去除完全相同的长交叠内容',()=>{
 for(const b of [Buffer.alloc(0),Buffer.from('abc'),Buffer.from('中文与表格🌿'),Buffer.alloc(262144,123)])assert.equal(digest256(b),D.hash(b));
 const overlap='重复区域：课堂观察与讨论记录，内容完全一致才去除。';assert.equal(joinRegions(['第一页\n'+overlap,overlap+'\n第二页']).text,'第一页\n'+overlap+'\n\n第二页');assert.equal(joinRegions(['相似区域甲','相似区域乙']).removed,0);
});
test('创作者不可读取其他账号引用、笔记和上传；业务员禁止写接口',async()=>{
 const admin=D.get("SELECT * FROM users WHERE role='admin'");let aid:string;
 for(const role of ['creator','sales']){const uid=D.id();D.run('INSERT INTO users(id,username,display_name,role,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',uid,role,role,role,admin.password_hash,D.now(),D.now());const s=await app.inject({url:'/api/session',headers:{host:'localhost'}}),cookie=String(s.headers['set-cookie']).split(';')[0],login=await app.inject({method:'POST',url:'/api/auth/login',headers:{host:'localhost',cookie,'x-csrf-token':s.json().csrf},payload:{username:role,password:'Test-only-password-2026!'}}),h={host:'localhost',cookie:String(login.headers['set-cookie']).split(';')[0],'x-csrf-token':login.json().csrf};assert.equal(login.statusCode,200,login.body);const c=await app.inject({method:'POST',url:'/api/contexts',headers:h,payload:{refs:[{kind:'note',id:note.id}]}});assert.equal(c.statusCode,403,c.body);const u=await app.inject({method:'POST',url:'/api/upload-sessions',headers:h,payload:{name:'test.txt',size:10,fingerprint:D.hash('test')}});assert.equal(u.statusCode,role==='sales'?403:200);assert.equal((await app.inject({method:'PATCH',url:'/api/settings/upload-limits',headers:h,payload:{maxPdfMB:100,quotaMB:2000}})).statusCode,403);}
});
test('制作提交原子化，失败不共享笔记，重放返回原任务，意图保存在任务中',async()=>{
 const fresh=(await req('POST','/api/notes',{title:'课堂讲义',body:'观察叶片后按小组整理实验步骤，列出证据并核对来源。'})).json();
 const body={refs:[{kind:'note',id:fresh.id,revision:fresh.revision}],shareNotes:true,template:'wechat',formats:['docx'],prompt:'给家长的观察指引'};
 const start=(payload:any)=>app.inject({method:'POST',url:'/api/pipeline/start',payload,headers:{...headers,'idempotency-key':'one-delivery'}});
 const previous=D.settings();
 try {
  process.env.DEEPSEEK_API_KEY='synthetic-no-network';
  D.run('UPDATE settings SET body=?',D.json({...previous,allowExternalAI:false}));
  assert.equal((await start(body)).statusCode,403);
  assert.equal(D.get('SELECT count(*) n FROM note_materials WHERE note_id=?',fresh.id).n,0);
  assert.equal(D.get('SELECT count(*) n FROM snapshots WHERE title=?',fresh.title).n,0);
  D.run('UPDATE settings SET body=?',D.json({...previous,allowExternalAI:true}));
  assert.equal((await start({...body,shareNotes:false})).statusCode,409);
  assert.equal((await start({...body,formats:['pptx']})).statusCode,422);
  const r=await start(body);assert.equal(r.statusCode,202,r.body);
  assert.equal((await start(body)).json().id,r.json().id);
  assert.equal((await start({...body,prompt:'另一个要求'})).statusCode,409);
  const j=(await req('GET','/api/jobs/'+r.json().id)).json();assert.equal(j.production.templateName,'公众号图文');assert.deepEqual(j.production.deliveryFormats,['docx']);
  assert.equal(D.get('SELECT count(*) n FROM note_materials WHERE note_id=?',fresh.id).n,1);
 } finally {D.run('UPDATE settings SET body=?',D.json(previous));delete process.env.DEEPSEEK_API_KEY;}
});
after(async()=>{await app.close();D.db.close();});
