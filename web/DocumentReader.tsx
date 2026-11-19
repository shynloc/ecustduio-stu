import React,{useState} from 'react';
import {CodeXml,Eye,SquarePen} from 'lucide-react';
import {EditorIconButton} from './EditorIconButton';
import {MarkdownSourceEditor} from './MarkdownSourceEditor';
import {DocumentEditor} from './DocumentEditor';
import {Answer} from './Answer';
export function DocumentReader({text='',onChange,label='正文',sources=[],maxLength=500000,documentJson}:any){
 const [source,setSource]=useState(false),[reading,setReading]=useState(false);
 return <section className="document-reader" aria-label={label}>
  <div className="document-toolbar"><strong>{label}</strong>{onChange&&<div className="editor-mode-buttons" role="group" aria-label="正文编辑模式">
   <EditorIconButton label="直接编辑正文" icon={SquarePen} aria-pressed={!source&&!reading} onClick={()=>{setSource(false);setReading(false);}}/>
   <EditorIconButton label="专注阅读" icon={Eye} aria-pressed={reading} onClick={()=>{setReading(!reading);setSource(false);}}/>
   <EditorIconButton label="高级：Markdown 源码" icon={CodeXml} aria-pressed={source} onClick={()=>{setSource(!source);setReading(false);}}/>
  </div>}</div>
  {!onChange||reading?(documentJson?<DocumentEditor text={text} documentJson={documentJson} editable={false} label={label}/>:<Answer text={text} sources={sources} noteLinks/>):source?<div className="note-md-split"><MarkdownSourceEditor label={label+'源文'} text={text} maxLength={maxLength} onChange={v=>onChange(v,null)}/><section className="note-md-preview" aria-label="Markdown 实时预览"><Answer text={text} sources={sources} noteLinks/></section></div>:<DocumentEditor text={text} documentJson={documentJson} label={label} onChange={(v:string,j:any)=>{if(v.length<=maxLength)onChange(v,j);}}/>}
 </section>;
}
