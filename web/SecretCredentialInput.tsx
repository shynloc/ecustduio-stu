import React,{useRef,useState} from 'react';
import {post} from './api';
export function SecretCredentialInput({value,onChange,disabled,storage,act,onBusyChange}:any){
 const active=useRef(false);const [status,setStatus]=useState<{state:string;message:string}|null>(null);
 async function perform(check=false){
  if(active.current||disabled||(!check&&!value.trim()))return;
  active.current=true;onBusyChange(true);
  setStatus({state:'waiting',message:check?'正在检查本机凭据存储…使用临时测试内容，不调用 DeepSeek。':storage==='macOS Keychain'?'正在保存到 Mac 钥匙串…如系统出现授权提示，请在这台 Mac 上确认。':'正在加密保存密钥…'});
  try{
   await act(async()=>{
    try{
     const result=await post(check?'/secrets/diagnose':'/secrets',check?{}:{name:'deepseek',value:value.trim()});
     if(check?!result.ok:!result.configured)throw new Error('凭据存储未确认成功，请运行本机凭据存储检查。');
     if(!check)onChange('');
     setStatus({state:'success',message:check?result.message:'密钥已保存并完成读取校验。接下来允许 DeepSeek 调用，再保存并测试连接。'});
     return result;
    }catch(e:any){setStatus({state:'error',message:(check?'本机检查未通过：':'保存未完成：')+e.message});throw e;}
   },'');
  }finally{active.current=false;onBusyChange(false);}
 }
 return <div className="field" aria-label="DeepSeek 凭据设置">
  <label htmlFor="deepseek-api-key">DeepSeek API Key</label>
  <div className="input-action">
   <input id="deepseek-api-key" type="password" aria-label="DeepSeek API Key" autoComplete="new-password" disabled={disabled} value={value} onChange={e=>{onChange(e.target.value);setStatus(null);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void perform();}}} placeholder="粘贴密钥，仅保存到本机加密配置"/>
   <button type="button" className="btn secondary small" disabled={disabled||!value.trim()} onClick={()=>void perform()}>保存密钥</button>
  </div>
  {status&&<p role={status.state==='error'?'alert':'status'} aria-live="polite" className={status.state==='error'?'error-banner':'notice'}>{status.message}</p>}
  <button type="button" className="text-link" disabled={disabled} onClick={()=>void perform(true)}>检查本机凭据存储</button>
  {storage==='macOS Keychain'&&<small className="help">在运行工作台的 Mac 上登录原用户，保持“登录”钥匙串解锁。授权失败会在这里显示原因；无需把 API Key 发给任何人。</small>}
 </div>;
}
