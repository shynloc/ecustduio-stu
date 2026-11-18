import React, {useEffect, useRef, useState} from 'react';
import {RefreshCw, Download, ShieldCheck} from 'lucide-react';
import {api, post} from './api';
import './updates.css';
const active=['queued','downloading','verifying','extracting','preparing','backing-up','installing','restarting','recovering'];
const marker='ecustudio:update-active';
export function UpdatePanel(){
 const [info,setInfo]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(''),[offline,setOffline]=useState(false);
 const mounted=useRef(true),fetching=useRef(false);
 async function refresh(){
  if(fetching.current)return;fetching.current=true;
  try{const next=await api('/settings/updates');if(!mounted.current)return;setInfo(next);setOffline(false);
   if(next.run&&active.includes(next.run.phase))sessionStorage.setItem(marker,next.run.id);
   if(next.run&&['succeeded','rolled-back','failed'].includes(next.run.phase)&&sessionStorage.getItem(marker)===next.run.id){sessionStorage.removeItem(marker);if(next.run.phase!=='failed')location.reload();}
  }catch(e:any){if(mounted.current){setOffline(true);if(!sessionStorage.getItem(marker))setError(e.message);}}
  finally{fetching.current=false;}
 }
 useEffect(()=>{mounted.current=true;refresh();const timer=setInterval(refresh,3000);return()=>{mounted.current=false;clearInterval(timer);};},[]);
 const run=info?.run,running=active.includes(run?.phase),latest=info?.latest;
 async function action(kind:string){setBusy(kind);setError('');try{
  if(kind==='check'){setInfo(await post('/settings/updates/check'));setOffline(false);}
  else{const result=await post('/settings/updates/'+kind,kind==='install'?{version:latest.version,sha256:latest.sha256}:{});sessionStorage.setItem(marker,result.run.id);setInfo((v:any)=>({...v,run:result.run}));}
 }catch(e:any){setError(e.message);}finally{setBusy('');}}
 return <section className="panel settings-card full update-panel" aria-label="工作台更新">
  <div className="section-head"><h2><RefreshCw size={22}/>工作台更新</h2><span className="badge">当前版本 {info?.currentVersion||'读取中'}</span></div>
  <p>管理员可直接在线升级。系统会自动下载、备份和重启，保留原有账号、资料及 DeepSeek 配置。升级期间请保持服务器电脑开机。</p>
  {info&&!info.supported&&<div className="update-status" role="status">{info.unsupportedReason}</div>}
  {latest&&<div className="update-release"><strong>{latest.available?'发现新版本 '+latest.version:'已是最新版本 '+info.currentVersion}</strong>
   {latest.available&&<><p>更新包约 {(latest.bytes/1024/1024).toFixed(1)} MB · 升级前请等待制作任务完成</p><ul>{latest.notes.map((n:string,i:number)=><li key={i}>{n}</li>)}</ul>{!latest.compatible&&<p>此版本需要先通过安装包完成一次升级。</p>}</>}
  </div>}
  <div className="update-actions"><button className="btn secondary" disabled={!!busy||running} onClick={()=>action('check')}><RefreshCw size={16}/>{busy==='check'?'正在检查…':'检查更新'}</button>
   {latest?.available&&<button className="btn primary" disabled={!!busy||running||!info.supported||!latest.compatible||run?.canRecover} onClick={()=>action('install')}><Download size={16}/>{busy==='install'?'正在启动…':'一键升级至 '+latest.version}</button>}
   {run?.canRecover&&<button className="btn primary" disabled={!!busy||running} onClick={()=>action('recover')}>恢复未完成升级</button>}
  </div>
  {run&&<div className="update-status" role="status" aria-live="polite"><strong>{run.message}</strong>
   {run.phase==='downloading'&&<><progress max={100} value={run.percent||0} aria-label="更新包下载进度"/><span>{run.percent||0}%</span></>}
   {run.error&&<p>{run.error}</p>}{run.backup&&<p>{run.backupReady===false?'升级工作目录（数据备份尚未完成）':'本机备份'}：{run.backup}</p>}
   {run.phase==='interrupted'&&!run.canRecover&&<p>可重新检查更新后重试。若服务无法连接，请在服务器使用恢复升级入口。</p>}
  </div>}
  {offline&&<p role="status">{running||sessionStorage.getItem(marker)?'服务正在重启，页面会自动重连，请稍候…':'暂时无法连接工作台，正在自动重试…'}</p>}
  {(error||info?.checkError)&&<p role="alert">{error||info.checkError}</p>}
  <p className="update-footnote"><ShieldCheck size={14}/>仅安装签名验证通过的官方更新。失败会尝试自动恢复旧版。{info?.checkedAt&&' 最近检查：'+new Date(info.checkedAt).toLocaleString('zh-CN')}</p>
 </section>;
}
