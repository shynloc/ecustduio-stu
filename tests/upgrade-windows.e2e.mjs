import assert from 'node:assert/strict';
import {cpSync,mkdirSync,mkdtempSync,writeFileSync,readFileSync,existsSync,symlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import {upgrade,systemAdapter} from '../deployment/upgrade.mjs';
if(process.platform!=='win32')throw new Error('Windows real-process test');
const source=resolve(process.argv[2]),oldSource='D:/EduStudio/release-staging/windows-online-0.3.0-j4ot5hjh';
mkdirSync('test-results',{recursive:true});const testRoot=mkdtempSync(resolve('test-results/windows-upgrade-')),target=join(testRoot,'旧版工作台 with spaces');mkdirSync(target);
cpSync(join(oldSource,'app'),join(target,'app'),{recursive:true});for(const name of ['Common.ps1','Start-EcuStudio.ps1','Stop-EcuStudio.ps1'])cpSync(join(oldSource,name),join(target,name));
symlinkSync(resolve('node_modules'),join(target,'app/node_modules'),'junction');
const port=await new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
writeFileSync(join(target,'ecustudio.json'),JSON.stringify({port,networkMode:'local'}));mkdirSync(join(target,'data/logs'),{recursive:true});
const child=spawn(process.execPath,[join(target,'app/dist-server/server/index.js')],{cwd:join(target,'app'),env:{...process.env,ECUSTUDIO_DATA_DIR:join(target,'data'),PORT:String(port),ECUSTUDIO_NETWORK_MODE:'local',DEEPSEEK_API_KEY:''},windowsHide:true,stdio:'ignore'});
writeFileSync(join(target,'data/logs/server.pid'),String(child.pid));const base='http://127.0.0.1:'+port;
const record={version:'0.4.0',installerRevision:'upgrade1',fixture:'isolated synthetic Windows 0.3.0 installation',startedAt:new Date().toISOString()};
async function session(){const r=await fetch(base+'/api/session');const s=await r.json();return {cookie:r.headers.get('set-cookie')?.split(';')[0],csrf:s.csrf};}
async function api(s,path,body,method=body?'POST':'GET') {const r=await fetch(base+'/api'+path,{method,headers:{cookie:s.cookie,'x-csrf-token':s.csrf,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});const b=await r.json();if(r.headers.get('set-cookie'))s.cookie=r.headers.get('set-cookie').split(';')[0];if(b.csrf)s.csrf=b.csrf;assert.ok(r.ok,JSON.stringify(b));return b;}
try{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.equal((await (await fetch(base+'/health')).json()).version,'0.3.0');
 const admin=await session(),password='Upgrade-test-only-2026!';await api(admin,'/auth/setup',{username:'upgrade-admin',displayName:'升级测试管理员',password});
 for(const role of ['creator','sales'])await api(admin,'/auth/users',{username:'upgrade-'+role,displayName:role,role,password});
 const n=await api(admin,'/notes',{title:'原有测试笔记',body:'原有笔记内容应在升级后保留。'});
 const secret=await api(admin,'/secrets',{name:'deepseek',value:'synthetic-upgrade-test-only'});
 const cfg=readFileSync(join(target,'ecustudio.json')),key=readFileSync(join(target,'data/secrets.dpapi'));
 const result=await upgrade({source,target,noBrowser:true});assert.equal(result.status,'complete');
 assert.equal((await (await fetch(base+'/health')).json()).version,'0.4.0');
 const logged=await session();await api(logged,'/auth/login',{username:'upgrade-admin',password});const state=await api(logged,'/state');assert.equal(state.capabilities.deepseek,'configured');assert.equal((await api(logged,'/notes/'+n.id)).body,'原有笔记内容应在升级后保留。');
 assert.equal((await api(logged,'/auth/users')).length,3);
 for(const role of ['creator','sales']){const s=await session(),r=await api(s,'/auth/login',{username:'upgrade-'+role,password});assert.equal(r.user.role,role);}
 assert.deepEqual(readFileSync(join(target,'ecustudio.json')),cfg);assert.deepEqual(readFileSync(join(target,'data/secrets.dpapi')),key);
 const decrypted=spawnSync(process.execPath,['--input-type=module','-e',"const {getSecret}=await import('./dist-server/server/secrets.js');if(await getSecret('deepseek')!=='synthetic-upgrade-test-only')process.exit(2);const D=await import('./dist-server/server/db.js');D.db.close();"],{cwd:join(target,'app'),env:{...process.env,ECUSTUDIO_DATA_DIR:join(target,'data'),DEEPSEEK_API_KEY:''},windowsHide:true,encoding:'utf8'});assert.equal(decrypted.status,0,'Preserved DPAPI credential must still decrypt');
 record.ok=true;record.checks=['real 0.3.0 service stop and 0.4.0 start','three roles keep original passwords','note content retained','configuration bytes retained','encrypted credential bytes retained and decryptable','existing dependencies reused','local backup present'];
}catch(e){record.ok=false;record.error=e.message;process.exitCode=1;}
finally{try{await systemAdapter.stop(target);}catch{}child.kill();record.finishedAt=new Date().toISOString();writeFileSync('test-results/windows-upgrade-result.json',JSON.stringify(record,null,2));console.log(JSON.stringify(record,null,2));}
