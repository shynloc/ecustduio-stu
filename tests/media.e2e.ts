import {chromium,expect} from "playwright/test";
import assert from "node:assert/strict";
import {mkdirSync,mkdtempSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {setupBrowser} from "./auth-helper.js";
mkdirSync("test-results",{recursive:true});process.env.ECUSTUDIO_DATA_DIR=mkdtempSync(join(process.cwd(),"test-results/media-ui-"));process.env.DEEPSEEK_API_KEY="test-only-no-network";
const D=await import("../server/db.js"),A=await import("../server/domain.js"),W=await import("../server/wav.js"),{buildApp}=await import("../server/app.js");
D.run("UPDATE settings SET body=? WHERE id=1",D.json({...D.settings(),allowExternalAI:true}));
const app=await buildApp(false),url=await app.listen({host:"127.0.0.1",port:0}),browser=await chromium.launch({channel:"msedge",headless:true});
const out="test-results/media-ui";mkdirSync(out,{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await setupBrowser(page,url);
  await page.goto(url+"/#media");await expect(page.getByRole("heading",{name:"文件与语音",exact:true})).toBeVisible();
  await page.getByLabel("媒体文件").setInputFiles({name:"合成资料.txt",mimeType:"text/plain",buffer:Buffer.from("合成活动共有12人参加，仅用于功能测试。")});
  await expect(page.getByLabel("任务标题")).toHaveValue("合成资料");
  await page.screenshot({path:out+"/desktop.png",fullPage:true});
  await page.getByRole("button",{name:"发送至 DeepSeek 并处理"}).click();await page.waitForURL(/#media\//);
  const jobId=page.url().split("#media/")[1],job=D.get("SELECT * FROM jobs WHERE id=?",jobId),input=D.parse(job.input);
  assert.equal(input.action,"document");assert.ok(input.file.id);
  D.run("UPDATE jobs SET state='succeeded',result=? WHERE id=?",D.json({action:"document",title:"合成资料",text:"合成活动共有12人参加，仅用于功能测试。",sourceAssetId:input.file.id,warnings:["请核实原始文件。"]}),jobId);
  await expect(page.getByLabel("校正后的文字")).toBeVisible();
  await page.getByRole("button",{name:"存入创作笔记"}).click();await page.waitForURL(/#notes\//);await expect(page.getByLabel("笔记内容")).toContainText("12人");
  await page.getByRole("button",{name:"生成配音",exact:true}).click();await page.waitForURL(/#media$/);await expect(page.getByLabel("配音文字")).toHaveValue(/12人/);
  await page.getByLabel("配音音色").selectOption("tide");await page.getByRole("button",{name:"发送至 DeepSeek 并生成配音"}).click();await page.waitForURL(/#media\//);
  const voiceJob=page.url().split("#media/")[1],voice=D.parse(D.get("SELECT input FROM jobs WHERE id=?",voiceJob).input);assert.equal(voice.source.kind,"note");assert.equal(voice.voice,"tide");
  const audio=A.asset(W.makeWav(Buffer.alloc(48000),24000),"UI测试.wav","audio/wav","media");D.run("INSERT INTO media_assets VALUES(?,?)",audio.id,voice.actorId);
  D.run("UPDATE jobs SET state='succeeded',result=? WHERE id=?",D.json({action:"tts",title:"合成资料",text:voice.speechText,audioAssetId:audio.id,voice:"tide",durationMs:1000,warnings:[]}),voiceJob);
  await expect(page.locator("audio")).toBeVisible();await page.waitForFunction(()=>Number.isFinite(document.querySelector("audio")?.duration));
  assert.equal(await page.locator("audio").evaluate((a:HTMLAudioElement)=>a.duration),1);
  await page.goto(url+"/#media/"+jobId);await page.getByText("导入共享素材，继续事实提取与内容制作",{exact:true}).click();
  await page.getByLabel("地区",{exact:true}).fill("测试地区");await page.getByRole("button",{name:"导入并开始制作"}).click();await page.waitForURL(/#make\/policy/);
  await expect(page.getByLabel("项目名称",{exact:true})).toHaveValue("合成资料 · 政策研究");await expect(page.getByLabel("地区",{exact:true})).toHaveValue("测试地区");
  assert.equal(await page.locator('.production-sources input[type="checkbox"]:checked').count(),1);
  await page.goto(url+"/#media");await page.getByRole("button",{name:"录音转文字",exact:true}).click();
  await page.getByLabel("媒体文件").setInputFiles({name:"录音.wav",mimeType:"audio/wav",buffer:W.makeWav(Buffer.alloc(48000*2),48000)});await expect(page.getByLabel("任务标题")).toHaveValue("录音");
  const uploaded=D.get("SELECT * FROM assets ORDER BY created_at DESC LIMIT 1");assert.equal(W.readWav(A.assetBuffer(uploaded.id).data).sampleRate,16000);
  for(const theme of ["scholar","obsidian"]){
    await page.evaluate(t=>{document.documentElement.dataset.theme=t;document.documentElement.style.backgroundColor=t==="obsidian"?"#090d13":"#f6f5f1";document.documentElement.style.colorScheme=t==="obsidian"?"dark":"light";},theme);await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    assert.equal(await page.locator('.media-form input,.media-form textarea,.media-form select').evaluateAll(elements=>elements.every(e=>e.getBoundingClientRect().right<=e.closest('.media-main')!.getBoundingClientRect().right-10)),true);
    await page.screenshot({path:out+"/mobile-"+theme+".png",fullPage:true});
  }
  await page.goto(url+"/#media/"+jobId);await expect(page.getByLabel("校正后的文字")).toBeVisible();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  assert.deepEqual(errors,[]);const result={ok:true,widths:[1440,390],themes:["scholar","obsidian"],errors,checks:["upload and enqueue","result to note","note to saved-source speech","audio metadata playback route","material to preselected production","browser audio normalization","mobile no horizontal overflow"]};
  writeFileSync(out+"/result.json",JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();await app.close();D.db.close();}
