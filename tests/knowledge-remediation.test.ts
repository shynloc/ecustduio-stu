import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {setupInjected} from './auth-helper.js';
mkdirSync('test-results',{recursive:true});process.env.ECUSTUDIO_DATA_DIR=mkdtempSync(join(process.cwd(),'test-results/knowledge-'));
const D=await import('../server/db.js'),{buildApp}=await import('../server/app.js'),{creationDefaults}=await import('../shared/creation.js');
const app=await buildApp(false),auth=await setupInjected(app),headers={host:'localhost',cookie:auth.cookie,'x-csrf-token':auth.csrf};
const request=(method:any,url:string,payload?:any)=>app.inject({method,url,payload,headers});
test('富文本是正文唯一来源，保留表格；旧笔记可恢复，冲突不覆盖',async()=>{
 const created=await request('POST','/api/notes',{title:'教学记录',body:'# 原始记录\n\n旧内容'});assert.equal(created.statusCode,200,created.body);let n=created.json();
 const documentJson={type:'doc',content:[{type:'heading',attrs:{level:2},content:[{type:'text',text:'教学目标'}]},{type:'paragraph',content:[{type:'text',text:'理解光合作用',marks:[{type:'bold'}]}]},{type:'table',content:[{type:'tableRow',content:[{type:'tableHeader',content:[{type:'paragraph',content:[{type:'text',text:'活动'}]}]},{type:'tableHeader',content:[{type:'paragraph',content:[{type:'text',text:'时长'}]}]}]},{type:'tableRow',content:[{type:'tableCell',content:[{type:'paragraph',content:[{type:'text',text:'观察'}]}]},{type:'tableCell',content:[{type:'paragraph',content:[{type:'text',text:'10分钟'}]}]}]}]}]};
 const updated=await request('PATCH','/api/notes/'+n.id,{revision:n.revision,title:n.title,body:'伪造的无人机正文',documentJson,categories:{folder:'教学',tags:['生物','课堂'],purposes:['讲义'],state:'organized'}});assert.equal(updated.statusCode,200,updated.body);n=updated.json();assert.ok(n.body.includes('光合作用'));assert.ok(n.body.includes('10分钟'));assert.ok(!n.body.includes('无人机'));assert.deepEqual(n.documentJson,documentJson);assert.equal(n.categories.folder,'教学');
 assert.equal((await request('PATCH','/api/notes/'+n.id,{revision:1,title:'覆盖',body:'不可覆盖'})).statusCode,409);
 const history=(await request('GET','/api/notes/'+n.id+'/history')).json();assert.equal(history[0].revision,1);
 const restored=(await request('POST','/api/notes/'+n.id+'/restore',{revision:n.revision,restoreRevision:1})).json();assert.equal(restored.body,'# 原始记录\n\n旧内容');assert.equal(restored.revision,3);assert.equal(restored.documentJson,null);
});
test('公众号排版保留结构并移除脚本，输出绑定权限',async()=>{
 const n=(await request('POST','/api/notes',{title:'课堂计划',body:'## 观察活动\n\n**先观察**，再记录。\n\n|活动|时长|\n|---|---|\n|观察|10分钟|\n\n<script>alert(1)</script>'})).json();
 const r=await request('POST',`/api/notes/${n.id}/wechat`,{revision:n.revision,palette:'blue'});assert.equal(r.statusCode,200,r.body);const out=r.json();assert.match(out.html,/<table/);assert.match(out.html,/style=/);assert.doesNotMatch(out.html,/<script/);assert.ok(D.get('SELECT * FROM media_assets WHERE asset_id=?',out.assetId));
 assert.equal((await request('POST',`/api/notes/${n.id}/wechat`,{revision:0})).statusCode,409);
});
test('教学资料自动带入标题和领域，不自动编造教学目标',()=>{
 const r=creationDefaults([{id:'s1',title:'生物教学设计',scope:{region:'北京',stage:'中考',year:2026,audience:'家长'}}],'讲座 PPT')!;
 assert.equal(r.scope.domain,'teaching');assert.equal(r.scope.audience,'教师与学习者');assert.equal(r.scope.objectives,undefined);assert.ok(r.title.includes('生物教学设计'));
});
after(async()=>{await app.close();D.db.close();});
