import React,{useState,useRef,useEffect} from 'react';
import {FileText,Link,Upload,LoaderCircle,ArrowRight} from 'lucide-react';
import {api,post} from './api';
import {resumeUpload} from './resumable';
import {DocumentReader} from './DocumentReader';
import {carry} from './context';
import {TaskProgress,useJob} from './tasks/TaskProgress';
import {uid} from './compat';
export function InputForm({go}:any){
 const [mode,setMode]=useState('text'),[title,setTitle]=useState(''),[text,setText]=useState(''),[documentJson,setDocumentJson]=useState<any>(null),[url,setUrl]=useState(''),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[percent,setPercent]=useState<number|null>(null),[note,setNote]=useState<any>(null);
 const request=useRef({signature:'',key:uid()});
 const [draftReady,setDraftReady]=useState(false),[draftStatus,setDraftStatus]=useState('');const currentInput=useRef(''),savedInput=useRef('');
 currentInput.current=JSON.stringify({mode,title,text,documentJson,url});
 useEffect(()=>{let live=true;const initial=currentInput.current;
  api('/workspace/preferences/input-draft').then(r=>{if(!live||currentInput.current!==initial)return;const v=r.value;if(v){setMode(v.mode==='url'?'url':'text');setTitle(v.title||'');setText(v.text||'');setDocumentJson(v.documentJson||null);setUrl(v.url||'');setDraftStatus('已恢复上次未完成的输入');}}).catch(e=>live&&setMessage('暂时无法恢复草稿：'+e.message)).finally(()=>live&&setDraftReady(true));return()=>{live=false;};
 },[]);
 useEffect(()=>{if(!draftReady||mode==='file'||currentInput.current===savedInput.current)return;const t=setTimeout(()=>{if(currentInput.current===savedInput.current)return;return api('/workspace/preferences/input-draft',{method:'PUT',body:JSON.stringify({value:{mode,title,text,documentJson,url}})}).then(()=>setDraftStatus('输入已自动保存')).catch(e=>setMessage('草稿暂未保存：'+e.message));},650);return()=>clearTimeout(t);},[draftReady,mode,title,text,documentJson,url]);
 async function clearDraft(){savedInput.current=currentInput.current;await api('/workspace/preferences/input-draft',{method:'PUT',body:JSON.stringify({value:null})});setDraftStatus('');}

 const jid=location.hash.split('?')[0].split('/')[1],{job,error}=useJob(jid);
 useEffect(()=>{if(job?.sourceInput?.url){setMode('url');setUrl(job.sourceInput.url);setTitle(job.sourceInput.title||'');}},[job?.id]);
 async function submit(e:any){e.preventDefault();setBusy(true);setMessage('');setNote(null);setPercent(null);try{
  if(mode==='text'){const n=await post('/notes',{title:title||text.replace(/[#*]/g,'').slice(0,60),body:text,documentJson});setNote(n);await clearDraft();setMessage('已保存到知识库 · 仅自己可见');}
  else if(mode==='url'){const body={url,title:title||undefined,scope:{domain:'general',region:'不限地区',district:'',stage:'综合',year:new Date().getFullYear(),audience:'相关读者'}};const signature=JSON.stringify(body);if(signature!==request.current.signature)request.current={signature,key:uid()};const j=await post('/imports',body,request.current.key);await clearDraft();go('input/'+j.id);}
  else{if(!file)throw new Error('请选择文件');const a=await resumeUpload(file,n=>setPercent(n));const j=await post('/media',{assetId:a.id,title:title||file.name,action:a.kind==='audio'?'asr':a.kind==='image'?'vision':'document',prompt:'忠实提取原文、图表与截图信息，保留页码与不确定处，不要根据文件名补写内容。'});go('media/'+j.id);}
 }catch(e:any){setMessage(e.message);}finally{setBusy(false);setPercent(null);}}
 async function saveResult(){setBusy(true);try{const n=await post('/notes/from-snapshot',{snapshotId:job.result.id});setNote(n);setMessage('已保存到知识库');}catch(e:any){setMessage(e.message);}finally{setBusy(false);}}
 return <>
 <form className="panel pipeline-form" onSubmit={submit} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f&&!busy){setFile(f);setMode('file');}}}>
  <div className="input-methods" role="group" aria-label="导入方式">{[['text','粘贴或编写文字',FileText],['url','读取网址',Link],['file','上传文件',Upload]].map(([v,l,Icon]:any)=><button type="button" className={'btn '+(mode===v?'':'secondary')} key={v} onClick={()=>setMode(v)} disabled={busy} aria-pressed={mode===v}><Icon size={17}/>{l}</button>)}</div>
  <label className="field">资料标题（留空可自动填写）<input value={title} maxLength={180} onChange={e=>setTitle(e.target.value)}/></label>
  {mode==='text'?<DocumentReader label="资料正文" text={text} documentJson={documentJson} onChange={(v:string,j:any)=>{setText(v);setDocumentJson(j);}} maxLength={100000}/>:mode==='url'?<label className="field">公开文章网址<input type="url" required value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://…"/><small>读取成功后保存到「原始资料」，团队可见。需要登录或验证的网页可改用粘贴正文或上传 PDF。</small></label>:<label className="field file-drop">拖文件到这里，或选择文件<input type="file" onChange={e=>setFile(e.target.files?.[0]||null)}/>{file&&<strong>{file.name} · {(file.size/1024/1024).toFixed(1)} MB</strong>}<small>文档、PDF、图片、录音。PDF 自动拆分，识别后可校对并保存到自己的知识库。</small></label>}
  <div className="button-row"><button className="btn" disabled={busy||['queued','running'].includes(job?.state)||(mode==='text'&&!text.trim())||(mode==='file'&&!file)}>{busy?<LoaderCircle size={16} className="spin"/>:<ArrowRight size={16}/>} {busy?'正在提交…':mode==='text'?'保存到知识库':'开始读取'}</button></div>
  {percent!==null&&<div role="status"><progress max={100} value={percent}/>上传 {percent}% · 重新选择同一文件可续传</div>}
  {draftStatus&&!message&&<small role="status">{draftStatus}</small>}
  {(message||error)&&<p role="status">{message||error}</p>}
 </form>
 {job&&<section className="panel lower pipeline-form"><TaskProgress job={job}/>{job.state==='succeeded'&&job.result?.id&&<><div className="notice success">已保存到「原始资料」 · {job.result.title}</div><div className="button-row"><button className="btn" onClick={()=>go('snapshot/'+job.result.id)}>打开原始资料</button><button className="btn secondary" disabled={busy} onClick={saveResult}>整理到知识库</button><button className="btn secondary" onClick={()=>carry(go,'explore',[{kind:'snapshot',id:job.result.id}],'explore')}>用这份资料创作</button></div><details><summary>在此查看读取内容</summary><DocumentReader label="读取内容" text={job.result.body||''}/></details></>}
 {['failed','partial','interrupted'].includes(job.state)&&<div className="notice"><p>原输入已保留。网页如要求登录或验证，可打开原网页后粘贴正文，或上传 PDF / 截图识别。</p><div className="button-row"><button type="button" className="btn secondary" onClick={()=>setMode('text')}>改用粘贴正文</button><button type="button" className="btn secondary" onClick={()=>setMode('file')}>上传文件识别</button>{/^https?:\/\//.test(url)&&<a href={url} target="_blank" rel="noreferrer">打开原网页</a>}</div></div>}
 </section>}
 {note&&<section className="panel lower pipeline-form"><h2>{note.title}</h2><div className="button-row"><button className="btn" onClick={()=>go('notes/'+note.id)}>打开知识库内容</button><button className="btn secondary" onClick={()=>carry(go,'explore',[{kind:'note',id:note.id}],'explore')}>带入 AI 对话</button><button className="btn secondary" onClick={()=>carry(go,'deliver',[{kind:'note',id:note.id}])}>开始创作</button></div></section>}
 </>;
}
