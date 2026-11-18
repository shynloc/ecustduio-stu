import {chromium,expect} from 'playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const out='C:/Users/jintaothom/Documents/Codex/2026-11-08/new-chat/outputs/EcuStudio主题接入';mkdirSync(out,{recursive:true});
const before=JSON.parse(readFileSync('test-results/theme-install-before.json','utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const url='http://127.0.0.1:37891';await page.goto(url+'/#settings');const region=page.getByRole('region',{name:'界面主题'});await region.waitFor();const dark=region.getByRole('button',{name:/曜石/}),light=region.getByRole('button',{name:/书院/});
 await dark.click();await expect(dark).toHaveAttribute('aria-pressed','true');await expect(region.getByRole('status')).toContainText('主题已保存');await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','obsidian');await region.waitFor();await page.screenshot({path:out+'/曜石设置-桌面.png',fullPage:true});
 await page.goto(url+'/#dashboard');await page.reload();await page.getByRole('heading',{name:'今日工作台',exact:true}).waitFor();await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));await page.screenshot({path:out+'/曜石工作台-桌面.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.screenshot({path:out+'/曜石工作台-手机.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.goto(url+'/#settings');await page.reload();await region.waitFor();await page.screenshot({path:out+'/曜石设置-手机.png',fullPage:true});
 await light.scrollIntoViewIfNeeded();await light.click();await expect(light).toHaveAttribute('aria-pressed','true');await expect(region.getByRole('status')).toContainText('主题已保存');await page.reload();await region.waitFor();await expect(page.locator('html')).toHaveAttribute('data-theme','scholar');
 const state:any=await page.evaluate(async()=>(await fetch('/api/state')).json());assert.equal(state.settings.theme,'scholar');delete state.settings.theme;delete state.settings.revision;assert.deepEqual(state.settings,before.settings);assert.deepEqual(state.counts,before.counts);assert.equal(state.capabilities.deepseek,before.deepseek);assert.deepEqual(errors,[]);
 writeFileSync(out+'/生产验证.json',JSON.stringify({status:'passed',currentTheme:'scholar',obsidianSavedAndReloaded:true,desktop:'1440x1000',mobile:'390x844',otherSettingsUnchanged:true,dataCountsUnchanged:true,credentialConfigurationUnchanged:true,browserErrors:errors},null,2));console.log('Live themes verified; restored scholar, other settings and data unchanged.');
}finally{await browser.close()}
