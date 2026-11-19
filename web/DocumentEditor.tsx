import React,{useEffect,useRef,useState} from 'react';
import {Bold,Heading1,Heading2,Heading3,ImagePlus,Italic,List,ListOrdered,Pilcrow,Quote,Redo2,Table,Undo2,Underline,Strikethrough,Highlighter,Link,Unlink,Columns3,Rows3,Trash2,Check,X,Sparkles,Code,Search} from 'lucide-react';
import {useEditor,EditorContent} from '@tiptap/react';
import {Markdown} from '@tiptap/markdown';
import {documentExtensions} from '../shared/document';
import {visualPreservedBlock,visualPreservedInline} from './documents/PreservedContent';
import {EditorIconButton} from './EditorIconButton';
import {upload} from './api';
import {EditorAssistant} from './documents/EditorAssistant';

export function DocumentEditor({text='',documentJson,onChange,label='正文',editable=true,extraExtensions=[],extraToolbar}:any){
 const last=useRef(text),callback=useRef(onChange),imageInput=useRef<HTMLInputElement>(null),editorRef=useRef<any>(null);
 const [issue,setIssue]=useState(''),[link,setLink]=useState<string|null>(null),[assist,setAssist]=useState(false),[find,setFind]=useState<string|null>(null);
 callback.current=onChange;
 async function insertImage(file:File){try{setIssue('正在添加图片…');const a=await upload(file,'/media/uploads');editorRef.current?.chain().focus().setImage({src:'/api/assets/'+a.id,alt:file.name}).run();setIssue('');}catch(e:any){setIssue(e.message);}}
 const editor=useEditor({extensions:[...documentExtensions().filter(e=>!['preservedBlock','preservedInline'].includes(e.name)),visualPreservedBlock,visualPreservedInline,...extraExtensions,Markdown],content:documentJson||text,contentType:documentJson?'json':'markdown',editable,immediatelyRender:false,shouldRerenderOnTransaction:true,
  editorProps:{attributes:{role:'textbox','aria-label':label,'aria-multiline':'true'},handlePaste:(_view,event)=>{const file=event.clipboardData?.files?.[0];if(file){void insertImage(file);return true;}return false;},handleDrop:(_view,event)=>{const file=event.dataTransfer?.files?.[0];if(file&&file.type.startsWith('image/')){void insertImage(file);return true;}return false;}},
  onUpdate:({editor})=>{const value=editor.getMarkdown();last.current=value;callback.current?.(value,editor.getJSON());},
 },[]);
 editorRef.current=editor;
 useEffect(()=>{editor?.setEditable(editable,false);},[editable,editor]);
 useEffect(()=>{if(editor&&text!==last.current){editor.commands.setContent(documentJson||text,{contentType:documentJson?'json':'markdown',emitUpdate:false});last.current=text;}},[text,documentJson,editor]);
 if(!editor)return <p role="status">正在准备编辑器…</p>;
 const button=(name:string,Icon:any,run:()=>void,active=false,disabled=false)=><EditorIconButton key={name} label={name} icon={Icon} onClick={run} aria-pressed={active} disabled={disabled}/>;
 return <div className="rich-document">
  {editable&&<div className="rich-toolbar" role="toolbar" aria-label="正文格式">
   <details className="editor-heading-menu"><summary aria-label="标题层级" title="标题层级"><Heading2 size={18}/></summary><div>{button('正文',Pilcrow,()=>editor.chain().focus().setParagraph().run())}{[1,2,3].map((n,i)=>button(n+'级标题',[Heading1,Heading2,Heading3][i],()=>editor.chain().focus().toggleHeading({level:n as 1|2|3}).run(),editor.isActive('heading',{level:n})))}</div></details>
   {button('加粗 · Ctrl+B',Bold,()=>editor.chain().focus().toggleBold().run(),editor.isActive('bold'))}
   {button('斜体 · Ctrl+I',Italic,()=>editor.chain().focus().toggleItalic().run(),editor.isActive('italic'))}
   {button('下划线 · Ctrl+U',Underline,()=>editor.chain().focus().toggleUnderline().run(),editor.isActive('underline'))}
   {button('删除线',Strikethrough,()=>editor.chain().focus().toggleStrike().run(),editor.isActive('strike'))}
   {button('高亮',Highlighter,()=>editor.chain().focus().toggleHighlight().run(),editor.isActive('highlight'))}
   {button('添加链接',Link,()=>setLink(editor.getAttributes('link').href||''),editor.isActive('link'))}
   {editor.isActive('link')&&button('移除链接',Unlink,()=>editor.chain().focus().unsetLink().run())}
   {button('项目列表',List,()=>editor.chain().focus().toggleBulletList().run(),editor.isActive('bulletList'))}
   {button('编号列表',ListOrdered,()=>editor.chain().focus().toggleOrderedList().run(),editor.isActive('orderedList'))}
   {button('引用',Quote,()=>editor.chain().focus().toggleBlockquote().run(),editor.isActive('blockquote'))}
   {button('代码块',Code,()=>editor.chain().focus().toggleCodeBlock().run(),editor.isActive('codeBlock'))}
   {button('插入表格',Table,()=>editor.chain().focus().insertTable({rows:3,cols:3,withHeaderRow:true}).run())}
   {editor.isActive('table')&&<>{button('增加一行',Rows3,()=>editor.chain().focus().addRowAfter().run())}{button('增加一列',Columns3,()=>editor.chain().focus().addColumnAfter().run())}{button('删除当前行',Trash2,()=>editor.chain().focus().deleteRow().run())}{button('删除当前列',X,()=>editor.chain().focus().deleteColumn().run())}</>}
   {button('插入图片',ImagePlus,()=>imageInput.current?.click())}
   {button('查找正文',Search,()=>setFind(find===null?'':null))}
   {button('AI 修改选中文字',Sparkles,()=>setAssist(true),assist,editor.state.selection.empty)}
   {extraToolbar?.(editor)}
   {button('撤销 · Ctrl+Z',Undo2,()=>editor.chain().focus().undo().run(),false,!editor.can().undo())}
   {button('重做 · Ctrl+Shift+Z',Redo2,()=>editor.chain().focus().redo().run(),false,!editor.can().redo())}
  </div>}
  {editable&&editor.isActive('image')&&<div className="editor-image-controls"><label>图片宽度<input aria-label="图片宽度" type="range" min={80} max={1200} step={20} value={editor.getAttributes('image').width||600} onChange={e=>editor.chain().updateAttributes('image',{width:+e.target.value}).run()}/></label><label>图片说明<input aria-label="图片说明" value={editor.getAttributes('image').caption||''} maxLength={500} onChange={e=>editor.chain().updateAttributes('image',{caption:e.target.value}).run()}/></label><EditorIconButton icon={Trash2} label="删除图片" onClick={()=>editor.chain().focus().deleteSelection().run()}/></div>}
  {link!==null&&<div className="editor-inline-form"><input aria-label="链接网址" type="url" value={link} placeholder="https://…" onChange={e=>setLink(e.target.value)}/><EditorIconButton icon={Check} label="应用链接" onClick={()=>{if(!/^https?:\/\//i.test(link)){setIssue('请输入 http 或 https 网址');return;}editor.chain().focus().extendMarkRange('link').setLink({href:link}).run();setLink(null);setIssue('');}}/><EditorIconButton icon={X} label="取消链接" onClick={()=>setLink(null)}/></div>}
  {find!==null&&<div className="editor-inline-form"><input aria-label="查找正文" value={find} onChange={e=>setFind(e.target.value)} placeholder="输入要查找的文字"/><EditorIconButton icon={Search} label="查找下一处" onClick={()=>{if(!find)return;let found=-1;editor.state.doc.descendants((node,pos)=>{if(found<0&&node.isText){const at=node.text?.indexOf(find,pos<=editor.state.selection.to?Math.max(0,editor.state.selection.to-pos):0)??-1;if(at>=0)found=pos+at;}});if(found<0)editor.state.doc.descendants((node,pos)=>{if(found<0&&node.isText){const at=node.text?.indexOf(find)??-1;if(at>=0)found=pos+at;}});if(found>=0)editor.chain().focus().setTextSelection({from:found,to:found+find.length}).scrollIntoView().run();else setIssue('没有找到这段文字');}}/><EditorIconButton icon={X} label="关闭查找" onClick={()=>setFind(null)}/></div>}
  {editable&&<input hidden ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="插入正文图片" onChange={e=>{const f=e.target.files?.[0];if(f)void insertImage(f);e.target.value='';}}/>}
  {issue&&<p role="status">{issue}</p>}
  {assist&&<EditorAssistant editor={editor} onClose={()=>setAssist(false)}/>}
  <EditorContent editor={editor}/>
 </div>;
}
