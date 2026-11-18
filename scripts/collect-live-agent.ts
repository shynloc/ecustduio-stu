import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import AdmZip from 'adm-zip';
import {chromium} from 'playwright';
import {authenticatedSession} from './authenticated-session.js';
const r=JSON.parse(readFileSync('test-results/live-agent/run.json','utf8'));
const out='C:/Users/jintaothom/Documents/Codex/2026-11-08/new-chat/outputs/EcuStudio真实AI流程';mkdirSync(out,{recursive:true});
const base='http://127.0.0.1:37891/api',s=await authenticatedSession(base),cookie=s.headers.get('set-cookie')!.split(';')[0],{csrf}=await s.json() as any;
async function api(path:string,body?:any){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{cookie,'x-csrf-token':csrf,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});if(!response.ok)throw new Error(await response.text());return response.json() as any}
const p=await api('/projects/'+r.projectId),checks:any[]=[];
for(const e of r.exports){const response=await fetch(base+'/artifacts/'+e.artifactId+'/download',{headers:{cookie}}),bytes=Buffer.from(await response.arrayBuffer());if(!response.ok||bytes.length<20)throw new Error('Download failed');writeFileSync(join(out,e.kind+'.'+e.format),bytes);
 if(e.format==='pptx'){const z=new AdmZip(bytes);if(!z.getEntry('ppt/presentation.xml'))throw new Error('invalid PPTX');checks.push({pptxSlides:z.getEntries().filter(x=>/^ppt\/slides\/slide\d+\.xml$/.test(x.entryName)).length,notes:z.getEntries().filter(x=>/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(x.entryName)).length})}
 if(e.format==='pdf'&&bytes.subarray(0,4).toString()!=='%PDF')throw new Error('invalid PDF');
}
const kinds=['policy','speech','wechat','presentation','storyboard'];
const versions=[p.versions.find((v:any)=>v.id===r.masterId),...kinds.map(k=>p.versions.find((v:any)=>v.id===r[k+'Id']))];
for(const v of versions){if(!v)throw new Error('missing version');for(const b of v.body.blocks)for(const cid of b.claimIds)if(!p.claims.some((c:any)=>c.id===cid))throw new Error('bad reference');if(v.kind!=='master'&&v.master_id!==r.masterId)throw new Error('master mismatch')}
const summary={model:r.probe.model,probe:r.probe.ok,projectId:p.id,masterId:r.masterId,verifiedClaims:p.claims.filter((c:any)=>c.status==='verified').length,versions:versions.map((v:any)=>({id:v.id,kind:v.kind,number:v.number,masterId:v.master_id,blocks:v.body.blocks.length,spokenChars:v.body.blocks.map((b:any)=>b.text).join('').replace(/\s/g,'').length,scheduledSeconds:v.body.blocks.reduce((n:number,b:any)=>n+(b.duration||0),0),review:v.review,unverifiedCount:v.body.unverified.length})),jobs:r.jobs,exports:r.exports,checks};
writeFileSync(join(out,'真实流程记录.json'),JSON.stringify(summary,null,2));
const pack=await api('/projects/'+p.id+'/package',{artifactIds:r.exports.map((e:any)=>e.artifactId),includeSources:false});const zip=await fetch(base+'/assets/'+pack.assetId,{headers:{cookie}});writeFileSync(join(out,'完整流程成果.zip'),Buffer.from(await zip.arrayBuffer()));
const browser=await chromium.launch({channel:'msedge',headless:true});try{const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto('http://127.0.0.1:37891/#project/'+p.id);await page.getByRole('heading',{name:p.title,exact:true}).waitFor();await page.screenshot({path:join(out,'项目页面.png'),fullPage:false})}finally{await browser.close()}
console.log(JSON.stringify(summary));
