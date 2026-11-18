import {api,post} from './api';
export const contextId=()=>new URLSearchParams(location.hash.split('?')[1]||'').get('context');
export async function readContext(){const cid=contextId();return cid?api('/contexts/'+encodeURIComponent(cid)):null;}
export async function carry(go:any,route:string,refs:any[],purpose='production'){
 try{const c=await post('/contexts',{refs,purpose,returnTo:location.hash.slice(1).split('?')[0]||'input'});go(route+'?context='+c.id);}catch(e:any){window.dispatchEvent(new CustomEvent('ecu-context-error',{detail:e.message}));}
}
