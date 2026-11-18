import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:37891');await page.getByRole('heading',{name:'今日工作台',exact:true}).waitFor();
 mkdirSync('test-results/production',{recursive:true});await page.screenshot({path:'test-results/production/dashboard.png',fullPage:true});
 const state:any=await page.evaluate(async()=>{const r=await fetch('/api/state');return r.json()});
 await page.goto('http://127.0.0.1:37891/#snapshot/99031601-f00a-4535-88f4-682854926564');await page.getByRole('heading',{name:'北京教育考试院关于做好2027年初中学业水平考试报名工作的通知',exact:true}).waitFor();
 await page.screenshot({path:'test-results/production/source.png',fullPage:false});
 writeFileSync('test-results/production/status.json',JSON.stringify({health:await (await fetch('http://127.0.0.1:37891/health')).json(),counts:state.counts,deepseek:state.capabilities.deepseek,dingtalk:state.capabilities.dingtalk,scheduleEnabled:state.settings.scheduleEnabled,autoSend:state.settings.autoSend,sourceCount:state.sources.length,reportCount:state.reports.length,hasImportedOfficialSnapshot:state.snapshots.some((s:any)=>s.id==='99031601-f00a-4535-88f4-682854926564'),browserErrors:errors},null,2));
 console.log(JSON.stringify({counts:state.counts,deepseek:state.capabilities.deepseek,reportCount:state.reports.length,browserErrors:errors}));
}finally{await browser.close()}
