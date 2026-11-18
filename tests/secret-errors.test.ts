import test,{after} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,unlinkSync} from 'node:fs';import {join} from 'node:path';
import {setupInjected} from './auth-helper.js';import {keychainError} from '../server/mac-keychain.js';
mkdirSync('test-results',{recursive:true});process.env.ECUSTUDIO_DATA_DIR=mkdtempSync(join(process.cwd(),'test-results/secret-errors-'));
const D=await import('../server/db.js'),{buildApp}=await import('../server/app.js'),S=await import('../server/secrets.js');
const app=await buildApp(false,{}, {save:async()=>{throw keychainError('KEYCHAIN_LOCKED','请解锁 Mac 登录钥匙串后重试');},diagnose:async()=>{throw keychainError('KEYCHAIN_ACCESS_DENIED','请允许本机钥匙串访问');}});
app.addHook('onRequest',async req=>{if(req.url==='/broken-page')throw new Error('private-internal-details');});
const session=await setupInjected(app),headers={host:'localhost',cookie:session.cookie,'x-csrf-token':session.csrf};
after(async()=>{await app.close();D.db.close();});
test('Mac凭据存储错误保留具体原因，返回424而非通用500；诊断需登录',async()=>{
 const r=await app.inject({method:'POST',url:'/api/secrets',headers,payload:{name:'deepseek',value:'synthetic-do-not-leak'}});assert.equal(r.statusCode,424);assert.equal(r.json().error.code,'KEYCHAIN_LOCKED');assert.ok(!r.body.includes('synthetic-do-not-leak'));
 const d=await app.inject({method:'POST',url:'/api/secrets/diagnose',headers,payload:{}});assert.equal(d.statusCode,424);assert.equal(d.json().error.code,'KEYCHAIN_ACCESS_DENIED');
 assert.equal((await app.inject({method:'POST',url:'/api/secrets/diagnose',headers:{host:'localhost'},payload:{}})).statusCode,401);
});
test('凭据标记文件损坏不再使整个state失败，也不会覆盖原文件',async()=>{
 const path=join(D.dataDir,process.platform==='darwin'?'secrets.keychain.json':'secrets.dpapi');writeFileSync(path,'broken original metadata');
 try{assert.equal(S.hasSecret('deepseek'),false);const state=await app.inject({url:'/api/state',headers});assert.equal(state.statusCode,200);assert.equal(state.json().capabilities.secretStorageIssue.code,'SECRET_FILE_INVALID');await assert.rejects(S.setSecret('deepseek','synthetic'),{code:'SECRET_FILE_INVALID'});assert.equal(readFileSync(path,'utf8'),'broken original metadata');}finally{unlinkSync(path);}
});
test('HTML页面出错显示恢复页；API仍返回结构化错误，不泄露内部异常',async()=>{
 const r=await app.inject({url:'/broken-page',headers:{host:'localhost',accept:'text/html'}});assert.equal(r.statusCode,500);assert.match(String(r.headers['content-type']),/text\/html/);assert.match(r.body,/重新打开设置/);assert.ok(!r.body.includes('private-internal-details'));
});
