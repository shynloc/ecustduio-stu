// Same-directory upgrades. No business files or credentials are uploaded.
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, renameSync, unlinkSync, lstatSync, realpathSync, symlinkSync, openSync, closeSync } from 'node:fs';
import { resolve, join, dirname, relative, isAbsolute, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const digest = b => createHash('sha256').update(b).digest('hex');
const readJson = p => JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const inside = (base,p) => { const r=relative(base,resolve(p)); return r==='' || (!isAbsolute(r) && r!=='..' && !r.startsWith('..'+sep)); };
function safePath(base,name) {
  const p=resolve(base,name); if(!inside(base,p)||p===base)throw new Error('Unsafe upgrade path');
  // Parents may not redirect writes outside the installation. A final symlink is handled separately.
  for(let parent=dirname(p);inside(base,parent);parent=dirname(parent)) {
    if(existsSync(parent)&&!inside(base,realpathSync(parent)))throw new Error('Linked directory leaves installation');
    if(parent===base)break;
  }
  return p;
}
function copyInto(from,base,name){const to=safePath(base,name);if(existsSync(to)&&lstatSync(to).isSymbolicLink())throw new Error('Refusing to overwrite a linked file');mkdirSync(dirname(to),{recursive:true});copyFileSync(from,to);}
function moveInside(root,from,to){safePath(root,relative(root,from));safePath(root,relative(root,to));if(existsSync(to))throw new Error('Recovery destination already exists');mkdirSync(dirname(to),{recursive:true});renameSync(from,to);}
function execute(node,args,options={}){
  const r=spawnSync(node,args,{windowsHide:true,stdio:'inherit',timeout:600000,...options});
  if(r.error||r.status!==0)throw new Error('Upgrade step failed; see the preceding message.');
}
const quote = name => '"'+name.replaceAll('"','""')+'"';
const tables=['project_html_film_threads','wechat_manuscripts','wechat_accounts','wechat_previews','wechat_drafts','users','settings','sources','assets','snapshots','paragraphs','claims','topics','projects','versions','drafts','notes','note_documents','note_categories','note_history','context_refs','knowledge_operations','evidence_blocks','evidence_reviews','pipeline_preferences','conversations','messages','characters','media_jobs','note_materials','visual_drafts','visual_approvals','source_previews'];
export function inventory(dbPath,previous) {
  const db=new DatabaseSync(dbPath,{readOnly:true});const result={};
  try {
    for(const name of (previous?Object.keys(previous):tables)){
      if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)) {if(previous)throw new Error('An existing data table is missing');continue;}
      const columns=previous?.[name].columns || db.prepare('PRAGMA table_info('+quote(name)+')').all().map(c=>c.name);
      const h=createHash('sha256');let count=0;
      for(const row of db.prepare('SELECT '+columns.map(quote).join(',')+' FROM '+quote(name)+' ORDER BY rowid').iterate()){h.update(JSON.stringify(row));h.update('\n');count++;}
      result[name]={columns,count,sha256:h.digest('hex')};
    }
  }finally{db.close();}return result;
}
function idle(root){const db=new DatabaseSync(join(root,'data/app.sqlite'),{readOnly:true});try{
  const n=db.prepare("SELECT count(*) n FROM jobs WHERE state IN ('running','queued')").get().n;
  if(n)throw new Error('There are queued/running tasks. Finish them in the workbench, then run upgrade again.');
  if(db.prepare("SELECT count(*) n FROM outbox WHERE state='sending'").get().n)throw new Error('A notification is being sent. Retry after it finishes.');
}finally{db.close();}}
function protectedFiles(root){const result={};for(const name of ['ecustudio.json','app/.env','data/secrets.dpapi','data/secrets.keychain.json'])if(existsSync(join(root,name)))result[name]=digest(readFileSync(join(root,name)));return result;}
function dependencies(path){const lock=readJson(path),packages=Object.fromEntries(Object.entries(structuredClone(lock.packages)).filter(([,v])=>!v.dev));if(packages?.['']){delete packages[''].version;delete packages[''].devDependencies;}return digest(JSON.stringify({lockfileVersion:lock.lockfileVersion,packages}));}
async function health(root){const cfg=readJson(join(root,'ecustudio.json'));try{return await (await fetch('http://127.0.0.1:'+cfg.port+'/health',{signal:AbortSignal.timeout(1200)})).json();}catch{return null;}}
const instance = root => digest(resolve(root,'data')).slice(0,16);
const pause = ms => new Promise(r=>setTimeout(r,ms));
// Self-contained: older online updaters copy this file into a temporary directory.
// Never signal an arbitrary node process or trust a stale PID file on its own.
export async function stopMacService(root, options={}) {
  const io={
    run:(file,args)=>spawnSync(file,args,{encoding:'utf8',timeout:8000,windowsHide:true}),
    kill:(pid,signal)=>process.kill(pid,signal),uid:()=>process.getuid(),selfPid:process.pid,
    exists:existsSync,read:readJson,canonical:p=>realpathSync(p),health:()=>health(root),pause,
    log:value=>{mkdirSync(join(root,'data/logs'),{recursive:true});writeFileSync(join(root,'data/logs/mac-stop.json'),JSON.stringify(value,null,2),{mode:0o600});},
    attempts:60,forceAttempts:20,interval:250,allowForce:false,...options,
  };
  const uid=io.uid(),app=io.canonical(join(root,'app')),entry=join(root,'app/dist-server/server/index.js');
  const report={startedAt:new Date().toISOString(),instance:instance(root),launchctl:[],signalled:[],forced:[],ok:false};
  const run=(file,args)=>{const r=io.run(file,args);return {status:r.status,stdout:String(r.stdout||'').trim(),error:r.error?.code};};
  function candidate(pid){
    if(!Number.isSafeInteger(pid)||pid<=1||pid===io.selfPid)return null;
    const owner=run('/bin/ps',['-p',String(pid),'-o','uid=']);if(owner.status!==0||owner.stdout!==String(uid))return null;
    const comm=run('/bin/ps',['-ww','-p',String(pid),'-o','comm=']);if(comm.status!==0||!/(?:^|[\/\\])node$/.test(comm.stdout))return null;
    const args=run('/bin/ps',['-ww','-p',String(pid),'-o','command=']);
    const relativeEntry='dist-server/server/index.js';
    if(args.status!==0||![entry,relativeEntry,'./'+relativeEntry].some(e=>args.stdout.endsWith(' '+e)))return null;
    const cwd=run('/usr/sbin/lsof',['-a','-p',String(pid),'-d','cwd','-Fn']);
    const directory=cwd.stdout.split('\n').find(line=>line.startsWith('n'))?.slice(1);
    try{if(cwd.status!==0||!directory||io.canonical(directory)!==app)return null;}catch{return null;}
    const started=run('/bin/ps',['-p',String(pid),'-o','lstart=']);if(started.status!==0||!started.stdout)return null;
    const state=run('/bin/ps',['-p',String(pid),'-o','stat=']);if(state.status!==0||state.stdout.startsWith('Z'))return null;
    return {pid,fingerprint:digest([owner.stdout,comm.stdout,args.stdout,app,started.stdout].join('\n'))};
  }
  const pidFile=join(root,'data/logs/mac-server.json');
  const port=Number(io.read(join(root,'ecustudio.json')).port);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid workbench port; no process was stopped.');
  function candidates(){
    const ids=new Set();
    if(io.exists(pidFile))try{ids.add(Number(io.read(pidFile).pid));}catch{}
    const listeners=run('/usr/sbin/lsof',['-nP','-a','-iTCP:'+port,'-sTCP:LISTEN','-t']);
    if(listeners.status===0)for(const value of listeners.stdout.split(/\s+/))ids.add(Number(value));
    return [...ids].map(candidate).filter(Boolean);
  }
  const tracked=new Map(candidates().map(p=>[p.pid,p]));
  const same=p=>{const current=candidate(p.pid);return current?.fingerprint===p.fingerprint;};
  try{
    const initial=await io.health();
    if(initial?.instanceId&&initial.instanceId!==instance(root))throw new Error('配置端口由另一个工作台实例占用，未停止任何进程。请确认原安装目录和端口。');
    // Both domains are possible when an installation was started from a terminal.
    for(const domain of ['gui/'+uid,'user/'+uid]){
      const service=domain+'/cn.ecustudio.'+instance(root);
      const result=run('/bin/launchctl',['bootout',service]);
      report.launchctl.push({domain,status:result.status,error:result.error});
      if(run('/bin/launchctl',['print',service]).status===0)throw new Error('Mac 登录自启服务未能卸载，请在原 Mac 登录用户的终端运行升级脚本。');
    }
    for(const p of candidates())tracked.set(p.pid,p);
    for(const p of tracked.values())if(same(p)){try{io.kill(p.pid,'SIGTERM');report.signalled.push(p.pid);}catch(e){if(e.code!=='ESRCH')throw e;}}
    async function stopped(){
      const listeners=candidates();
      for(const p of listeners)if(!tracked.has(p.pid)||tracked.get(p.pid).fingerprint!==p.fingerprint)throw new Error('另一个启动器正在重新拉起工作台，请先关闭该启动器，再运行升级脚本。');
      return ![...tracked.values()].some(same)&&(await io.health())?.instanceId!==instance(root);
    }
    for(let n=0;n<io.attempts;n++){if(await stopped()){report.ok=true;return report;}await io.pause(io.interval);}
    // Used only by an idle, maintenance-gated upgrade. Revalidate UID, command,
    // cwd and start time immediately before escalating an unresponsive process.
    if(io.allowForce&&io.exists(join(root,'data/upgrade-maintenance.json'))){
      for(const p of tracked.values())if(same(p)){try{io.kill(p.pid,'SIGKILL');report.forced.push(p.pid);}catch(e){if(e.code!=='ESRCH')throw e;}}
      for(let n=0;n<io.forceAttempts;n++){if(await stopped()){report.ok=true;return report;}await io.pause(io.interval);}
    }
    throw new Error('旧服务仍在运行，尚未替换程序或资料。请关闭工作台网页，在原 Mac 用户下运行新版 Upgrade.command；停机诊断见 data/logs/mac-stop.json。');
  }catch(e){report.error=e.message;throw e;}
  finally{report.finishedAt=new Date().toISOString();io.log(report);}
}
export const systemAdapter = {
  async stop(root){
    if(process.platform==='win32')execute(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(root,'Stop-EcuStudio.ps1')]);
    else if(process.platform==='darwin'){await stopMacService(root,{allowForce:true});return;}
    else throw new Error('Use the Windows or macOS upgrade package');
    for(let n=0;n<40;n++){if((await health(root))?.instanceId!==instance(root))return;await pause(250);}
    throw new Error('The old service is still running; no files were replaced.');
  },
  async prepare(source,root,stage){
    const old=join(root,'app'),reuse=existsSync(join(old,'node_modules'))&&dependencies(join(old,'package-lock.json'))===dependencies(join(stage,'package-lock.json'));
    const env={...process.env,ECUSTUDIO_DATA_DIR:join(dirname(stage),'probe-data'),DEEPSEEK_API_KEY:'',PLAYWRIGHT_BROWSERS_PATH:join(root,'runtime/browsers')};
    if(reuse)symlinkSync(join(old,'node_modules'),join(stage,'node_modules'),process.platform==='win32'?'junction':'dir');
    else {
      const candidates=[join(root,'runtime/node/node_modules/npm/bin/npm-cli.js'),join(root,'runtime/node/lib/node_modules/npm/bin/npm-cli.js'),join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),resolve(dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')];
      const npm=candidates.find(existsSync);if(!npm)throw new Error('npm runtime missing; repair the existing runtime first.');
      execute(process.execPath,[npm,'ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:stage,env});
      execute(process.execPath,['node_modules/playwright/cli.js','install','chromium','--only-shell'],{cwd:stage,env});
    }
    try{execute(process.execPath,['--input-type=module','-e',"const {buildApp}=await import('./dist-server/server/app.js');const a=await buildApp(false);await a.ready();await a.close();const d=await import('./dist-server/server/db.js');d.db.close();"],{cwd:stage,env});}
    finally{if(reuse&&existsSync(join(stage,'node_modules')))unlinkSync(join(stage,'node_modules'));}
    return reuse;
  },
  async migrate(root){execute(process.execPath,['--input-type=module','-e',"const d=await import('./dist-server/server/db.js');d.db.close();"],{cwd:join(root,'app'),env:{...process.env,ECUSTUDIO_DATA_DIR:join(root,'data')}});},
  async start(root,noBrowser=true){
    if(process.platform==='win32')execute(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(root,'Start-EcuStudio.ps1'),'-NoBrowser']);
    else execute(process.execPath,[join(root,'app/scripts/macos-service.mjs'),'start'],{cwd:join(root,'app'),env:{...process.env,ECUSTUDIO_NO_BROWSER:'1'}});
  },
  async verify(root,version){const h=await health(root);if(h?.version!==version||h?.instanceId!==instance(root))throw new Error('The upgraded service did not pass its version/instance check');},
  async open(root){const url='http://127.0.0.1:'+readJson(join(root,'ecustudio.json')).port;
    if(process.platform==='darwin')spawnSync('/usr/bin/open',[url]);
    else spawnSync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',"Start-Process '"+url+"'"],{windowsHide:true});
  },
};
function validateSource(source,target){
  const manifest=readJson(join(source,'manifest.json'));if(manifest.product!=='EcuStudio教创工作台'||!/^\d+\.\d+\.\d+$/.test(manifest.version))throw new Error('Not a valid EcuStudio package');
  if((process.platform==='win32'&&!manifest.platform?.startsWith('Windows'))||(process.platform==='darwin'&&!manifest.platform?.startsWith('macOS')))throw new Error('Use the package for this operating system');
  const seen=new Set();for(const f of manifest.files){
    if(typeof f.path!=='string'||f.path.includes('\\')||f.path.split('/').some(x=>['','..','.'].includes(x))||isAbsolute(f.path)||seen.has(f.path))throw new Error('Invalid package manifest path');seen.add(f.path);
    if(/^(?:data|runtime)\//.test(f.path)||/(?:^|\/)(?:\.env|ecustudio\.json|installation-result\.json|secrets\.dpapi|secrets\.keychain\.json)$/.test(f.path)||f.path.endsWith('.sqlite')||f.path.startsWith('app/node_modules/'))throw new Error('Package contains protected files');
    const p=safePath(source,f.path);if(!lstatSync(p).isFile()||lstatSync(p).isSymbolicLink())throw new Error('Package contains a linked/non-file entry');const b=readFileSync(p);if(b.length!==f.bytes||digest(b)!==f.sha256)throw new Error('Package checksum mismatch: '+f.path);
  }
  for(const file of ['app/package.json','app/package-lock.json','app/dist-server/server/index.js','app/migrations/003_media.sql'])if(!seen.has(file))throw new Error('Incomplete upgrade package');
  const old=readJson(join(target,'app/package.json'));if(old.name!=='ecustudio'||!/^\d+\.\d+\.\d+$/.test(old.version))throw new Error('Unsupported existing version; downgrades are refused');
  if(old.version.split('.').map(Number).some((n,i,a)=>n>manifest.version.split('.').map(Number)[i]&&a.slice(0,i).every((v,j)=>v===Number(manifest.version.split('.')[j]))))throw new Error('Downgrades are refused');
  if(readJson(join(source,'app/package.json')).version!==manifest.version)throw new Error('Package version mismatch');
  return {manifest,oldVersion:old.version};
}
function writeState(state){const destination=safePath(state.target,relative(state.target,join(state.backup,'journal.json'))),temporary=safePath(state.target,relative(state.target,join(state.backup,'journal-'+randomUUID()+'.tmp')));writeFileSync(temporary,JSON.stringify(state,null,2),{mode:0o600});renameSync(temporary,destination);}
function unlock(root){for(const n of ['data/upgrade-maintenance.json','data/upgrade.lock'])if(existsSync(join(root,n)))unlinkSync(safePath(root,n));}
async function restore(state,adapter){
  const root=state.target,oldApp=join(state.backup,'old-app'),current=join(root,'app'),failed=join(state.backup,'failed-app');
  const restoringPromotedApp=existsSync(oldApp)||existsSync(failed);
  if(!restoringPromotedApp){state.status='aborted';writeState(state);unlock(root);await adapter.start(root,true);return;}
  await adapter.stop(root);
  if(existsSync(oldApp)){
    if(state.reuseDependencies&&!existsSync(join(oldApp,'node_modules'))&&existsSync(join(current,'node_modules')))moveInside(root,join(current,'node_modules'),join(oldApp,'node_modules'));
    if(existsSync(current))moveInside(root,current,failed);
    moveInside(root,oldApp,current);
  }
  if(restoringPromotedApp){
    for(const item of state.rootFiles){const target=safePath(root,item.path);if(item.existed)copyInto(join(state.backup,'root-files',item.path),root,item.path);else if(existsSync(target))unlinkSync(target);}
    const failedDatabase='failed-database-'+randomUUID().slice(0,8)+'.sqlite';
    for(const suffix of ['','-wal','-shm']){const db=join(root,'data/app.sqlite'+suffix);if(existsSync(db))moveInside(root,db,join(state.backup,failedDatabase+suffix));}
    copyInto(join(state.backup,'database.sqlite'),root,'data/app.sqlite');
    for(const name of ['ecustudio.json','data/secrets.dpapi','data/secrets.keychain.json'])if(existsSync(join(state.backup,'preserved',name)))copyInto(join(state.backup,'preserved',name),root,name);
    if(JSON.stringify(inventory(join(root,'data/app.sqlite'),state.inventory))!==JSON.stringify(state.inventory))throw new Error('Restored data validation failed');
  }
  state.status='rolled-back';writeState(state);unlock(root);await adapter.start(root,true);
}
export async function upgrade({source,target,noBrowser=false,recover=false,adapter=systemAdapter,beforeCommit=()=>{},onProgress=()=>{}}){
  source=realpathSync(resolve(source));target=realpathSync(resolve(target));
  if(source===target||inside(source,target)||inside(target,source))throw new Error('Extract the new ZIP to a separate folder outside the old installation; do not overwrite the old folder.');
  if(!existsSync(join(target,'data/app.sqlite'))||!existsSync(join(target,'ecustudio.json')))throw new Error('Choose the original installation folder containing app, data and ecustudio.json.');
  if(!inside(target,realpathSync(join(target,'data')))||!inside(target,realpathSync(join(target,'app'))))throw new Error('Linked app/data directories require a manual upgrade.');
  const lock=join(target,'data/upgrade.lock');
  if(recover){
    onProgress('recovering','正在恢复未完成的升级');
    if(!existsSync(lock))throw new Error('No unfinished upgrade was found.');const pending=readJson(lock);
    try{process.kill(pending.pid,0);throw new Error('An upgrade process is still running.');}catch(e){if(e.code!=='ESRCH')throw e;}
    const b=safePath(target,pending.backup);if(!inside(join(target,'data/upgrade-backups'),b))throw new Error('Invalid recovery path');
    const state=readJson(join(b,'journal.json'));if(state.target!==target||state.backup!==b||!['staging','backed-up','installing','verifying','complete','rolled-back','aborted'].includes(state.status))throw new Error('Invalid pending upgrade');
    if(state.status==='complete'){await adapter.start(target,true);await adapter.verify(target,state.to);unlock(target);return {status:'complete',version:state.to,backup:b};}
    if(['rolled-back','aborted'].includes(state.status)){unlock(target);await adapter.start(target,true);return {status:'rolled-back',backup:b};}
    await restore(state,adapter);return {status:'rolled-back',backup:b};
  }
  const {manifest,oldVersion}=validateSource(source,target);idle(target);
  let fd;try{fd=openSync(lock,'wx',0o600);}catch{throw new Error('Another/unfinished upgrade exists. Wait for it or use the recovery launcher.');}
  const backupDir=safePath(target,'data/upgrade-backups/'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8));mkdirSync(backupDir,{recursive:true,mode:0o700});
  writeFileSync(fd,JSON.stringify({pid:process.pid,backup:relative(target,backupDir)}));closeSync(fd);
  const state={target,backup:backupDir,source,from:oldVersion,to:manifest.version,status:'staging',rootFiles:[],reuseDependencies:false};writeState(state);
  let stopped=false,promoted=false,committed=false;
  try{
    onProgress('preparing','正在准备依赖并检查新程序，原服务仍可使用',{backup:backupDir,backupReady:false});
    console.log('1/5 Verifying and preparing the new program (old service remains available)...');
    const staged=join(backupDir,'new-app');mkdirSync(staged);for(const f of manifest.files.filter(f=>f.path.startsWith('app/')))copyInto(join(source,f.path),staged,f.path.slice(4));
    state.reuseDependencies=await adapter.prepare(source,target,staged);writeState(state);
    await beforeCommit();idle(target);writeFileSync(safePath(target,'data/upgrade-maintenance.json'),JSON.stringify({startedAt:new Date().toISOString(),version:manifest.version}),{mode:0o600});
    onProgress('backing-up','正在停止服务并备份账号、资料记录与配置');
    console.log('2/5 Stopping the service and backing up database/configuration...');
    await adapter.stop(target);stopped=true;idle(target);
    const db=new DatabaseSync(join(target,'data/app.sqlite'),{readOnly:true});try{await backup(db,join(backupDir,'database.sqlite'));}finally{db.close();}
    state.inventory=inventory(join(target,'data/app.sqlite'));state.protected=protectedFiles(target);
    for(const name of ['data/secrets.dpapi','data/secrets.keychain.json','ecustudio.json'])if(existsSync(join(target,name)))copyInto(join(target,name),backupDir,'preserved/'+name);
    for(const name of [...manifest.files.filter(f=>!f.path.startsWith('app/')).map(f=>f.path),'manifest.json']){
      const destination=safePath(target,name),existed=existsSync(destination);if(existed){if(lstatSync(destination).isSymbolicLink())throw new Error('Linked destination file');copyInto(destination,backupDir,'root-files/'+name);}state.rootFiles.push({path:name,existed});
    }
    if(existsSync(join(target,'app/.env')))copyInto(join(target,'app/.env'),staged,'.env');
    state.status='backed-up';writeState(state);
    onProgress('installing','正在安装新版，素材文件与加密凭据原位保留',{backupReady:true});
    console.log('3/5 Replacing program files; existing data/assets and credentials stay in place...');
    moveInside(target,join(target,'app'),join(backupDir,'old-app'));promoted=true;
    moveInside(target,staged,join(target,'app'));
    if(state.reuseDependencies)moveInside(target,join(backupDir,'old-app/node_modules'),join(target,'app/node_modules'));
    for(const item of state.rootFiles)copyInto(join(source,item.path),target,item.path);
    state.status='installing';writeState(state);await adapter.migrate(target);
    if(JSON.stringify(inventory(join(target,'data/app.sqlite'),state.inventory))!==JSON.stringify(state.inventory))throw new Error('Existing account/material/settings data changed unexpectedly; rolling back.');
    if(JSON.stringify(protectedFiles(target))!==JSON.stringify(state.protected))throw new Error('Configuration or credential bytes changed unexpectedly; rolling back.');
    console.log('4/5 Starting and checking the upgraded service...');state.status='verifying';writeState(state);
    onProgress('restarting','正在重启工作台并校验数据，请等待页面自动重连');
    await adapter.start(target,true);await adapter.verify(target,manifest.version);
    state.completedAt=new Date().toISOString();
    const result={status:'complete',version:manifest.version,previousVersion:oldVersion,installDir:target,backup:backupDir,accountsAndMaterialsPreserved:true,credentialsUnchanged:true,finishedAt:state.completedAt};
    writeFileSync(join(target,'upgrade-result.json'),JSON.stringify(result,null,2),{mode:0o600});
    state.status='complete';writeState(state);committed=true;unlock(target);
    console.log('5/5 Upgrade complete. Existing accounts, materials, AI settings and credentials are retained.');
    console.log('Local backup: '+backupDir);if(!noBrowser)try{await adapter.open(target);}catch{}
    return result;
  }catch(e){
    console.error('Upgrade stopped: '+e.message);
    if(committed){console.error('The new version passed validation. Use the recovery launcher to finish unlocking if needed.');throw e;}
    if(promoted||existsSync(join(backupDir,'old-app'))){try{onProgress('recovering','新版本检查未通过，正在自动恢复旧版');await restore(state,adapter);console.error('The old program and database were restored.');}catch(re){console.error((existsSync(lock)?'Automatic recovery needs attention. Keep the installation and run the recovery launcher. ':'Old files were restored, but the service could not start. Use the normal Start launcher. ')+re.message);throw e;}}
    else{state.status='aborted';writeState(state);unlock(target);if(stopped)try{await adapter.start(target,true);}catch{console.error('Start the original service with its normal launcher.');}}
    throw e;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2),value=name=>args[args.indexOf(name)+1];
  try{if(!args.includes('--target'))throw new Error('Missing original installation folder');const result=await upgrade({source:args.includes('--source')?value('--source'):dirname(import.meta.filename),target:value('--target'),noBrowser:args.includes('--no-browser'),recover:args.includes('--recover')});console.log(JSON.stringify(result,null,2));}
  catch(e){console.error(e.message);process.exitCode=1;}
}
