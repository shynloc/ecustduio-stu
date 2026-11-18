import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {DatabaseSync,backup} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {inventory} from '../deployment/upgrade.mjs';
const base='D:/EduStudio',folder=base+'/build-cache/before-pipeline-0.9.0';mkdirSync(folder,{recursive:true});
const digest=p=>existsSync(p)?createHash('sha256').update(readFileSync(p)).digest('hex'):null;
const protectedFiles=[base+'/ecustudio.json',base+'/data/secrets.dpapi',base+'/data/secrets.keychain.json'];
const verifyOnly=process.argv.includes('--verify-only');let before,hashes;
if(verifyOnly){({before,hashes}=JSON.parse(readFileSync(folder+'/retention-before.json','utf8')));}else{
before=inventory(base+'/data/app.sqlite');hashes=protectedFiles.map(p=>[p,digest(p)]);const db=new DatabaseSync(base+'/data/app.sqlite',{readOnly:true});
assert.equal(db.prepare("SELECT count(*) n FROM jobs WHERE state IN ('running','queued')").get().n,0,'Wait for active work before restarting');await backup(db,folder+'/before-restart.sqlite');db.close();writeFileSync(folder+'/retention-before.json',JSON.stringify({before,hashes},null,2));
execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',base+'/Stop-EcuStudio.ps1'],{windowsHide:true,stdio:'ignore'});
execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',base+'/Start-EcuStudio.ps1','-NoBrowser'],{windowsHide:true,stdio:'ignore'});
}
let health;for(let i=0;i<100;i++){try{health=await(await fetch('http://127.0.0.1:37891/health',{signal:AbortSignal.timeout(3000)})).json();if(health.version==='0.9.0')break;}catch{}await new Promise(r=>setTimeout(r,200));}
assert.equal(health?.version,'0.9.0');assert.deepEqual(inventory(base+'/data/app.sqlite',before),before);assert.deepEqual(protectedFiles.map(p=>[p,digest(p)]),hashes);
const result={ok:true,version:health.version,existingDataRecordsUnchanged:true,encryptedCredentialsAndConfigUnchanged:true,backupCreated:true};writeFileSync('test-results/v090-local-deployment.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
