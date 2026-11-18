// One-time upgrade evidence. Authenticated through the running legacy local session.
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const base='http://127.0.0.1:37891/api',session=await fetch(base+'/session'),cookie=session.headers.get('set-cookie')!.split(';')[0],{csrf}=await session.json() as any;
async function api(path:string,body?:any){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{cookie,'x-csrf-token':csrf,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error('Upgrade backup request failed: '+r.status);return r.json() as any;}
const before=await api('/state'),job=await api('/backups',{});let backupId='';
for(let n=0;n<60;n++){const j=await api('/jobs/'+job.id);if(j.state==='succeeded'){backupId=j.result.backupId;break;}if(['failed','interrupted','canceled'].includes(j.state))throw new Error('Upgrade backup did not succeed');await new Promise(r=>setTimeout(r,1000));}
if(!backupId)throw new Error('Upgrade backup timeout');
writeFileSync('test-results/accounts-upgrade-before.json',JSON.stringify({createdAt:new Date().toISOString(),backupId,snapshots:before.snapshots.map((s:any)=>s.id).sort(),projects:before.projects.map((p:any)=>p.id).sort(),scheduleEnabled:before.settings.scheduleEnabled,theme:before.settings.theme,encryptedCredentialHash:createHash('sha256').update(readFileSync('../data/secrets.dpapi')).digest('hex')},null,2));
console.log('Pre-upgrade backup saved; original record IDs captured.');
