import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';
import {setupInjected} from './auth-helper.js';
mkdirSync('test-results',{recursive:true});
process.env.ECUSTUDIO_DATA_DIR=mkdtempSync(join(process.cwd(),'test-results/remediation-'));
process.env.DEEPSEEK_API_KEY='synthetic-test-only';
const D=await import('../server/db.js'),{buildApp}=await import('../server/app.js');
const app=await buildApp(false);await setupInjected(app);const actor=D.get('SELECT * FROM users LIMIT 1');
D.run('UPDATE settings SET body=? WHERE id=1',D.json({...D.settings(),allowExternalAI:true,thinkingMode:'high'}));
const {structuredTask}=await import('../server/workflow-agent.js'),W=await import('../server/workflows.js'),{deepseekRequest}=await import('../server/deepseek.js');
test('必需技能由宿主装载，思考模式不强制工具，不伪造历史',async()=>{
 let calls=0;const response=await structuredTask({actorId:actor.id,config:D.settings(),requiredSkill:'acks-reprompt',instruction:'输出 JSON {ok:true}',context:{request:'test'},schema:z.object({ok:z.boolean()})},()=>{},new AbortController().signal,async(_url,options)=>{
  calls++;const req=JSON.parse(String(options?.body));assert.equal(req.thinking.type,'enabled');assert.ok(!req.tool_choice||req.tool_choice==='auto');
  assert.ok(req.messages[0].content.includes('宿主已装载'));assert.equal(req.messages.filter((m:any)=>m.role==='tool').length,0);
  return Response.json({choices:[{message:{content:'{"ok":true}'}}]});
 });assert.equal(calls,1);assert.equal(response.toolLog[0].loadedBy,'host');
});
test('无材料为可补充计划，不请求模型也不创建空项目',async()=>{
 const scope={region:'北京',district:'全市',stage:'综合',year:2026,audience:'教师'};
 const frozen=W.freezePlan({prompt:'制作一份课堂教学材料',snapshotIds:[],scope},actor);
 const plan=await W.runPlan(frozen,()=>{},new AbortController().signal,async()=>{throw new Error('不应调用模型')});
 assert.equal(plan.plan.status,'needs-material');assert.deepEqual(plan.plan.snapshotIds,[]);assert.equal(D.get('SELECT count(*) n FROM projects').n,0);
});
test('无相关材料不选最新资料凑数',async()=>{
 const {saveSnapshot}=await import('../server/domain.js');const scope={region:'北京',district:'全市',stage:'综合',year:2026,audience:'教师'};
 saveSnapshot({title:'无人机遥控器',text:'旋翼与电机结构。无人飞行器动力与遥控系统。',scope,url:'https://example.com/drone',publisher:'测试',documentType:'待判断'});
 assert.deepEqual(W.freezePlan({prompt:'小学语文阅读教学设计',scope,snapshotIds:[]},actor).snapshots,[]);
});
test('400按参数原因分类，不暴露上游密钥/原文',async()=>{
 await assert.rejects(deepseekRequest({model:'deepseek-flash',messages:[]},new AbortController().signal,async()=>Response.json({error:{message:'tool_choice forced is unsupported with thinking sk-secret-do-not-leak',param:'tool_choice'}},{status:400})),(e:any)=>e.code==='MODEL_TOOL_MODE_INVALID'&&!e.message.includes('sk-secret'));
});
after(async()=>{await app.close();D.db.close();});
