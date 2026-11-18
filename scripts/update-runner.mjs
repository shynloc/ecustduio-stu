// Copied to a private temporary directory before launch; survives the server restart.
import {existsSync,readFileSync,unlinkSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {upgrade} from './upgrade.mjs';
import {readJson,atomicJson,verifyRelease,platformKey,downloadRelease,extractRelease,compareVersions,sha256} from './update-protocol.mjs';
const request=readJson(resolve(process.argv[2])),statusPath=join(request.target,'data/updates/current.json'),gate=join(request.target,'data/updates/launch.lock');
let current=readJson(statusPath);
if(current.id!==request.id)throw new Error('Update request was replaced');
function state(phase,message,extra={}){current={...current,...extra,phase,message,pid:process.pid,updatedAt:new Date().toISOString()};atomicJson(statusPath,current);}
function actor(){const db=new DatabaseSync(join(request.target,'data/app.sqlite'),{readOnly:true});try{const u=db.prepare('SELECT role,status,must_change_password,revision FROM users WHERE id=?').get(request.actorId);if(!u||u.role!=='admin'||u.status!=='active'||u.must_change_password||u.revision!==request.actorRevision)throw new Error('管理员权限已变更，升级停止');}finally{db.close();}}
let engineStarted=false;
try{
 actor();state(request.recover?'recovering':'downloading',request.recover?'正在恢复中断的升级':'正在下载官方更新包');
 let source=request.source;
 if(!request.recover){
  const release=verifyRelease(request.envelope),file=release.packages[platformKey()];
  if(compareVersions(release.version,request.fromVersion)<=0)throw new Error('禁止降级或重复安装当前版本');
  let last=-1;const bytes=await downloadRelease(file,fetch,size=>{const percent=Math.floor(size/file.bytes*100);if(percent!==last){last=percent;state('downloading','正在下载更新包',{downloadedBytes:size,totalBytes:file.bytes,percent});}});
  state('verifying','正在核对签名和文件校验值');
  const require=createRequire(join(request.target,'app/package.json')),Zip=require('adm-zip');
  source=join(request.workdir,'package');state('extracting','正在解压更新包',{source});
  const manifest=extractRelease(bytes,source,Zip);if(manifest.version!==release.version)throw new Error('更新包版本与发布说明不一致');
 }
 actor();engineStarted=true;
 const result=await upgrade({source,target:request.target,noBrowser:true,recover:request.recover,beforeCommit:actor,onProgress:(phase,message,extra)=>state(phase,message,extra)});
 state(result.status==='complete'?'succeeded':'rolled-back',result.status==='complete'?'升级完成，账号、资料和DeepSeek配置已保留':'已恢复旧版，可继续使用',{version:result.version||request.fromVersion,backup:result.backup,finishedAt:new Date().toISOString()});
}catch(e){
 const hasPending=existsSync(join(request.target,'data/upgrade.lock'));
 state(hasPending?'interrupted':'failed',hasPending?'升级尚未完成，请恢复后再使用':'升级未完成，原有数据保留',{error:String(e.message).slice(0,1500),finishedAt:new Date().toISOString(),engineStarted});process.exitCode=1;
}finally{
 if(existsSync(gate)){try{if(readJson(gate).id===request.id)unlinkSync(gate);}catch{}}
}
