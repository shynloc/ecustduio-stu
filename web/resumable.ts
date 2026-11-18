import {api,post,put} from './api';
import {digest256} from '../shared/digest';
export async function resumeUpload(file:File,onProgress?:(n:number)=>void){
 const sample=new Uint8Array(await new Blob([file.slice(0,262144),file.slice(Math.max(0,file.size-262144)),`${file.name}:${file.size}:${file.lastModified}`]).arrayBuffer());
 const session=await post('/upload-sessions',{name:file.name.slice(0,180),size:file.size,fingerprint:digest256(sample)});
 let offset=session.offset;
 while(offset<file.size){const bytes=new Uint8Array(await file.slice(offset,offset+262144).arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));const payload={offset,chunk:btoa(raw),hash:digest256(bytes)};let response:any;for(let attempt=0;attempt<3;attempt++){try{response=await put('/upload-sessions/'+session.id,payload);break;}catch(e:any){if(e.status&&e.status<500&&e.status!==409||attempt===2)throw e;const state=await api('/upload-sessions/'+session.id);if(state.offset===offset+bytes.length){response=state;break;}}}offset=response.offset;onProgress?.(Math.round(offset/file.size*100));}
 return post('/upload-sessions/'+session.id+'/complete');
}
