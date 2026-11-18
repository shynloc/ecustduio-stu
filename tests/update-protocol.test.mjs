import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,readFileSync,existsSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import Zip from 'adm-zip';
import {verifyRelease,downloadRelease,extractRelease,sha256,compareVersions,platformKey} from '../scripts/update-protocol.mjs';
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const file={url:'https://dshdisk.acks.com.cn/ecustudio/test/package.zip',bytes:3,sha256:sha256('zip')};
const release={product:'ecustudio',channel:'stable',version:'0.5.0',minimumVersion:'0.3.0',publishedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),notes:['测试'],packages:{'windows-x64':file,macos:file}};
const envelope=(p=release)=>{const payload=JSON.stringify(p);return {payload,signature:sign(null,Buffer.from(payload),privateKey).toString('base64')};};
test('更新列表必须签名有效、未过期且来自固定HTTPS发布站',()=>{
 assert.equal(verifyRelease(envelope(),Date.now(),publicKey).version,'0.5.0');
 const e=envelope();e.payload=e.payload.replace('0.5.0','9.9.9');assert.throws(()=>verifyRelease(e,Date.now(),publicKey),/签名/);
 assert.throws(()=>verifyRelease(envelope(),Date.now()),/签名/);
 assert.throws(()=>verifyRelease(envelope({...release,expiresAt:'2020-01-01'}),Date.now(),publicKey),/过期/);
 for(const url of ['http://dshdisk.acks.com.cn/ecustudio/a.zip','https://evil.test/ecustudio/a.zip','https://dshdisk.acks.com.cn/other/a.zip'])assert.throws(()=>verifyRelease(envelope({...release,packages:{...release.packages,macos:{...file,url}}}),Date.now(),publicKey),/站点/);
});
test('下载长度和摘要不符立即拒绝，重定向与超时策略传给传输层',async()=>{
 const good=await downloadRelease(file,async(url,opts)=>{assert.equal(opts.redirect,'error');assert.ok(opts.signal);return new Response('zip');});assert.equal(good.toString(),'zip');
 await assert.rejects(downloadRelease(file,async()=>new Response('bad')),/校验/);
 await assert.rejects(downloadRelease(file,async()=>new Response('bigger')),/大小/);
 await assert.rejects(downloadRelease(file,async()=>new Response('',{status:503})),/503/);
});
test('只在新缓存目录解压，拒绝穿越、符号链接和重复路径',()=>{
 mkdirSync('test-results',{recursive:true});const base=mkdtempSync(resolve('test-results/zip-safe-'));const zip=new Zip();zip.addFile('manifest.json',Buffer.from('{"version":"0.5.0"}'));zip.addFile('app/file.txt',Buffer.from('retained'));const dest=join(base,'good');assert.equal(extractRelease(zip.toBuffer(),dest,Zip).version,'0.5.0');assert.equal(readFileSync(join(dest,'app/file.txt'),'utf8'),'retained');assert.throws(()=>extractRelease(zip.toBuffer(),dest,Zip),/已存在/);
 let index=0;for(const entries of [[{entryName:'../escape',attr:0,header:{size:1}}],[{entryName:'link',attr:0o120777<<16,header:{size:1}}],[{entryName:'APP/a',attr:0,header:{size:1}},{entryName:'app/a',attr:0,header:{size:1}}]]){const target=join(base,'bad'+index++);assert.throws(()=>extractRelease(Buffer.alloc(0),target,class {getEntries(){return entries;}}));assert.equal(existsSync(target),false);}
});
test('版本按数值比较且识别Windows与两类Mac架构',()=>{assert.ok(compareVersions('0.10.0','0.9.9')>0);assert.ok(compareVersions('0.4.0','0.5.0')<0);assert.equal(platformKey('win32','x64'),'windows-x64');assert.equal(platformKey('darwin','arm64'),'macos');assert.equal(platformKey('darwin','x64'),'macos');assert.equal(platformKey('linux','x64'),null);});
