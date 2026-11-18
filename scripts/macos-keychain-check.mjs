// No real API key is read. A disposable Keychain item checks the current context.
import {existsSync,writeFileSync,unlinkSync,mkdirSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createMacKeychainClient} from '../dist-server/server/mac-keychain.js';
if(process.platform!=='darwin')throw new Error('请在安装工作台的 Mac 上运行。');
const root=resolve(process.cwd(),'..'),data=process.env.ECUSTUDIO_DATA_DIR||join(root,'data');
const report={version:JSON.parse(readFileSync(join(root,'app/package.json'),'utf8')).version,checkedAt:new Date().toISOString(),realApiKeyUsed:false};
const probe=join(data,'.keychain-check-'+randomUUID());
try{writeFileSync(probe,'',{flag:'wx',mode:0o600});unlinkSync(probe);report.dataWritable=true;}catch{report.dataWritable=false;}
try{const result=await createMacKeychainClient().diagnose();report.keychain=result;}catch(e){report.keychain={ok:false,code:e.code||'KEYCHAIN_FAILED',message:e.message};}
try{const port=JSON.parse(readFileSync(join(root,'ecustudio.json'),'utf8')).port;const response=await fetch('http://127.0.0.1:'+port+'/',{headers:{accept:'text/html'},signal:AbortSignal.timeout(3000)});report.homepage={status:response.status,contentType:response.headers.get('content-type')};await response.body?.cancel();}catch{report.homepage={reachable:false};}
report.ok=report.dataWritable&&report.keychain.ok;
try{mkdirSync(join(data,'logs'),{recursive:true});writeFileSync(join(data,'logs/keychain-check.json'),JSON.stringify(report,null,2),{mode:0o600});}catch{}
console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1;
