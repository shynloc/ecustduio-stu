import {readFileSync,writeFileSync,mkdtempSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import {verifyRelease,sha256,extractRelease,downloadRelease} from './update-protocol.mjs';
const out=resolve('D:/EduStudio/deliverables/0.8.0'),remote=process.argv.includes('--public');
const release=verifyRelease(JSON.parse(readFileSync(join(out,'stable.json'),'utf8')));
assert.equal(release.version,'0.8.0');
const root=mkdtempSync(resolve('test-results/v080-packages-')),records=[];
for(const [platform,file] of Object.entries(release.packages)){
  const local=join(out,platform==='macos'?'Mac':'Windows',new URL(file.url).pathname.split('/').at(-1));
  const bytes=remote?await downloadRelease(file):readFileSync(local);
  assert.equal(bytes.length,file.bytes);assert.equal(sha256(bytes),file.sha256);
  const destination=join(root,platform),manifest=extractRelease(bytes,destination,AdmZip);
  assert.equal(manifest.version,'0.8.0');
  for(const f of manifest.files){
    const raw=readFileSync(join(destination,f.path));assert.equal(raw.length,f.bytes,f.path);assert.equal(sha256(raw),f.sha256,f.path);
    assert.ok(!/(^|\/)(data|node_modules|test-results|__pycache__)(\/|$)|\.pyc$|\.sqlite(?:-|$)|\.dpapi$|private\.pem$|(^|\/)\.env$/.test(f.path),f.path);
  }
  for(const path of ['app/skills/gif-factory/LICENSE','app/skills/gif-factory/provenance.json','app/skills/gif-factory/scripts/export_keyframes.py','app/scripts/gif-factory-export.py','app/scripts/gif-factory-decode.py','app/scripts/setup-gif-runtime.mjs','app/dist-server/server/visual-export.js','0.8.0发布与升级说明.md','0.8.0本地Agent安装升级提示词.md','docs/0.8.0视觉创作使用指南.html'])assert.ok(existsSync(join(destination,path)),path);
  if(platform==='macos'){
    const zip=new AdmZip(bytes);for(const p of ['Install.command','Upgrade.command'])assert.ok((zip.getEntry(p).attr>>>16)&0o111,p);
  }
  records.push({platform,...file,files:manifest.files.length,destination,checked:true});
}
const report={ok:true,version:'0.8.0',mode:remote?'public-download':'local-files',createdAt:new Date().toISOString(),records};
writeFileSync(join(out,remote?'public-package-verification.json':'local-package-verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
