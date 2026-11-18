// Customer-invoked test: isolated data, random temporary accounts, no external AI calls.
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';import {join,resolve} from 'node:path';import {randomBytes} from 'node:crypto';import {spawn} from 'node:child_process';import {networkInterfaces} from 'node:os';import {createServer} from 'node:net';import assert from 'node:assert/strict';
const root=join(process.env.ECUSTUDIO_DATA_DIR||'../data','selftest');mkdirSync(root,{recursive:true});const data=mkdtempSync(join(root,'run-'));
const probe=createServer();await new Promise(r=>probe.listen(0,'0.0.0.0',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const local=`http://127.0.0.1:${port}`,addresses=Object.values(networkInterfaces()).flat().filter(i=>i&&!i.internal&&i.family==='IPv4'&&!i.address.startsWith('169.254.')),ip=addresses.find(i=>i.address.startsWith('192.168.'))?.address||addresses.find(i=>i.address.startsWith('10.'))?.address||addresses[0]?.address;
const lan=ip?`http://${ip}:${port}`:local;const server=spawn(process.execPath,['dist-server/server/index.js'],{env:{...process.env,ECUSTUDIO_DATA_DIR:resolve(data),PORT:String(port),ECUSTUDIO_NETWORK_MODE:'lan',DEEPSEEK_API_KEY:''},windowsHide:true,stdio:'ignore'});
const report={startedAt:new Date().toISOString(),dataIsolation:true,local,lan,physicalOtherDevices:'请按使用指南在其他电脑/手机验证',externalAI:'未调用，请配置自己的DeepSeek后从模板制作验证'};
async function session(base){const r=await fetch(base+'/api/session');const s=await r.json();return{base,cookie:r.headers.get('set-cookie').split(';')[0],csrf:s.csrf};}
async function api(s,path,body,method){const r=await fetch(s.base+'/api'+path,{method:method||(body?'POST':'GET'),headers:{cookie:s.cookie,'x-csrf-token':s.csrf,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});const b=await r.json();if(b.csrf){s.csrf=b.csrf;s.cookie=r.headers.get('set-cookie').split(';')[0];}return{status:r.status,body:b};}
try {
 for(let n=0;n<100;n++){try{if((await fetch(local+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const pass=randomBytes(20).toString('hex'),admin=await session(local);
 if(ip){const remote=await session(lan);assert.equal((await api(remote,'/auth/setup',{username:'self-admin',displayName:'自检管理员',password:pass})).status,403);report.remoteBootstrapBlocked=true;}
 assert.equal((await api(admin,'/auth/setup',{username:'self-admin',displayName:'自检管理员',password:pass})).status,200);
 async function role(name,role){assert.equal((await api(admin,'/auth/users',{username:name,displayName:name,role,password:pass})).status,200);const s=await session(lan);assert.equal((await api(s,'/auth/login',{username:name,password:pass})).status,200);assert.equal((await api(s,'/auth/password',{currentPassword:pass,newPassword:pass+'x'})).status,200);return s;}
 const creator=await role('self-creator','creator'),sales=await role('self-sales','sales');
 assert.equal((await api(creator,'/auth/users')).status,403);assert.equal((await api(sales,'/notes')).status,403);assert.equal((await api(sales,'/production',{})).status,403);assert.equal((await api(sales,'/imports',{})).status,403);
 const note=await api(admin,'/notes',{title:'管理员自检笔记',body:'仅用于验证创作者不能读取管理员私有笔记，不是真实政策材料。'});assert.equal((await api(creator,'/notes/'+note.body.id)).status,403);
 const state=(await api(sales,'/state')).body;assert.deepEqual(state.projects,[]);assert.deepEqual(state.jobs,[]);assert.deepEqual(state.backups,[]);
 const imp=await api(creator,'/imports',{title:'SELFTEST 合成资料',text:'这是一份独立的本机自检材料，用于检查局域网导入与只读权限，不是真实政策。',publisher:'安装自检',scope:{region:'北京',district:'全市',stage:'综合',year:2026,audience:'自检'},documentType:'媒体解读'});assert.equal(imp.status,202);
 let job;for(let n=0;n<100;n++){job=(await api(creator,'/jobs/'+imp.body.id)).body;if(job.state==='succeeded')break;if(job.state==='failed')throw new Error(job.error.message);await new Promise(r=>setTimeout(r,150));}assert.equal(job.state,'succeeded');assert.equal((await api(sales,'/snapshots/'+job.result.id)).status,200);
 report.status='passed';report.checks=['实际网卡IP访问','本机管理员初始化','三角色登录与首次改密','创作者无账号管理','业务员只读和响应裁剪','私有笔记隔离','资料导入及业务员查阅'];
}catch(e){report.status='failed';report.error=e.message;process.exitCode=1;}finally{server.kill();report.finishedAt=new Date().toISOString();writeFileSync(join(data,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,evidence:join(data,'result.json')},null,2));}
