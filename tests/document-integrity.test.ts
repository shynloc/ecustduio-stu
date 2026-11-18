import test,{after} from 'node:test';import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';import {join} from 'node:path';import {fixtures} from './ocr-fixtures.js';import {setupInjected} from './auth-helper.js';
mkdirSync('test-results',{recursive:true});process.env.ECUSTUDIO_DATA_DIR=mkdtempSync(join(process.cwd(),'test-results/integrity-'));process.env.DEEPSEEK_API_KEY='synthetic-only';
const D=await import('../server/db.js'),{asset}=await import('../server/domain.js'),Q=await import('../server/document-quality.js'),{buildApp}=await import('../server/app.js'),T=await import('../server/tasks.js');
const app=await buildApp(false),session=await setupInjected(app),actor=D.get('SELECT * FROM users LIMIT 1');
const request=(url:string,body:any)=>app.inject({method:'POST',url,payload:body,headers:{host:'localhost',cookie:session.cookie,'x-csrf-token':session.csrf}});
test('异常内容检测不按文件名编造正文，不把一致性判断当核验',()=>{
 const result=Q.assessDocument('小学语文阅读课堂教学设计，学生分组合作学习古诗词，教师通过阅读评价提升学习兴趣和词汇积累。','无人机的遥控器电池与旋翼电机维修教程');
 assert.equal(result.status,'needs-review');assert.equal(result.requiresSourceReview,true);
 assert.equal(Q.assessDocument('','无法读取清晰文字').status,'no-text-evidence');
 assert.throws(()=>Q.requireSourceReview({integrity:result,sourceHash:'a'},'b'),/核对/);
});
test('PDF原始页可独立渲染，越界拒绝',async()=>{
 const f=fixtures();const a=asset(f.pdf,'classroom.pdf','application/pdf','test');const page=await Q.pdfPage(a.id,1);assert.equal(page.pageCount,2);assert.equal(page.sourceHash,a.hash);assert.equal(page.bytes.subarray(1,4).toString(),'PNG');await assert.rejects(Q.pdfPage(a.id,3),/页码/);
});
test('疑似错文可存待复核笔记，不能绕道笔记直接变成创作素材',async()=>{
 const a=asset(Buffer.from('original teaching source'),'teaching.txt','text/plain','test'),job=T.enqueue('media',{actorId:actor.id,file:{id:a.id,hash:a.hash}});
 const result={action:'document',title:'教学文件',text:'可能有误的整理稿',sourceAssetId:a.id,sourceHash:a.hash,integrity:{requiresSourceReview:true,status:'needs-review'}};
 D.run('INSERT INTO media_jobs VALUES(?,?,?)',job.id,actor.id,D.now());D.run("UPDATE jobs SET state='succeeded',result=? WHERE id=?",D.json(result),job.id);
 const scope={region:'北京',district:'全市',stage:'综合',year:2026,audience:'教师'};
 assert.equal((await request(`/api/media/${job.id}/material`,{title:result.title,text:result.text,scope})).statusCode,409);
 const note=await request(`/api/media/${job.id}/note`,{title:result.title,text:result.text});assert.equal(note.statusCode,200);
 assert.equal((await request(`/api/notes/${note.json().id}/material`,{revision:1,scope})).statusCode,409);
 assert.equal((await request(`/api/media/${job.id}/material`,{title:result.title,text:result.text,scope,sourceChecked:a.hash})).statusCode,200);
});
after(async()=>{await app.close();D.db.close();});
