import {spawn} from "node:child_process";
import {readdirSync,statSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
if(process.env.ECUSTUDIO_LIVE_MEDIA_TEST!=="1")throw new Error("Explicit live-test opt-in required");
if(process.env.ECUSTUDIO_MEDIA_CHILD!=="1"){
  const D=await import("../server/db.js"),S=await import("../server/secrets.js");
  if(!D.settings().allowExternalAI)throw new Error("AI consent is disabled");
  const key=await S.getSecret("deepseek");if(!key)throw new Error("Missing key");D.db.close();
  const dir=readdirSync("test-results").filter(n=>n.startsWith("media-live-")).map(n=>resolve("test-results",n)).sort((a,b)=>statSync(b).mtimeMs-statSync(a).mtimeMs)[0];
  if(!dir)throw new Error("Run media endpoint fixtures first");
  const child=spawn(process.execPath,["--import","tsx",import.meta.filename],{stdio:"inherit",windowsHide:true,env:{...process.env,ECUSTUDIO_MEDIA_CHILD:"1",ECUSTUDIO_DATA_DIR:dir,DEEPSEEK_API_KEY:key}});
  process.exitCode=await new Promise<number>(r=>child.on("exit",c=>r(c??1)));
}else{
  const D=await import("../server/db.js"),A=await import("../server/domain.js"),M=await import("../server/media.js"),P=await import("../server/production.js"),T=await import("../server/tasks.js"),
    {buildApp}=await import("../server/app.js"),{loginInjected}=await import("../tests/auth-helper.js");
  const app=await buildApp(false),s=await loginInjected(app),user=D.get("SELECT * FROM users LIMIT 1"),record:any={startedAt:new Date().toISOString(),version:"0.4.0",checks:[]};
  try{
    const job=D.all("SELECT * FROM jobs WHERE type='media' AND state='succeeded'").find(j=>D.parse(j.result).action==="ocr");if(!job)throw new Error("Missing successful OCR fixture");
    const recognized=D.parse(job.result),scope={region:"北京",district:"全市",stage:"综合",year:2026,audience:"功能测试读者"};
    const r=await app.inject({method:"POST",url:`/api/media/${job.id}/material`,headers:{host:"localhost",cookie:s.cookie,"x-csrf-token":s.csrf},payload:{title:"合成活动测试资料",text:recognized.text,scope}});
    if(r.statusCode!==200)throw new Error(r.body);record.checks.push({step:"media_to_material",ok:true});
    const input=P.freezeProduction({template:"speech",title:"合成活动口播测试",scope,snapshotIds:[r.json().snapshotId],duration:20,formats:["md"],prompt:"这是虚构的功能测试活动，非教育政策。请生成简短20秒口播，明确待核实，仅引用12人和日期这些信息。"},user);
    input.config={...input.config,thinkingMode:"disabled",maxTokens:4096,maxRequests:4};
    const production=T.enqueue("production",input),result=await P.runProduction(input,production.id,(stage:string)=>console.log("flow: "+stage),AbortSignal.timeout(240000));
    if(!result.claimIds.length||!result.artifacts.length)throw new Error("Production did not create facts and file");
    record.checks.push({step:"research_master_speech_export",ok:true,claims:result.claimIds.length,artifacts:result.artifacts.length,steps:result.steps,usage:result.usage});
    const voice=M.freezeMedia({action:"tts",title:"合成活动口播配音",sourceKind:"version",sourceId:result.versionId},user),voiceJob=T.enqueue("media",voice);
    D.run("INSERT INTO media_jobs VALUES(?,?,?)",voiceJob.id,user.id,D.now());
    const audio=await M.runMedia(voice,voiceJob.id,()=>{},AbortSignal.timeout(120000));if(!A.assetBuffer(audio.audioAssetId).data.length)throw new Error("Empty audio");
    record.checks.push({step:"saved_version_to_audio",ok:true,durationMs:audio.durationMs,sourceKind:audio.source.kind});record.ok=true;
  }catch(e:any){record.ok=false;record.error={code:e.code||e.name,message:e.message};process.exitCode=1;}
  finally{record.finishedAt=new Date().toISOString();writeFileSync("docs/DeepSeek媒体流程验证.json",JSON.stringify(record,null,2));console.log(JSON.stringify(record,null,2));await app.close();D.db.close();}
}
