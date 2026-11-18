import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {stopMacService} from '../deployment/upgrade.mjs';

function fixture({relative=false,stale=false,blocked=false,maintenance=true}={}){
 const root=mkdtempSync(join(tmpdir(),'ecustudio mac with spaces ')),app=join(root,'app');
 const own={pid:123,uid:501,comm:'/runtime/node',command:'node '+(relative?'dist-server/server/index.js':join(app,'dist-server/server/index.js')),cwd:app,start:'Mon Nov 16 12:00:00 2026',alive:true,listen:true,blocked};
 const unrelated={...own,pid:124,cwd:join(root,'other-app')};
 const ps=new Map([[123,own],[124,unrelated]]),signals=[],calls=[],id=createHash('sha256').update(join(root,'data')).digest('hex').slice(0,16);let report;
 const io={uid:()=>501,selfPid:99,canonical:p=>p,attempts:2,forceAttempts:2,interval:1,allowForce:true,
  exists:p=>p.endsWith('mac-server.json')?stale:p.endsWith('upgrade-maintenance.json')?maintenance:false,
  read:p=>p.endsWith('ecustudio.json')?{port:37891}:{pid:124},
  health:async()=>own.alive&&own.listen?{instanceId:id}:null,pause:async()=>{},log:r=>report=r,
  kill:(pid,signal)=>{signals.push([pid,signal]);const p=ps.get(pid);if(!p.blocked||signal==='SIGKILL'){p.alive=false;p.listen=false;}},
  run:(file,args)=>{
   calls.push([file,args]);const ok=stdout=>({status:0,stdout}),missing={status:1,stdout:''};
   if(file.endsWith('launchctl'))return {status:args[0]==='bootout'?5:113,stdout:''};
   if(file.endsWith('lsof')){
    if(args.includes('-iTCP:37891')){const ids=[...ps.values()].filter(p=>p.alive&&p.listen).map(p=>p.pid).join('\n');return ids?ok(ids):missing;}
    const p=ps.get(Number(args[args.indexOf('-p')+1]));return p?.alive?ok('p'+p.pid+'\nn'+p.cwd+'\n'):missing;
   }
   if(file.endsWith('/ps')){const p=ps.get(Number(args[args.indexOf('-p')+1]));if(!p?.alive)return missing;return ok(({ 'uid=':p.uid,'comm=':p.comm,'command=':p.command,'lstart=':p.start,'stat=':'S' })[args.at(-1)]);}
   throw new Error('Unexpected command '+file);
  }};
 return {root,own,unrelated,ps,signals,calls,io,report:()=>report};
}
test('无 PID 文件、launchctl 返回失败时，按端口识别相对入口；不停止其他目录的 Node',async()=>{
 const f=fixture({relative:true});await stopMacService(f.root,f.io);
 assert.deepEqual(f.signals,[[123,'SIGTERM']]);assert.equal(f.unrelated.alive,true);assert.equal(f.report().ok,true);
 assert.ok(f.calls.some(([file,args])=>file.endsWith('/ps')&&args.includes('-ww')));
});
test('陈旧 PID 指向其他工作台时不会误杀，仍找到正确实例',async()=>{
 const f=fixture({stale:true});await stopMacService(f.root,f.io);assert.deepEqual(f.signals,[[123,'SIGTERM']]);assert.equal(f.unrelated.alive,true);
});
test('不能停止其他操作系统用户的进程，也不报告停止成功',async()=>{
 const f=fixture();f.own.uid=502;await assert.rejects(stopMacService(f.root,f.io),/旧服务仍在运行/);assert.deepEqual(f.signals,[]);assert.equal(f.report().ok,false);
});
test('端口健康响应属于其他安装实例时不卸载或停止服务',async()=>{
 const f=fixture();f.io.health=async()=>({instanceId:'different-installation'});
 await assert.rejects(stopMacService(f.root,f.io),/另一个工作台实例/);assert.deepEqual(f.signals,[]);assert.ok(!f.calls.some(([file])=>file.endsWith('launchctl')));
});
test('登录自启服务仍加载时停止升级，不进入反复杀进程循环',async()=>{
 const f=fixture(),run=f.io.run;f.io.run=(file,args)=>file.endsWith('launchctl')&&args[0]==='print'?{status:0,stdout:'active'}:run(file,args);
 await assert.rejects(stopMacService(f.root,f.io),/未能卸载/);assert.deepEqual(f.signals,[]);
});
test('已维护锁定的升级可结束拒绝 SIGTERM 的同一实例；普通停止不强制杀进程',async()=>{
 const f=fixture({blocked:true});await stopMacService(f.root,f.io);assert.deepEqual(f.signals,[[123,'SIGTERM'],[123,'SIGKILL']]);assert.equal(f.report().ok,true);
 const g=fixture({blocked:true,maintenance:false});await assert.rejects(stopMacService(g.root,g.io),/旧服务仍在运行/);assert.deepEqual(g.signals,[[123,'SIGTERM']]);
});
test('PID 重用或外部启动器重新拉起服务时拒绝升级，不杀新进程',async()=>{
 const f=fixture({blocked:true});f.io.pause=async()=>{f.own.start='Mon Nov 16 12:01:00 2026';};
 await assert.rejects(stopMacService(f.root,f.io),/重新拉起/);assert.deepEqual(f.signals,[[123,'SIGTERM']]);
});
