// Run locally by the publisher. The signing key must stay outside distributable files.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {basename} from 'node:path';
import {sign} from 'node:crypto';
import {sha256,verifyRelease} from './update-protocol.mjs';
const [windows,macos,key,out]=process.argv.slice(2);
if(!out)throw new Error('Usage: node scripts/sign-update-feed.mjs Windows.zip Mac.zip PRIVATE.pem output.json');
const version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).version;
const file=path=>{const b=readFileSync(path);return {url:'https://dshdisk.acks.com.cn/ecustudio/'+version+'/'+basename(path),bytes:b.length,sha256:sha256(b)};};
const notesPath=new URL('../docs/releases/'+version+'.json',import.meta.url);
if(!existsSync(notesPath))throw new Error('缺少此版本发布说明，停止签名');
const notes=JSON.parse(readFileSync(notesPath,'utf8'));
const payload=JSON.stringify({product:'ecustudio',channel:'stable',version,minimumVersion:'0.3.0',publishedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+365*86400000).toISOString(),notes,packages:{'windows-x64':file(windows),macos:file(macos)}});
const envelope={payload,signature:sign(null,Buffer.from(payload),readFileSync(key)).toString('base64')};verifyRelease(envelope);writeFileSync(out,JSON.stringify(envelope,null,2));console.log(JSON.stringify({version,output:out}));
