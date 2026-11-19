// Verify the exact signed packages, including every manifest entry and old clients.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import AdmZip from 'adm-zip';
import {verifyRelease,sha256,extractRelease,downloadRelease} from './update-protocol.mjs';
const out=resolve(process.argv[2]),remote=process.argv.includes('--public');
const version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
const envelope=JSON.parse(readFileSync(join(out,'stable.json'),'utf8')),release=verifyRelease(envelope);
assert.equal(release.version,version);
const oldClients=[];
for(const [old,path] of [['0.5.0','test-results/v070-client-0.5.0.mjs'],['0.11.0',process.env.ECUSTUDIO_OLD_INSTALL?join(process.env.ECUSTUDIO_OLD_INSTALL,'app/scripts/update-protocol.mjs'):'']]){
 if(!path||!existsSync(path))continue;
 const client=await import(pathToFileURL(resolve(path)).href);client.verifyRelease(envelope);oldClients.push(old);
}
const root=mkdtempSync(resolve('test-results/release-packages-')),records=[];
for(const [platform,file] of Object.entries(release.packages)){
 const local=join(out,platform==='macos'?'Mac':'Windows',new URL(file.url).pathname.split('/').at(-1));
 const bytes=remote?await downloadRelease(file):readFileSync(local);
 assert.equal(bytes.length,file.bytes);assert.equal(sha256(bytes),file.sha256);
 const destination=join(root,platform),manifest=extractRelease(bytes,destination,AdmZip);
 assert.equal(manifest.version,version);
 for(const f of manifest.files){
  const raw=readFileSync(join(destination,f.path));assert.equal(raw.length,f.bytes,f.path);assert.equal(sha256(raw),f.sha256,f.path);
  assert.ok(!/(^|\/)(data|node_modules|test-results|__pycache__|\.artifacts|\.git)(\/|$)|\.pyc$|\.sqlite(?:-|$)|\.dpapi$|private\.pem$|(^|\/)\.env$/.test(f.path),f.path);
 }
 for(const path of ['app/dist/ecustudio-mark.svg','app/dist/wechat-themes/LICENSE.txt','app/vendor/acks-markdown/LICENSE','app/dist-server/server/wechat-copy.js','app/dist-server/server/wechat-theme-render.js','app/dist-server/server/wechat-theme-data.js','app/scripts/update-protocol.mjs','app/scripts/update-runner.mjs','app/scripts/upgrade.mjs',version+'发布与升级说明.md',version+'本地Agent安装升级提示词.md','docs/'+version+'使用指南.html'])assert.ok(existsSync(join(destination,path)),path);
 const catalog=await import(pathToFileURL(join(destination,'app/dist-server/shared/wechat-themes.js')).href);
 assert.equal(catalog.wechatThemeIds.length,46);assert.equal(Object.keys(catalog.wechatRecipes).length,9);
 for(const id of catalog.wechatThemeIds)assert.ok(existsSync(join(destination,'app/dist/wechat-themes/'+id+'-preview.png')),id);
 assert.equal(JSON.parse(readFileSync(join(destination,'app/package.json'),'utf8')).version,version);
 const start=readFileSync(join(destination,'先读我.html'),'utf8');assert.ok(start.includes(version));assert.ok(start.includes(version+'使用指南'));
 if(platform==='macos'){
  const zip=new AdmZip(bytes);for(const p of ['Install.command','Upgrade.command','Repair-Upgrade.command','Check-Keychain.command','Configure-DeepSeek.command'])assert.ok((zip.getEntry(p).attr>>>16)&0o111,p);
 }
 records.push({platform,...file,files:manifest.files.length,destination,checked:true});
}
const report={ok:true,version,oldClientSignatureCompatible:oldClients,mode:remote?'public-download':'local-files',createdAt:new Date().toISOString(),records};
writeFileSync(join(out,remote?'public-package-verification.json':'local-package-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
