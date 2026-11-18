import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {mkdirSync} from 'node:fs';
const root=fileURLToPath(new URL('..',import.meta.url));process.chdir(root);
const [major,minor]=process.versions.node.split('.').map(Number);
if(major!==24||minor<15)throw new Error('需要 Node.js 24.15 或更新的 24.x。');
const port=Number(process.env.ECUSTUDIO_DEV_PORT||37892),webPort=Number(process.env.ECUSTUDIO_DEV_WEB_PORT||5173);
if(![port,webPort].every(p=>Number.isInteger(p)&&p>1024&&p<=65535)||port===webPort)throw new Error('开发端口必须不同且位于 1025—65535。');
process.env.PORT=String(port);
process.env.ECUSTUDIO_NETWORK_MODE='local';
process.env.ECUSTUDIO_DATA_DIR=resolve('.local-data');
process.env.ECUSTUDIO_WEB_DIR=resolve('.dev/unused-static');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= resolve('.dev/browsers');
mkdirSync(process.env.ECUSTUDIO_DATA_DIR,{recursive:true});
console.log('正在启动隔离开发环境…');
const {spawn}=await import('node:child_process');
const children=[];let stopping=false;
function stop(code=0){
 if(stopping)return;stopping=true;
 for(const child of children)if(child.exitCode===null)child.kill('SIGTERM');
 const timer=setTimeout(()=>{for(const child of children)if(child.exitCode===null)child.kill('SIGKILL');process.exit(code);},3000);
 Promise.all(children.map(child=>child.exitCode!==null?Promise.resolve():new Promise(r=>child.once('exit',r)))).then(()=>{clearTimeout(timer);process.exit(code);});
}
function start(args){
 const child=spawn(process.execPath,args,{cwd:root,env:process.env,stdio:'inherit',windowsHide:true});children.push(child);
 child.on('error',e=>{console.error(e.message);stop(1);});child.on('exit',code=>{if(!stopping)stop(code||0);});return child;
}
start(['--import','tsx','server/index.ts']);
start(['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(webPort),'--strictPort']);
console.log(`开发工作台：http://127.0.0.1:${webPort}\n后端：http://127.0.0.1:${port}\n开发数据：${process.env.ECUSTUDIO_DATA_DIR}\n前端修改自动刷新；后端修改后请 Ctrl+C 并重新运行 npm run dev。`);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>stop(0));
// The smoke check requests a graceful parent shutdown on Windows as well.
process.on('message',message=>{if(message==='ecustudio-dev-stop')stop(0);});
