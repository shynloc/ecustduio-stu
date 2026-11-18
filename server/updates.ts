import {existsSync,mkdirSync,mkdtempSync,readFileSync,copyFileSync,openSync,closeSync,unlinkSync,writeFileSync,realpathSync} from 'node:fs';
import {join,resolve,relative,isAbsolute,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {z} from 'zod';
import {get,root,dataDir,err,id,audit,hash} from './db.js';
import {appVersion} from './version.js';
const P=await import(pathToFileURL(join(root,'scripts/update-protocol.mjs')).href);
const dir=join(dataDir,'updates'),statusPath=join(dir,'current.json'),lockPath=join(dir,'launch.lock'),cachePath=join(dir,'checked-release.json');
function read(path:string){try{return P.readJson(path);}catch{return null;}}
function support(){
 if(!P.platformKey())return '在线升级支持 Windows x64 和 macOS';
 const target=resolve(root,'..');
 if(resolve(dataDir)!==resolve(target,'data')||!existsSync(join(target,'ecustudio.json')))return '当前不是标准安装目录，请先用安装包完成一次安装/升级';
 if(!['update-runner.mjs','update-protocol.mjs','upgrade.mjs'].every(n=>existsSync(join(root,'scripts',n))))return '更新组件缺失，请用安装包修复一次';
 return null;
}
function status(){const s=read(statusPath);if(!s)return null;const active=P.ACTIVE_UPDATE_STATES.includes(s.phase);return {...s,...(active&&!P.processAlive(s.pid)?{phase:'interrupted',message:'上次更新进程已中断，可恢复或重新检查更新'}:{}),canRecover:existsSync(join(dataDir,'upgrade.lock'))&&!P.processAlive(s.pid)};}
function publicRun(s:any){if(!s)return null;const {id,phase,message,percent,downloadedBytes,totalBytes,version,fromVersion,createdAt,updatedAt,finishedAt,error,backup,canRecover}=s;const backupReady=backup?existsSync(join(backup,'database.sqlite')):false;return {id,phase,message,percent,downloadedBytes,totalBytes,version,fromVersion,createdAt,updatedAt,finishedAt,error,backup,backupReady,canRecover};}
function noTasks(){if(get("SELECT count(*) n FROM jobs WHERE state IN ('queued','running')").n||get("SELECT count(*) n FROM outbox WHERE state='sending'").n)err('UPDATE_TASKS_ACTIVE','请先等待排队或运行中的任务完成，再升级工作台',409);}
function cleanGate(){if(!existsSync(lockPath))return;const gate=read(lockPath),s=status();if(s&&P.processAlive(s.pid)&&P.ACTIVE_UPDATE_STATES.includes(s.phase))err('UPDATE_RUNNING','已有升级正在进行，请等待完成',409);if(gate&&gate.pid&&P.processAlive(gate.pid)&&Date.now()-Date.parse(gate.createdAt)<30000)err('UPDATE_RUNNING','升级正在启动，请稍候',409);unlinkSync(lockPath);}
const input=z.object({version:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
function view(){const cache=read(cachePath);let latest=null,error=cache?.error||null;
 if(cache?.envelope)try{const r=P.verifyRelease(cache.envelope);latest={version:r.version,publishedAt:r.publishedAt,notes:r.notes,bytes:r.packages[P.platformKey()]?.bytes,sha256:r.packages[P.platformKey()]?.sha256,available:P.compareVersions(r.version,appVersion)>0,compatible:P.compareVersions(appVersion,r.minimumVersion)>=0};}catch(e:any){error=e.message;}
 return {currentVersion:appVersion,supported:!support(),unsupportedReason:support(),latest,checkedAt:cache?.checkedAt||null,checkError:error,run:publicRun(status())};
}
export async function registerUpdates(app:any,overrides:any={}){
 const load=overrides.fetchRelease||P.fetchRelease;
 app.get('/api/settings/updates',async()=>view());
 app.post('/api/settings/updates/check',async()=>{
  if(P.ACTIVE_UPDATE_STATES.includes(status()?.phase))err('UPDATE_RUNNING','升级进行中，请等待完成',409);
  try{const {envelope}=await load();P.verifyRelease(envelope);P.atomicJson(cachePath,{checkedAt:new Date().toISOString(),envelope});return view();}
  catch(e:any){P.atomicJson(cachePath,{checkedAt:new Date().toISOString(),error:e.message});err('UPDATE_CHECK_FAILED',e.message,502);}
 });
 async function start(req:any,recover=false){
  const reason=support();if(reason)err('UPDATE_UNSUPPORTED',reason,422);
  const old=status();
  if(old&&P.ACTIVE_UPDATE_STATES.includes(old.phase))return {run:publicRun(old)};
  if(!recover&&existsSync(join(dataDir,'upgrade.lock')))err('UPDATE_RECOVERY_REQUIRED','请先恢复上次未完成的升级',409);
  noTasks();
  let envelope:any,release:any;
  if(!recover){const b=input.parse(req.body),loaded=await load();envelope=loaded.envelope;release=P.verifyRelease(envelope);const file=release.packages[P.platformKey()];
   if(b.version!==release.version||b.sha256!==file.sha256)err('UPDATE_CHANGED','发布版本已变化，请重新检查更新',409);
   if(P.compareVersions(release.version,appVersion)<=0)err('UPDATE_NOT_NEWER','当前已是最新版本',409);
   if(P.compareVersions(appVersion,release.minimumVersion)<0)err('UPDATE_TOO_OLD','当前版本需先通过安装包接入在线升级',422);
  }else if(!old?.canRecover||!old.workdir||!old.source)err('UPDATE_NO_RECOVERY','没有可在线恢复的升级，请使用缓存包中的恢复入口',409);
  // Recheck permissions after the network request, before launching a privileged local action.
  const actor=get('SELECT * FROM users WHERE id=?',req.user.id);if(!actor||actor.role!=='admin'||actor.status!=='active'||actor.must_change_password)err('FORBIDDEN','管理员权限已变更',403);
  mkdirSync(dir,{recursive:true,mode:0o700});cleanGate();let lock;try{lock=openSync(lockPath,'wx',0o600);}catch{err('UPDATE_RUNNING','已有升级正在启动',409);}
  const runId=id(),target=realpathSync(resolve(root,'..'));let workdir:string;
  try{
   const folder=join(tmpdir(),'EcuStudio-updates-'+hash(target).slice(0,16));mkdirSync(folder,{recursive:true,mode:0o700});
   workdir=recover?old.workdir:mkdtempSync(join(folder,'run-'));
   const rel=relative(realpathSync(folder),realpathSync(workdir));if(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep))throw new Error('升级缓存位置无效');
   const createdAt=new Date().toISOString();writeFileSync(lock,JSON.stringify({id:runId,pid:process.pid,createdAt}));closeSync(lock);lock=undefined;
   for(const name of ['update-runner.mjs','update-protocol.mjs','upgrade.mjs'])copyFileSync(join(root,'scripts',name),join(workdir,name));
   const request={id:runId,target,workdir,actorId:actor.id,actorRevision:actor.revision,fromVersion:appVersion,envelope,recover,source:recover?old.source:undefined};
   const path=join(workdir,'request.json');P.atomicJson(path,request);
   const state={id:runId,phase:recover?'recovering':'queued',message:recover?'准备恢复未完成升级':'更新已排队，正在准备下载',createdAt,updatedAt:createdAt,pid:process.pid,fromVersion:appVersion,version:release?.version||old.version,workdir,source:recover?old.source:undefined};P.atomicJson(statusPath,state);
   const launch=overrides.launch||((path:string)=>{const out=openSync(join(workdir,'update.log'),'a',0o600);try{const env={...process.env};delete env.DEEPSEEK_API_KEY;const child=spawn(process.execPath,[join(workdir,'update-runner.mjs'),path],{cwd:workdir,detached:true,windowsHide:true,stdio:['ignore',out,out],env});child.on('error',()=>{P.atomicJson(statusPath,{...state,phase:'failed',message:'无法启动升级进程，请检查服务器运行权限'});});child.unref();return child.pid;}finally{closeSync(out);}});
   const pid=launch(path);if(!pid)throw new Error('无法启动更新进程');const latest=read(statusPath);if(latest?.id===runId&&latest.phase===state.phase)P.atomicJson(statusPath,{...latest,pid});
   audit(recover?'update.recover':'update.start',runId,{actor:actor.id,version:state.version});return {run:publicRun(status())};
  }catch(e:any){if(lock!==undefined)closeSync(lock);if(existsSync(lockPath))unlinkSync(lockPath);const s=read(statusPath);if(s?.id===runId)P.atomicJson(statusPath,{...s,phase:'failed',message:'更新未能启动，原程序和数据未改变',error:e.message});throw e;}
 }
 app.post('/api/settings/updates/install',async(req:any,reply:any)=>reply.code(202).send(await start(req)));
 app.post('/api/settings/updates/recover',async(req:any,reply:any)=>reply.code(202).send(await start(req,true)));
}
