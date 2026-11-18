import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {cpSync,existsSync,mkdirSync,mkdtempSync,readdirSync,symlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const available=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const backend=await available(),frontend=await available();let log='';
// Exercise the real entry point in a disposable source tree, including its ../data fallback.
mkdirSync('test-results',{recursive:true});
const fixture=mkdtempSync(resolve('test-results/dev-smoke-'));
const checkout=join(fixture,'checkout');
const installedData=join(fixture,'data');
mkdirSync(installedData);
mkdirSync(checkout);
for(const path of ['scripts','server','shared','migrations','web','public','skills','vite.config.ts','tsconfig.json','package.json']){
 cpSync(resolve(path),join(checkout,path),{recursive:true});
}
// Resolve shared packages from the parent repository and keep Vite's cache local.
mkdirSync(join(checkout,'node_modules'));
symlinkSync(resolve('node_modules/vite'),join(checkout,'node_modules/vite'),'junction');
const child=spawn(process.execPath,['scripts/dev.mjs'],{cwd:checkout,env:{...process.env,ECUSTUDIO_DEV_PORT:String(backend),ECUSTUDIO_DEV_WEB_PORT:String(frontend),ECUSTUDIO_DATA_DIR:installedData,DEEPSEEK_API_KEY:''},windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
try{
 const base='http://127.0.0.1:'+frontend;let ready=false;
 for(let i=0;i<120;i++){if(child.exitCode!==null)throw new Error('开发服务提前退出：'+log);try{const r=await fetch(base+'/health',{signal:AbortSignal.timeout(1000)});if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
 assert.ok(ready,'开发服务未启动：'+log);
 const html=await(await fetch(base)).text();assert.ok(html.includes('/@vite/client'),'前端没有进入热更新模式');
 const clientModule = await fetch(base + '/api.ts');
 assert.equal(clientModule.status, 200, 'Vite 必须能加载前端 API 模块');
 assert.match(clientModule.headers.get('content-type') || '', /javascript/);
 const s=await fetch(base+'/api/session'),body=await s.json();assert.equal(s.status,200);assert.ok(body.csrf);assert.ok(existsSync(join(checkout,'.local-data','app.sqlite')));
 const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{origin:base,cookie:s.headers.get('set-cookie').split(';')[0],'x-csrf-token':body.csrf,'content-type':'application/json'},body:JSON.stringify({username:'dev-smoke-nonexistent',password:'Synthetic-password-never-created'})});assert.equal(response.status,401,'Vite 代理应通过同源校验并返回登录失败');
 assert.deepEqual(readdirSync(installedData),[],'开发启动不能写入旁边的安装数据目录');
 console.log('开发入口通过：热更新、API代理、同源与会话校验、独立数据目录。');
}finally{
 if(child.connected)child.send('ecustudio-dev-stop');else child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,5000))]);
 if(child.exitCode===null)child.kill('SIGKILL');
}
