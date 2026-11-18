import {verify,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,renameSync,mkdirSync,existsSync} from 'node:fs';
import {dirname,resolve,relative,isAbsolute,sep} from 'node:path';
export const UPDATE_FEED='https://dshdisk.acks.com.cn/ecustudio/releases/stable.json';
export const UPDATE_PUBLIC_KEY='-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEARZbgI1ZkkpfWf2Q0c6tVf0t+0VKrKzJ17kRdJNouabY=\n-----END PUBLIC KEY-----\n';
export const ACTIVE_UPDATE_STATES=['queued','downloading','verifying','extracting','preparing','backing-up','installing','restarting','recovering'];
export const sha256=b=>createHash('sha256').update(b).digest('hex');
export const readJson=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
export function atomicJson(path,value){mkdirSync(dirname(path),{recursive:true,mode:0o700});const temp=path+'.'+process.pid+'.tmp';writeFileSync(temp,JSON.stringify(value,null,2),{mode:0o600});renameSync(temp,path);}
export function processAlive(pid){if(!Number.isSafeInteger(pid)||pid<1)return false;try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}}
export function compareVersions(a,b){if(!/^\d+\.\d+\.\d+$/.test(a)||!/^\d+\.\d+\.\d+$/.test(b))throw new Error('版本格式无效');const x=a.split('.').map(Number),y=b.split('.').map(Number);return x[0]-y[0]||x[1]-y[1]||x[2]-y[2];}
export function trustedDownloadUrl(value){const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='dshdisk.acks.com.cn'||u.port||u.username||u.password||u.search||u.hash||!u.pathname.startsWith('/ecustudio/'))throw new Error('更新地址不在官方发布站点');return u.href;}
export function verifyRelease(envelope,now=Date.now(),publicKey=UPDATE_PUBLIC_KEY){
 if(!envelope||typeof envelope.payload!=='string'||Buffer.byteLength(envelope.payload)>65536||typeof envelope.signature!=='string')throw new Error('更新列表格式无效');
 const signature=Buffer.from(envelope.signature,'base64');if(signature.length!==64||!verify(null,Buffer.from(envelope.payload),publicKey,signature))throw new Error('更新列表签名校验失败');
 const p=JSON.parse(envelope.payload);if(p.product!=='ecustudio'||p.channel!=='stable'||!/^\d+\.\d+\.\d+$/.test(p.version)||!/^\d+\.\d+\.\d+$/.test(p.minimumVersion))throw new Error('更新列表与工作台不匹配');
 if(!Number.isFinite(Date.parse(p.expiresAt))||Date.parse(p.expiresAt)<=now||!Number.isFinite(Date.parse(p.publishedAt))||Date.parse(p.publishedAt)>now+86400000)throw new Error('更新列表已过期或发布日期无效，请稍后检查');
 if(!Array.isArray(p.notes)||p.notes.length>20||p.notes.some(n=>typeof n!=='string'||n.length>1000))throw new Error('更新说明格式无效');
 for(const name of ['windows-x64','macos']){const f=p.packages?.[name];if(!f||!/^[a-f0-9]{64}$/.test(f.sha256)||!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>64*1024*1024)throw new Error('更新包校验信息无效');trustedDownloadUrl(f.url);if(!new URL(f.url).pathname.endsWith('.zip'))throw new Error('更新文件不是ZIP');}
 return p;
}
export const platformKey=(platform=process.platform,arch=process.arch)=>platform==='win32'&&arch==='x64'?'windows-x64':platform==='darwin'&&['x64','arm64'].includes(arch)?'macos':null;
export async function fetchRelease(transport=fetch){const r=await transport(UPDATE_FEED+'?t='+Date.now(),{redirect:'error',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'Mozilla/5.0 EcuStudio-Updater','Cache-Control':'no-cache'}});if(!r.ok)throw new Error('暂时无法获取更新列表（HTTP '+r.status+'）');const bytes=await boundedBody(r,131072);const envelope=JSON.parse(bytes.toString('utf8'));return {envelope,release:verifyRelease(envelope)};}
export async function boundedBody(response,limit,onProgress=()=>{}){if(Number(response.headers.get('content-length')||0)>limit)throw new Error('下载内容超过大小限制');let size=0;const chunks=[];if(!response.body)throw new Error('下载内容为空');for await(const c of response.body){size+=c.length;if(size>limit)throw new Error('下载内容超过大小限制');chunks.push(c);onProgress(size);}if(!size)throw new Error('下载内容为空');return Buffer.concat(chunks);}
export async function downloadRelease(file,transport=fetch,onProgress=()=>{}){const r=await transport(trustedDownloadUrl(file.url),{redirect:'error',signal:AbortSignal.timeout(240000),headers:{'User-Agent':'Mozilla/5.0 EcuStudio-Updater'}});if(!r.ok)throw new Error('下载更新包失败（HTTP '+r.status+'）');const b=await boundedBody(r,file.bytes,onProgress);if(b.length!==file.bytes||sha256(b)!==file.sha256)throw new Error('更新包校验失败，未替换原程序');return b;}
export function extractRelease(buffer,destination,Zip){
 if(existsSync(destination))throw new Error('更新解压目录已存在');
 const zip=new Zip(buffer),entries=zip.getEntries();if(entries.length>10000)throw new Error('更新包文件过多');let total=0;const names=new Set();
 for(const e of entries){const name=e.entryName.replace(/\/$/,'');if(!name||name.includes('\\')||name.includes(':')||name.includes('\0')||isAbsolute(name)||name.split('/').some(p=>p==='.'||p==='..'||!p)||names.has(name.toLowerCase()))throw new Error('更新包包含不安全或重复路径');names.add(name.toLowerCase());
  if(((e.attr>>>16)&0o170000)===0o120000)throw new Error('更新包不允许符号链接');total+=e.header.size;if(total>256*1024*1024||e.header.size>64*1024*1024)throw new Error('更新包展开后过大');
 }
 mkdirSync(destination,{recursive:true,mode:0o700});
 for(const e of entries){const p=resolve(destination,e.entryName),r=relative(destination,p);if(isAbsolute(r)||r==='..'||r.startsWith('..'+sep))throw new Error('更新路径越界');if(e.isDirectory){mkdirSync(p,{recursive:true});continue;}mkdirSync(dirname(p),{recursive:true});const b=e.getData();if(b.length!==e.header.size)throw new Error('更新文件长度不匹配');writeFileSync(p,b,{mode:/\.(command|sh)$/.test(e.entryName)?0o755:0o644});}
 return readJson(resolve(destination,'manifest.json'));
}
