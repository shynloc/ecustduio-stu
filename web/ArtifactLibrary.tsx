import React,{useEffect,useRef,useState} from 'react';
import {Download,Eye,BookOpen,ArrowUpRight,X} from 'lucide-react';
import {CollectionBrowser} from './collections/CollectionBrowser';
import {OfficePages} from './OfficePages';
import {post} from './api';
import {Answer} from './Answer';
import {carry} from './context';
import {EditorIconButton} from './EditorIconButton';
export function ArtifactLibrary({go,data,projectId="",embedded=false}:any){
 const [preview,setPreview]=useState<any>(null),[error,setError]=useState('');
 function open(a:any){setPreview(a);}
 function source(a:any){const m=a.manifest||{};if(m.conversationId)go('explore/'+m.conversationId+'?file='+a.id);else if(m.visualId)go('visual/'+m.visualId);else if(a.projectId)go('project/'+a.projectId);else open(a);}
 return <>{!embedded&&<div className="page-heading"><div><h1>{data?.user?.role==="sales"?"可用成果":"成果库"}</h1><p>所有完成的作品都在这里。预览、分类、下载，或回到来源继续修改。</p></div>{data?.user?.role!=="sales"&&<button className="btn" onClick={()=>go('library')}>制作新作品</button>}</div>}{error&&<p role="alert">{error}</p>}
 <CollectionBrowser projects={data?.projects||[]} projectId={projectId} kind="artifacts" go={go} onOpen={(_id:string,a:any)=>open(a)} renderPreview={(a:any)=>a.format==='gif'?<img className="artifact-thumb" src={'/api/assets/'+a.asset_id} loading="lazy" alt={a.title}/>:null} renderActions={(a:any,canManage:boolean)=><><a className="text-link" href={'/api/artifacts/'+a.id+'/download'}><Download size={15}/>下载</a><button className="text-link" onClick={()=>open(a)}><Eye size={15}/>预览</button>{canManage&&<button className="text-link" onClick={()=>source(a)}><ArrowUpRight size={15}/>来源与修改</button>}{canManage&&<button className="text-link" onClick={async()=>{try{const n=await post('/collections/artifacts/'+a.id+'/note');if(n.requiresRecognition)await carry(go,'media',[{kind:'asset',id:n.assetId}],'input');else go('notes/'+n.id);}catch(e:any){setError(e.message);}}}><BookOpen size={15}/>整理为知识</button>}</>}/>
 {preview&&(['docx','pptx','pdf'].includes(preview.format)?<OfficePages collection file={preview} onClose={()=>setPreview(null)}/>:<ArtifactPreview file={preview} onClose={()=>setPreview(null)}/>)}</>;
}
function ArtifactPreview({file,onClose}:any){
 const ref=useRef<HTMLDialogElement>(null),[text,setText]=useState(''),[issue,setIssue]=useState('');
 useEffect(()=>{let live=true;if(['md','txt','json','csv'].includes(file.format))fetch('/api/assets/'+file.asset_id).then(async r=>{if(!r.ok)throw new Error('预览暂不可用');const t=await r.text();if(live)setText(t.slice(0,200000));}).catch(e=>live&&setIssue(e.message));return()=>{live=false;};},[file.id]);
 useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close();},[]);
 const src='/api/assets/'+file.asset_id;
 return <dialog ref={ref} className="artifact-viewer" aria-label="成果预览" onCancel={e=>{e.preventDefault();onClose();}}><header><strong>{file.title}</strong><EditorIconButton label="关闭预览" icon={X} onClick={onClose}/></header>
 {file.format==='html'?<iframe title="网页作品预览" sandbox="allow-scripts" src={'/api/collections/artifacts/'+file.id+'/preview'}/>:['mp4','webm'].includes(file.format)?<video src={src} controls playsInline/>:['mp3','wav','m4a','ogg'].includes(file.format)?<audio src={src} controls/>:['gif','png','jpg','jpeg','webp'].includes(file.format)?<img src={src} alt={file.title}/>:['md','txt'].includes(file.format)?<Answer text={text} sources={[]}/>:['json','csv'].includes(file.format)?<pre>{text}</pre>:<p>此格式请下载后使用相应软件打开。</p>}
 {issue&&<p role="alert">{issue}</p>}<footer><a className="btn secondary" href={'/api/artifacts/'+file.id+'/download'}>下载原文件</a><button className="btn secondary" onClick={onClose}>关闭</button></footer></dialog>;
}
