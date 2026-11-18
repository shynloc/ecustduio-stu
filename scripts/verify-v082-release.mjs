import {readFileSync,writeFileSync,mkdtempSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import {verifyRelease,sha256,extractRelease,downloadRelease} from './update-protocol.mjs';
import {verifyRelease as verify050} from '../test-results/v070-client-0.5.0.mjs';
const out=resolve('D:/EduStudio/deliverables/0.8.2'),remote=process.argv.includes('--public');
const envelope=JSON.parse(readFileSync(join(out,'stable.json'),'utf8'));
const release=verifyRelease(envelope);assert.equal(release.version,'0.8.2');verify050(envelope);
const root=mkdtempSync(resolve('test-results/v082-packages-')),records=[];
for(const [platform,file] of Object.entries(release.packages)){
  const local=join(out,platform==='macos'?'Mac':'Windows',new URL(file.url).pathname.split('/').at(-1));
  const bytes=remote?await downloadRelease(file):readFileSync(local);
  assert.equal(bytes.length,file.bytes);assert.equal(sha256(bytes),file.sha256);
  const destination=join(root,platform),manifest=extractRelease(bytes,destination,AdmZip);
  assert.equal(manifest.version,'0.8.2');
  for(const f of manifest.files){
    const raw=readFileSync(join(destination,f.path));assert.equal(raw.length,f.bytes,f.path);assert.equal(sha256(raw),f.sha256,f.path);
    assert.ok(!/(^|\/)(data|node_modules|test-results|__pycache__)(\/|$)|\.pyc$|\.sqlite(?:-|$)|\.dpapi$|private\.pem$|(^|\/)\.env$/.test(f.path),f.path);
  }
  for(const path of ['app/skills/gif-factory/LICENSE','app/skills/gif-factory/scripts/export_keyframes.py','app/scripts/update-protocol.mjs','app/scripts/update-runner.mjs','app/scripts/upgrade.mjs','app/dist-server/server/visual-export.js','0.8.2发布与升级说明.md','0.8.2本地Agent安装升级提示词.md','docs/0.8.2开发与验证记录.html'])assert.ok(existsSync(join(destination,path)),path);
  assert.match(readFileSync(join(destination,'app/scripts/upgrade.mjs'),'utf8'),/stopMacService/);
  const code=p=>readFileSync(join(destination,'app/dist-server',p),'utf8');
  assert.match(code('server/workflows.js'),/input\.plan\.slideCount/);
  assert.match(code('shared/visual-edit.js'),/normalizeAIScenes/);
  assert.match(code('server/visual-studio.js'),/GIF_MOTION_EMPTY/);
  assert.match(code('server/visual-export.js'),/const files = outputs\.filter/);
  if(platform==='macos'){
    const zip=new AdmZip(bytes);for(const p of ['Install.command','Upgrade.command','Repair-Upgrade.command'])assert.ok((zip.getEntry(p).attr>>>16)&0o111,p);
  }
  records.push({platform,...file,files:manifest.files.length,destination,checked:true});
}
const report={ok:true,version:'0.8.2',old050SignatureCompatible:true,mode:remote?'public-download':'local-files',createdAt:new Date().toISOString(),records};
writeFileSync(join(out,remote?'public-package-verification.json':'local-package-verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
