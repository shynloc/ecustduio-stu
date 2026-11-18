import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
mkdirSync('test-results',{recursive:true});process.env.ECUSTUDIO_DATA_DIR=mkdtempSync(join(process.cwd(),'test-results/upgrade-maintenance-'));
const D=await import('../server/db.js'),{buildApp}=await import('../server/app.js'),{Worker,enqueue}=await import('../server/tasks.js');const app=await buildApp(false);
after(async()=>{await app.close();D.db.close();});
test('升级校验阶段暂停API和任务执行，解锁后恢复',async()=>{
 const marker=join(D.dataDir,'upgrade-maintenance.json');writeFileSync(marker,'{}');
 assert.equal((await app.inject({url:'/api/session',headers:{host:'localhost'}})).statusCode,200);
 assert.equal((await app.inject({url:'/api/notes',method:'POST',headers:{host:'localhost'},payload:{title:'blocked'}})).statusCode,503);
 assert.equal((await app.inject({url:'/api/settings/updates',headers:{host:'localhost'}})).statusCode,401);
 assert.equal((await app.inject({url:'/health',headers:{host:'localhost'}})).statusCode,200);
 const j=enqueue('import',{}),worker=new Worker();await worker.tick();assert.equal(D.get('SELECT state FROM jobs WHERE id=?',j.id).state,'queued');
 unlinkSync(marker);assert.equal((await app.inject({url:'/api/session',headers:{host:'localhost'}})).statusCode,200);
});
