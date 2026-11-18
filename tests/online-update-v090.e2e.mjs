import assert from 'node:assert/strict';
import {cpSync,mkdirSync,mkdtempSync,writeFileSync,readFileSync,existsSync,symlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright';
import {systemAdapter,inventory} from '../deployment/upgrade.mjs';
if(process.platform!=='win32')throw new Error('Windows real online-upgrade test');
const source=resolve(process.argv[2]);mkdirSync('test-results',{recursive:true});const folder=mkdtempSync(resolve('test-results/online-upgrade-')),target=join(folder,'工作台 with spaces');mkdirSync(target);
cpSync(join(source,'app'),join(target,'app'),{recursive:true});for(const n of ['Common.ps1','Start-EcuStudio.ps1','Stop-EcuStudio.ps1'])cpSync(join(source,n),join(target,n));
// The source is the original published 0.8.4 package; its code/version/lockfile are unchanged.
symlinkSync(resolve('node_modules'),join(target,'app/node_modules'),'junction');
if(process.env.ECUSTUDIO_TEST_BROWSER_CACHE){mkdirSync(join(target,'runtime'),{recursive:true});cpSync(resolve(process.env.ECUSTUDIO_TEST_BROWSER_CACHE),join(target,'runtime/browsers'),{recursive:true});}
const port=await new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
writeFileSync(join(target,'ecustudio.json'),JSON.stringify({port,networkMode:'local'}));mkdirSync(join(target,'data/logs'),{recursive:true});
const child=spawn(process.execPath,[join(target,'app/dist-server/server/index.js')],{cwd:join(target,'app'),env:{...process.env,ECUSTUDIO_DATA_DIR:join(target,'data'),PORT:String(port),ECUSTUDIO_NETWORK_MODE:'local',DEEPSEEK_API_KEY:''},windowsHide:true,stdio:'ignore'});
writeFileSync(join(target,'data/logs/server.pid'),String(child.pid));const base='http://127.0.0.1:'+port;
const result={version:'0.9.0',fixture:'unmodified published 0.8.4 installation -> signed public 0.9.0 update',startedAt:new Date().toISOString(),target,checks:[]};let browser;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function session(){const r=await fetch(base+'/api/session'),b=await r.json();return {cookie:r.headers.get('set-cookie')?.split(';')[0],csrf:b.csrf};}
async function request(s,path,body,method=body?'POST':'GET'){const r=await fetch(base+'/api'+path,{method,headers:{cookie:s.cookie,'x-csrf-token':s.csrf,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});const b=await r.json();if(r.headers.get('set-cookie'))s.cookie=r.headers.get('set-cookie').split(';')[0];if(b.csrf)s.csrf=b.csrf;return {status:r.status,body:b};}
async function api(s,path,body,method){const r=await request(s,path,body,method);assert.ok(r.status<300,JSON.stringify(r));return r.body;}
try{
 for(let n=0;n<300;n++){try{if((await fetch(base+'/health')).ok)break;}catch{}await sleep(100);}
 assert.equal((await(await fetch(base+'/health')).json()).version,'0.8.4');const admin=await session(),password='Online-upgrade-test-2026!';await api(admin,'/auth/setup',{username:'online-admin',displayName:'在线升级测试',password});
 const members=[];for(const role of ['creator','sales']){await api(admin,'/auth/users',{username:'online-'+role,displayName:role,password,role});const s=await session();await api(s,'/auth/login',{username:'online-'+role,password});await api(s,'/auth/password',{currentPassword:password,newPassword:password+role});members.push({role,password:password+role});
  for(const path of ['/settings/updates','/settings/updates/check','/settings/updates/install','/settings/updates/recover']){const r=await request(s,path,path==='/settings/updates'?undefined:{});assert.equal(r.status,403);assert.equal(r.body.error.code,'FORBIDDEN');}}
 const anon=await session();assert.equal((await request(anon,'/settings/updates')).status,401);assert.equal((await request({...admin,csrf:'invalid'},'/settings/updates/check',{})).status,403);result.checks.push('all update endpoints deny creators/sales; anonymous and invalid CSRF denied');
 const note=await api(admin,'/notes',{title:'升级前原有笔记',body:'账号和材料应原样保留'});await api(admin,'/secrets',{name:'deepseek',value:'synthetic-online-upgrade-test-only'});
 mkdirSync(join(target,'data/assets'),{recursive:true});writeFileSync(join(target,'data/assets/original-test.txt'),'original material');
 const cfg=readFileSync(join(target,'ecustudio.json')),key=readFileSync(join(target,'data/secrets.dpapi')),before=inventory(join(target,'data/app.sqlite'));
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([{name:'ecustudio',value:admin.cookie.split('=')[1],url:base,httpOnly:true,sameSite:'Strict'}]);const page=await context.newPage(),errors=[];let navigations=0;page.on('framenavigated',f=>{if(f===page.mainFrame())navigations++;});page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/#settings');const panel=page.getByRole('region',{name:'工作台更新'});await panel.waitFor();await panel.getByRole('button',{name:'检查更新',exact:true}).click();await panel.getByRole('button',{name:'一键升级至 0.9.0'}).waitFor({timeout:30000});
 assert.equal((await request(admin,'/settings/updates/install',{version:'0.9.0',sha256:'0'.repeat(64)})).status,409);result.checks.push('real signed feed checked; stale/tampered requested package rejected');
 for(const theme of ['scholar','obsidian']){await api(admin,'/settings/theme',{theme,revision:(await api(admin,'/state')).settings.revision},'PATCH');await page.reload();await panel.waitFor();for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await sleep(150);await panel.screenshot({path:join(folder,theme+'-'+width+'.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}}result.checks.push('desktop 1440 and mobile 390, scholar/obsidian update panel, no horizontal overflow');
 // Theme choice is an intentional user edit; inventory baseline is taken immediately before the upgrade.
 const baseline=inventory(join(target,'data/app.sqlite'));
 const previousNavigations=navigations;const accepted=page.waitForResponse(r=>r.url().endsWith('/api/settings/updates/install')&&r.request().method()==='POST');await panel.getByRole('button',{name:'一键升级至 0.9.0'}).click();assert.equal((await accepted).status(),202);
 let completed,last='';for(let n=0;n<900;n++){try{const status=await api(admin,'/settings/updates');last=JSON.stringify(status.run);if(['failed','interrupted'].includes(status.run?.phase))throw new Error('TERMINAL '+last);if(status.run?.phase==='succeeded'){completed=status;break;}}catch(e){if(e.message.startsWith('TERMINAL'))throw e;}await sleep(1000);}
 assert.ok(completed,'Online upgrade timeout: '+last);assert.equal(completed.currentVersion,'0.9.0');assert.ok(existsSync(join(completed.run.backup,'database.sqlite')));assert.deepEqual(inventory(join(target,'data/app.sqlite'),baseline),baseline);
 for(let n=0;n<100&&navigations<=previousNavigations;n++)await sleep(100);assert.ok(navigations>previousNavigations,'page must automatically reload');await page.waitForFunction(()=>sessionStorage.getItem('ecustudio:update-active')===null&&document.querySelector('[aria-label="工作台更新"]')?.textContent?.includes('当前版本 0.9.0'),{},{timeout:20000});result.checks.push('page-triggered public download, detached updater, real service stop/start, automatic page reconnect/reload');
 assert.deepEqual(readFileSync(join(target,'ecustudio.json')),cfg);assert.deepEqual(readFileSync(join(target,'data/secrets.dpapi')),key);assert.equal(readFileSync(join(target,'data/assets/original-test.txt'),'utf8'),'original material');assert.equal((await api(admin,'/notes/'+note.id)).body,'账号和材料应原样保留');
 for(const member of [{role:'admin',password},...members]){const s=await session();const b=await api(s,'/auth/login',{username:'online-'+member.role,password:member.password});assert.equal(b.user.role,member.role);}
 const decrypted=spawnSync(process.execPath,['--input-type=module','-e',"const {getSecret}=await import('./dist-server/server/secrets.js');if(await getSecret('deepseek')!=='synthetic-online-upgrade-test-only')process.exit(2);const D=await import('./dist-server/server/db.js');D.db.close();"],{cwd:join(target,'app'),env:{...process.env,ECUSTUDIO_DATA_DIR:join(target,'data'),DEEPSEEK_API_KEY:''},windowsHide:true,encoding:'utf8'});assert.equal(decrypted.status,0);assert.deepEqual(errors,[]);
 result.checks.push('all original table records unchanged; three original passwords work; note/asset retained; configuration and DPAPI bytes unchanged; DeepSeek test credential decrypts; local backup present; no browser JS errors');result.ok=true;result.backup=completed.run.backup;
}catch(e){result.ok=false;result.error=e.stack;process.exitCode=1;}
finally{if(browser)await browser.close();try{await systemAdapter.stop(target);}catch{}child.kill();result.finishedAt=new Date().toISOString();writeFileSync('test-results/online-update-v090-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));}
