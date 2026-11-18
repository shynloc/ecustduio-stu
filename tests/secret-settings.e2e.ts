import {chromium} from 'playwright';import {spawn} from 'node:child_process';import {createServer} from 'node:net';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';import {join,resolve} from 'node:path';import assert from 'node:assert/strict';import {setupBrowser} from './auth-helper.js';
mkdirSync('test-results',{recursive:true});const folder=mkdtempSync(resolve('test-results/secret-ui-'));
const port=await new Promise<number>(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=(s.address() as any).port;s.close(()=>r(p));});});
const server=spawn(process.execPath,['dist-server/server/index.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),ECUSTUDIO_DATA_DIR:folder,DEEPSEEK_API_KEY:'',ECUSTUDIO_NETWORK_MODE:'local'},windowsHide:true,stdio:'ignore'});
const base='http://127.0.0.1:'+port,report:any={platform:process.platform,checks:[],nativeMacExecuted:false};let browser;
try{
 for(let n=0;n<200;n++){try{if((await fetch(base+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});await setupBrowser(page,base);await page.goto(base+'/#settings');
 const input=page.getByRole('textbox',{name:'DeepSeek API Key'});const key=page.getByLabel('DeepSeek API Key',{exact:true});await key.fill('synthetic-settings-test-only');const initial=page.url();let posts=0;
 await page.route('**/api/secrets',async route=>{posts++;await new Promise(r=>setTimeout(r,150));await route.fulfill({status:424,contentType:'application/json',body:JSON.stringify({error:{code:'KEYCHAIN_LOCKED',message:'请解锁 Mac 登录钥匙串后重试'}})});});
 await page.getByRole('button',{name:'保存密钥',exact:true}).evaluate((button:any)=>{button.click();button.click();});
 await page.getByText('保存未完成：请解锁 Mac 登录钥匙串后重试',{exact:true}).waitFor();assert.equal(posts,1);assert.equal(page.url(),initial);assert.equal(await key.inputValue(),'synthetic-settings-test-only');assert.equal(await key.getAttribute('type'),'password');
 await page.locator('[aria-label="DeepSeek 凭据设置"]').screenshot({path:join(folder,'keychain-error.png')});report.checks.push('simulated Mac locked-keychain response stays in settings, retains masked input, rejects duplicate save');
 await page.unroute('**/api/secrets');await page.getByRole('button',{name:'保存密钥',exact:true}).click();await page.getByText('密钥已保存并完成读取校验。接下来允许 DeepSeek 调用，再保存并测试连接。',{exact:true}).waitFor();assert.equal(await key.inputValue(),'');assert.equal(page.url(),initial);report.checks.push('real Windows encrypted save succeeds after retry and clears input');
 await page.getByRole('button',{name:'检查本机凭据存储',exact:true}).click();await page.getByText('本机凭据加密与读取检查通过。',{exact:true}).waitFor();report.checks.push('real local storage diagnostic succeeds without calling DeepSeek');report.ok=true;
}catch(e:any){report.ok=false;report.error=e.stack;process.exitCode=1;}finally{await browser?.close();server.kill();writeFileSync('test-results/secret-settings-result.json',JSON.stringify({...report,folder},null,2));console.log(JSON.stringify(report,null,2));}
