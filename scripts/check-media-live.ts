// Small public-fixture checks. Credentials stay in process memory; all writes use an isolated DB.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
if (process.env.ECUSTUDIO_LIVE_MEDIA_TEST !== "1") throw new Error("Explicit live-media-test opt-in required");
if (process.env.ECUSTUDIO_MEDIA_CHILD !== "1") {
  const D = await import("../server/db.js"), S = await import("../server/secrets.js");
  if (!D.settings().allowExternalAI) throw new Error("DeepSeek consent is not enabled");
  const key = await S.getSecret("deepseek"); if (!key) throw new Error("No configured DeepSeek key");
  D.db.close(); mkdirSync("test-results", { recursive:true });
  const dir=mkdtempSync(join(process.cwd(),"test-results/media-live-"));
  const child=spawn(process.execPath,["--import","tsx",import.meta.filename],{stdio:"inherit",windowsHide:true,
    env:{...process.env,ECUSTUDIO_MEDIA_CHILD:"1",ECUSTUDIO_DATA_DIR:dir,DEEPSEEK_API_KEY:key}});
  process.exitCode=await new Promise<number>(resolve=>child.on("exit",code=>resolve(code??1)));
} else {
  const D=await import("../server/db.js"), M=await import("../server/media.js"), A=await import("../server/domain.js"),
    T=await import("../server/tasks.js"), {buildApp}=await import("../server/app.js"), {setupInjected}=await import("../tests/auth-helper.js"),
    {createCanvas}=await import("@napi-rs/canvas"), {Document,Packer,Paragraph}=await import("docx");
  const app=await buildApp(false); await setupInjected(app);
  const user=D.get("SELECT * FROM users LIMIT 1");
  D.run("UPDATE settings SET body=? WHERE id=1",D.json({...D.settings(),allowExternalAI:true,thinkingMode:"disabled",maxTokens:2048}));
  const record:any={version:"0.4.0",startedAt:new Date().toISOString(),fixtures:"synthetic only; no business documents",checks:[]};
  let audioId:string|undefined;
  async function check(action:string,assetId?:string) {
    try {
      const input=M.freezeMedia({action,title:"公开合成样例验证",...(assetId?{assetId}:{}),text:"这是一段工作台功能测试录音。请核对资料，再开始创作。",prompt:"请准确提取测试文件中的文字和数字，简短回答。"},user);
      const job=T.enqueue("media",input);D.run("INSERT INTO media_jobs VALUES(?,?,?)",job.id,user.id,D.now());
      const result=await M.runMedia(input,job.id,(_stage:string,data:any)=>console.log(action+": "+data.message),AbortSignal.timeout(180000));
      D.run("UPDATE jobs SET state='succeeded',result=?,finished_at=? WHERE id=?",D.json(result),D.now(),job.id);
      if(action==="tts")audioId=result.audioAssetId;
      record.checks.push({action,ok:true,characters:result.text.length,preview:result.text.slice(0,400),durationMs:result.durationMs,pageCount:result.pageCount,warnings:result.warnings,usage:result.usage});
    }catch(e:any){record.checks.push({action,ok:false,error:{code:e.code||e.name,message:e.message}});}
    writeFileSync("docs/DeepSeek媒体验证记录.json",JSON.stringify(record,null,2));
  }
  try {
    await check("tts"); if(audioId)await check("asr",audioId);
    const canvas=createCanvas(900,320),c=canvas.getContext("2d");c.fillStyle="white";c.fillRect(0,0,900,320);c.fillStyle="black";c.font="40px Arial";
    c.fillText("EcuStudio synthetic test",30,65);c.fillText("Reading workshop: 12 participants",30,145);c.fillText("Date: 2026-11-14",30,225);
    const image=A.asset(canvas.toBuffer("image/png"),"public-media-test.png","image/png","media-test");
    await check("vision",image.id);await check("ocr",image.id);
    const bytes=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph("EcuStudio synthetic test document"),new Paragraph("A reading workshop has 12 participants. Test date: 2026-11-14. This is fictitious data, not an education policy.")]}]}));
    const doc=A.asset(bytes,"public-media-test.docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document","media-test");
    await check("document",doc.id);
  } finally {
    record.finishedAt=new Date().toISOString();record.ok=record.checks.length===5&&record.checks.every((c:any)=>c.ok);
    writeFileSync("docs/DeepSeek媒体验证记录.json",JSON.stringify(record,null,2));console.log(JSON.stringify(record,null,2));
    if(!record.ok)process.exitCode=1;await app.close();D.db.close();
  }
}
