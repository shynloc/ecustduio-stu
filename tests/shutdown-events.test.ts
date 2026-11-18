import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
mkdirSync('test-results',{recursive:true});
process.env.ECUSTUDIO_DATA_DIR=mkdtempSync(join(process.cwd(),'test-results/shutdown-events-'));
const D=await import('../server/db.js'),{buildApp}=await import('../server/app.js'),{enqueue}=await import('../server/tasks.js');
test('用户打开任务 SSE 页时，升级关闭服务能结束长连接，不会等待浏览器退出',async()=>{
 const app=await buildApp(false);const abort=new AbortController();let timeout:ReturnType<typeof setTimeout>|undefined;
 try{
  await app.listen({host:'127.0.0.1',port:0});const address=app.server.address();assert.ok(address&&typeof address!=='string');const base='http://127.0.0.1:'+address.port;
  const initial=await fetch(base+'/api/session'),session=await initial.json();let cookie=initial.headers.get('set-cookie')!.split(';')[0];
  const setup=await fetch(base+'/api/auth/setup',{method:'POST',headers:{cookie,'x-csrf-token':session.csrf,'content-type':'application/json'},body:JSON.stringify({username:'shutdown-admin',displayName:'shutdown test',password:'Shutdown-test-only-2026!'})});assert.equal(setup.status,200);
  cookie=setup.headers.get('set-cookie')!.split(';')[0];await setup.json();
  const job=enqueue('import',{});const events=await fetch(base+'/api/jobs/'+job.id+'/events',{headers:{cookie},signal:abort.signal});assert.equal(events.status,200);
  const reader=events.body!.getReader();assert.equal((await reader.read()).done,false);
  assert.equal((await reader.read()).done,false,'SSE must still be open before shutdown');
  await Promise.race([app.close(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Server shutdown waited for the open SSE connection')),2000);})]);
  if(timeout)clearTimeout(timeout);while(!(await reader.read()).done){}assert.equal(app.server.listening,false);
 }finally{abort.abort();if(timeout)clearTimeout(timeout);await app.close();D.db.close();}
});
