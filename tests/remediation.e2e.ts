import {chromium,expect} from 'playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {setupBrowser} from './auth-helper.js';
mkdirSync('test-results',{recursive:true});process.env.ECUSTUDIO_DATA_DIR=mkdtempSync(join(process.cwd(),'test-results/remediation-ui-'));
const D=await import('../server/db.js'),A=await import('../server/domain.js'),{buildApp}=await import('../server/app.js');
const app=await buildApp(false),url=await app.listen({host:'127.0.0.1',port:0}),browser=await chromium.launch({channel:'msedge',headless:true}),out='test-results/remediation-ui';mkdirSync(out,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await setupBrowser(page,url);const {csrf}=await(await page.request.get(url+'/api/session')).json();
 const r=await page.request.post(url+'/api/notes',{headers:{'x-csrf-token':csrf},data:{title:'光合作用课堂笔记',body:'## 学习目标\n\n**观察叶片**并整理实验记录。\n\n|活动|时间|\n|---|---|\n|观察|10分钟|'}});assert.equal(r.status(),200);const n=await r.json();
 A.saveSnapshot({title:'生物教学设计',text:'合成测试材料：观察叶片10分钟，讨论光合作用15分钟。',scope:{region:'北京',district:'全市',stage:'中考',year:2026,audience:'家长'},publisher:'合成测试',url:'https://example.com/teaching',documentType:'待判断'});
 await page.goto(url+'/#notes/'+n.id);await expect(page.getByRole('heading',{name:'学习目标',exact:true})).toBeVisible();assert.equal(await page.locator('.document-reader textarea').count(),0);
 await page.getByRole('button',{name:'编辑正文',exact:true}).click();const editor=page.locator('.tiptap[contenteditable=true]');await expect(editor).toBeVisible();await editor.click();await page.keyboard.press('Control+End');await page.keyboard.press('ArrowDown');await page.keyboard.press('End');await page.keyboard.type('，完成教学记录');
 await expect.poll(()=>D.get('SELECT revision FROM notes WHERE id=?',n.id).revision).toBeGreaterThan(1);
 assert.ok(D.get('SELECT document_json FROM note_documents WHERE note_id=?',n.id));
 await page.getByRole('button',{name:'完成编辑，阅读排版'}).click();await expect(page.locator('.document-reader table')).toBeVisible();
 await page.getByText('整理笔记 · 文件夹、标签与用途',{exact:true}).click();await page.getByLabel('标签（逗号分隔）').fill('生物，课堂');await page.getByLabel('文件夹',{exact:true}).fill('教学');
 await expect.poll(()=>D.get('SELECT folder FROM note_categories WHERE note_id=?',n.id)?.folder).toBe('教学');assert.deepEqual(JSON.parse(D.get('SELECT tags FROM note_categories WHERE note_id=?',n.id).tags),['生物','课堂']);
 await page.getByRole('button',{name:'公众号排版',exact:true}).click();await expect(page.getByRole('heading',{name:'公众号编辑器',exact:true})).toBeVisible();await expect(page.locator('.wechat-preview')).toBeVisible();await expect(page.frameLocator('.wechat-preview').getByRole('heading',{name:'光合作用课堂笔记',exact:true})).toBeVisible();
 await page.goto(url+'/#make/presentation');await page.locator('.production-sources input[type=checkbox]').first().check();await expect(page.getByLabel('项目名称',{exact:true})).toHaveValue('生物教学设计 · 讲座 PPT');await expect(page.getByLabel('创作领域',{exact:true})).toHaveValue('teaching');
 for(const theme of ['scholar','obsidian'])for(const width of [1440,768,390]){
  await page.setViewportSize({width,height:1000});await page.evaluate(t=>{document.documentElement.dataset.theme=t;document.documentElement.style.backgroundColor=t==='obsidian'?'#090d13':'#f3f6fc';document.documentElement.style.colorScheme=t==='obsidian'?'dark':'light';},theme);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,theme+' '+width+' overflow');
  assert.equal(await page.locator('.production-sources input[type=checkbox]').first().evaluate(e=>e.getBoundingClientRect().width),16);await expect(page.locator('.production-sources label>span').first()).toBeVisible();
  const choices=page.locator('.format-choices label');assert.ok(await choices.count()>0);assert.equal(await choices.evaluateAll(es=>es.every(e=>e.getBoundingClientRect().width>=100)),true);
  await page.screenshot({path:out+`/production-${theme}-${width}.png`,fullPage:true});
 }
 await page.goto(url+'/#notes/'+n.id);await expect(page.locator('.document-reader table')).toBeVisible();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:out+'/note-mobile.png',fullPage:true});
 await page.goto(url+'/#input');await expect(page.getByRole('heading',{name:'资料输入',exact:true})).toBeVisible();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 await page.setViewportSize({width:1440,height:1000});for(const label of ['输入','处理','输出'])await expect(page.locator('nav .nav-label').filter({hasText:new RegExp('^'+label+'$')})).toBeVisible();
 assert.deepEqual(errors,[]);writeFileSync(out+'/result.json',JSON.stringify({ok:true,checks:['default formatted reading','rich editing and autosave','Markdown tables preserved','folder and multiple tags','wechat mobile preview','source-driven creation defaults','three navigation groups'],widths:[1440,768,390],themes:['scholar','obsidian'],errors},null,2));console.log('Remediation browser checks passed');
}finally{await browser.close();await app.close();D.db.close();}
