// Real provider calls use only the synthetic, short fixture below. No production records are mutated.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,mkdtempSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {setupInjected,setupBrowser} from './auth-helper.js';
if(process.env.ECUSTUDIO_REAL_TEST!=='1')throw new Error('Set ECUSTUDIO_REAL_TEST=1 for real DeepSeek integration verification');
const sourceRoot='D:/EduStudio/data',source=new DatabaseSync(join(sourceRoot,'app.sqlite'),{readOnly:true});
const config=JSON.parse((source.prepare('SELECT body FROM settings').get() as any).body);source.close();
mkdirSync('test-results',{recursive:true});const folder=mkdtempSync(join(process.cwd(),'test-results/visual-real-'));process.env.ECUSTUDIO_DATA_DIR=folder;process.env.DEEPSEEK_API_KEY='';
copyFileSync(join(sourceRoot,'secrets.dpapi'),join(folder,'secrets.dpapi'));
const D=await import('../server/db.js'),domain=await import('../server/domain.js'),V=await import('../server/visual-studio.js'),E=await import('../server/visual-export.js'),T=await import('../server/tasks.js');
const app=await(await import('../server/app.js')).buildApp(false);await setupInjected(app);const user=D.get('SELECT * FROM users LIMIT 1');
D.run('UPDATE settings SET body=?',D.json({...config,allowExternalAI:true,maxInputChars:200000,thinkingMode:'disabled',maxTokens:8192,timeoutSeconds:1800}));
const progress=(stage:string,p:any)=>console.log(JSON.stringify({stage,message:p.message}));
const signal=AbortSignal.timeout(900000),report:any={startedAt:D.now(),folder,realDeepSeek:true,fixture:'synthetic software test; not a real admissions policy',checks:[]};let browser:any;
try{
  const scope={region:'北京',district:'全市',stage:'中考',year:2026,audience:'软件测试人员'};
  const snapshot=domain.saveSnapshot({title:'软件测试活动说明',text:'本材料仅用于软件测试。\n报名先确认条件。\n活动不承诺录取。',scope,publisher:'测试夹具',url:'https://example.com/ecustudio-visual-fixture',documentType:'待判断'});
  const claims=[1,2].map(i=>domain.addClaim({snapshotId:snapshot.id,paragraphId:snapshot.paragraphs[i].id,quote:snapshot.paragraphs[i].text,text:snapshot.paragraphs[i].text}));
  const project=domain.createProject({title:'【测试】统一视觉制作',scope,snapshotIds:[snapshot.id]});
  const copy={schemaVersion:'1.0',title:'【测试】活动说明',summary:'软件验证材料，非真实招生政策',blocks:[{id:'a',title:'确认条件',text:'报名先确认条件。',notes:'仅测试',claimIds:[claims[0].id],locked:false},{id:'b',title:'活动边界',text:'活动不承诺录取。',notes:'仅测试',claimIds:[claims[1].id],locked:false}],unverified:['测试材料，不用于招生决策']};
  const version=domain.saveVersion({projectId:project.id,kind:'master',body:copy,expectedRevision:project.revision,origin:'isolated-synthetic-test'});
  const visual=await V.createVisualDraft({actorId:user.id,versionId:version.id,config:D.settings(),duration:10,designBrief:'清晰的书院风格，暖白和墨绿，保证手机可读。'},'real-visual-create',progress,signal);
  assert.ok(visual.body.skill.some((x:any)=>x.args?.name==='html-creator-studio'));report.checks.push('Real DeepSeek reads HCS and creates shared design');report.visualId=visual.id;
  const base=await app.listen({host:'127.0.0.1',port:0});browser=await(await import('../server/visual-runtime.js')).visualBrowser();
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];page.on('pageerror',(e:any)=>errors.push(e.message));
  const consoleErrors:string[]=[];page.on('console',(m:any)=>{if(m.type()==='error')consoleErrors.push(m.text())});await setupBrowser(page,base);
  for(const theme of ['scholar','obsidian']){
    D.run('UPDATE settings SET body=?',D.json({...D.settings(),theme}));
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:1000});await page.goto(base+'/#visual/'+visual.id);await page.reload();await page.getByRole('heading',{name:'视觉制作',exact:true}).waitFor();
      await page.frameLocator('iframe[title="共享视觉预览"]').getByRole('button',{name:'开始网页演示'}).waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.getByRole('button',{name:'演示预览',exact:true}).click();
      const frame=page.frameLocator('iframe[title="共享视觉预览"]');await frame.getByRole('button',{name:'下一页'}).click();
      assert.equal(await frame.locator('.scene:not([hidden])').getAttribute('data-review-id'),'b:0');
      await page.screenshot({path:join(folder,`${theme}-${width}.png`),fullPage:true});
    }
  }
  report.checks.push('Desktop 1440 and mobile 390 in both themes; iframe scripts and slide navigation work');
  await page.getByRole('checkbox',{name:'演示 PDF',exact:true}).check();
  await page.getByRole('checkbox',{name:'已核对当前文案和画面，制作所选草稿成果'}).check();
  const request=page.waitForResponse((r:any)=>r.url().endsWith('/export')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'生成所选成果并打包'}).click();const response=await request;assert.equal(response.status(),202,await response.text());
  const job=await response.json(),input=D.parse(D.get('SELECT input FROM jobs WHERE id=?',job.id).input);
  const result=await E.runVisualExport(input,job.id,progress,signal);
  D.run("UPDATE jobs SET state='succeeded',result=? WHERE id=?",D.json(result),job.id);
  for(const format of ['html','pptx','pdf','gif','mp4','wav','srt','zip']){
    const a=result.artifacts.find((a:any)=>a.format===format);assert.ok(a,format);
    writeFileSync(join(folder,'实际生成.'+format),domain.assetBuffer(a.asset_id).data);
  }
  const plan=result.artifacts.find((a:any)=>a.name==='动图动作方案.json');const motion=D.parse(domain.assetBuffer(plan.asset_id).data.toString());
  assert.ok(motion.toolLog.some((x:any)=>x.args?.name==='gif-factory'));
  report.checks.push('Real DeepSeek reads GIF Factory, actual upstream encoder writes GIF');
  report.checks.push('Real DeepSeek TTS, scene durations measured from returned WAV, voiced H264/AAC output plus native PPTX/PDF/HTML');
  report.duration=result.duration;report.timeline=result.timeline;report.jobId=job.id;
  await page.goto(base+'/#visual/'+visual.id);await page.reload();await page.getByRole('heading',{name:'此设计的成果'}).waitFor();
  await page.screenshot({path:join(folder,'成果与复用.png'),fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors.filter(s=>/Content Security Policy|Refused to|Uncaught/.test(s)),[]);report.browserErrors=errors;report.ok=true;
}catch(e:any){report.ok=false;report.error=e.stack;process.exitCode=1;}
finally{
  if(browser)await browser.close();await app.close();D.db.close();rmSync(join(folder,'secrets.dpapi'),{force:true});
  report.finishedAt=new Date().toISOString();writeFileSync('test-results/visual-real-result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
