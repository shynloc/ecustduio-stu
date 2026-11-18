import { z } from 'zod';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeVisualPresentation } from './visual-presentation.js';
import { get, all, parse, json, hash, root, dataDir, settings, err, requireRow } from './db.js';
import { assetBuffer } from './domain.js';
import { grantMediaAsset } from './media-access.js';
import { structuredTask, workflowActor } from './workflow-agent.js';
import { mediaRequest, jsonOptions, responseBytes } from './media-provider.js';
import { readWav, makeWav } from './wav.js';
import { billingCharacters } from '../shared/media.js';
import type { VisualMaster } from '../shared/visual.js';
import { VisualExport } from '../shared/visual.js';
import { masterHtml } from './visual-document.js';
import { visualBrowser, command, ffmpegPath, gifPython } from './visual-runtime.js';
import {visualNarration,musicAsset} from './visual-audio.js';

const name = (s:string) => s.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,65);
const timestamp=(seconds:number)=>{const ms=Math.round(seconds*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`};

export function checkVisualSource(v:any) {
  const current=requireRow(get('SELECT * FROM versions WHERE id=?',v.versionId));
  const updated=v.body.master?.sources.some((s:any)=>get('SELECT id FROM snapshots WHERE previous_id=? LIMIT 1',s.id));
  if(current.stale || updated || hash(parse(current.body))!==v.copyHash)err('COPY_STALE','来源或文案已变化，请从新的内容版本建立视觉项目；旧版成果已保留。',409);
}

export async function runVisualExport(input:any,jobId:string,progress:any,signal:AbortSignal,transport:typeof fetch=fetch) {
  const {visualView}=await import('./visual-studio.js');
  const {storeWorkflowArtifact,makeBundle}=await import('./workflows.js');
  const actor=workflowActor(input.actorId,false);
  const v=visualView(input.visualId,{id:input.actorId,role:actor.role});
  const options=VisualExport.parse(input.options);
  const approval=requireRow(get('SELECT * FROM visual_approvals WHERE id=?',input.approvalId));
  if(approval.actor_id!==input.actorId || approval.visual_id!==v.id || approval.copy_hash!==v.copyHash || approval.visual_hash!==v.visualHash || json(parse(approval.options))!==json(options))
    err('APPROVAL_STALE','制作记录与所选版本或输出不一致，请重新提交',403);
  const check=()=>{signal.throwIfAborted();workflowActor(input.actorId,false);checkVisualSource(v)};
  check();
  const master:VisualMaster=v.body.master;
  if(!master)err('VISUAL_UPGRADE_REQUIRED','请在此页面点击“保存设计新版本”升级旧母版，再制作多种输出',409);
  const metadata={visualId:v.id,projectId:v.body.projectId,versionId:v.versionId,copyHash:v.copyHash,visualHash:v.visualHash,ownerId:input.actorId,sourceIds:master.sources.map(s=>s.id)};
  const outputs:any[]=[];
  const stored=(format:string,step='')=>get('SELECT a.*,s.name FROM artifacts a JOIN assets s ON s.id=a.asset_id WHERE a.job_id=? AND a.format=?',jobId+step,format);
  const save=(bytes:Buffer,file:string,format:string,step='',extra:any={})=>{
    check();const a=storeWorkflowArtifact(bytes,file,format,jobId+step,v.versionId,{...metadata,...extra});
    grantMediaAsset(a.asset_id,input.actorId);return a;
  };
  const dir=mkdtempSync(join(dataDir,'staging','visual-'));
  let browser:any;
  const page=async(width=1280,height=720)=>{
    if(!browser)browser=await visualBrowser();
    const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
    await context.route('**/*',(r:any)=>r.abort());
    const p=await context.newPage();p.setDefaultTimeout(15000);
    await p.setContent(masterHtml(master),{waitUntil:'load'});await p.evaluate(()=>document.fonts.ready);
    return p;
  };
  const sceneShot=async(p:any,i:number,progressValue=1,mode='stage',capture=true,motion?:string)=>{
    check();const state=await p.evaluate(({i,progressValue,mode,motion}:any)=>(window as any).ecuScene(i,progressValue,mode,motion),{i,progressValue,mode,motion});
    if(state.overflow)err('VISUAL_OVERFLOW','场景内容溢出，请减少单段文字后再制作',422);
    return capture?p.screenshot({type:'png',omitBackground:mode==='gif'}):undefined;
  };
  try {
    if(options.outputs.includes('html'))outputs.push(v.artifact);
    if(options.outputs.includes('gif')) {
      const python=await gifPython(signal);
      const selected=options.gifSceneIds || master.scenes.slice(0,1).map(s=>s.id);
      if(selected.some(s=>!master.scenes.some(x=>x.id===s)))err('SCENE_NOT_FOUND','动图选择的场景不属于此版本',422);
      let plan=stored('json',':motion');
      const needsPlan=master.scenes.some(s=>selected.includes(s.id)&&(!s.motion||s.motion==='auto'));
      if(!plan&&needsPlan){
        workflowActor(input.actorId);
        const answer=await structuredTask({actorId:input.actorId,config:input.config||settings(),requiredSkill:'gif-factory',schema:z.object({motion:z.enum(['progress','pulse','sway']),reason:z.string().max(800)}).strict(),
          instruction:'先调用 read_skill 读取 gif-factory。为已有政策图卡选择克制的循环动效。只输出 JSON {motion:progress|pulse|sway,reason}。不改写文案，不生成命令。progress为进度线展开，pulse为编号轻微呼吸，sway为编号轻微摆动。由宿主逐帧渲染，再实际调用 GIF Factory Python 编码器。',context:{design:master.design,scenes:master.scenes.filter(s=>selected.includes(s.id))}},progress,signal,transport);
        plan=save(Buffer.from(json(answer)),'动图动作方案.json','json',':motion',{skill:'gif-factory'});
      }
      const plannedMotion=plan?parse(assetBuffer(plan.asset_id).data.toString()).content.motion:'progress';
      if(plan)outputs.push(plan);
      const p=await page(512,512);
      for(const sid of [...new Set(selected)]){
        const index=master.scenes.findIndex(s=>s.id===sid),s=master.scenes[index],step=':gif:'+hash(sid).slice(0,16);
        let gif=stored('gif',step);
        if(!gif){
          progress('gif',{message:`制作动图 ${index+1}：${s.title}`});
          const frames=join(dir,'frames-'+index);mkdirSync(frames);
          const count=Math.max(10,Math.round((s.gifSeconds||3)*10)),motion=s.motion&&s.motion!=='auto'?s.motion:plannedMotion;
          await p.evaluate(({transparent,color}:any)=>document.body.style.setProperty('background',transparent?'transparent':color,'important'),{transparent:s.transparent!==false,color:master.design.background});
          for(let f=0;f<count;f++){
            await sceneShot(p,index,f/(count-1),'gif',false,motion);
            writeFileSync(join(frames,`frame-${String(f).padStart(3,'0')}.png`),await p.screenshot({type:'png',omitBackground:s.transparent!==false}));
          }
          const target=join(dir,`scene-${index}.gif`);
          const report=parse(await command(python.file,[...python.args,join(root,'scripts/gif-factory-export.py'),frames,target,...(s.transparent===false?['--opaque']:[]),...(motion==='none'?['--static']:[])],signal));
          gif=save(readFileSync(target),`${name(s.title)}_动图.gif`,'gif',step,{sceneId:sid,engine:report.engine,report});
          save(readFileSync(join(frames,`frame-${String(Math.floor(count/2)).padStart(3,'0')}.png`)),`${name(s.title)}_静态替代.png`,'png',step,{sceneId:sid,fallbackFor:gif.id});
        }
        if(!stored('png',step))save(await sceneShot(p,index,1,'gif'),`${name(s.title)}_静态替代.png`,'png',step,{sceneId:sid,fallbackFor:gif.id});
        outputs.push(gif,stored('png',step));
      }
      await p.context().close();
    }
    if(options.outputs.includes('pptx')){
      let a=stored('pptx');
      if(!a){
        progress('pptx',{message:'从共享章节和设计生成演示稿'});
        const p=options.pptMode==='snapshot'?await page():null;
        const target=join(dir,'slides.pptx');
        await writeVisualPresentation(master,target,v.copyHash,p?(index:number)=>sceneShot(p,index):undefined);
        if(p)await p.context().close();
        a=save(readFileSync(target),`${name(master.title)}_${options.pptMode==='editable'?'可编辑演示':'外观快照'}.pptx`,'pptx','',{mode:options.pptMode,pages:master.scenes.length});
      }outputs.push(a);
    }
    if(options.outputs.includes('pdf')){
      let a=stored('pdf');if(!a){
        progress('pdf',{message:'生成与演示稿同分页的横版 PDF'});const p=await page();await p.emulateMedia({media:'print'});
        const overflow=await p.evaluate(async()=>{
          await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));
          for(const scene of document.querySelectorAll<HTMLElement>('.scene')){
            let fits=false;
            for(let n=0;n<36;n++){
              const box=scene.getBoundingClientRect();fits=[...scene.querySelectorAll<HTMLElement>('h2,.copy,.item,table,.media,.refs')].every(e=>{const r=e.getBoundingClientRect();return r.top>=box.top+20&&r.bottom<=box.bottom-20});
              if(fits)break;
              for(const e of scene.querySelectorAll<HTMLElement>('h2,.copy,.item,table')){const size=parseFloat(getComputedStyle(e).fontSize);e.style.fontSize=Math.max(e.tagName==='H2'?24:14,size-1)+'px'}
            }
            if(!fits)return true;
          }return false;
        });
        if(overflow)err('PDF_COPY_OVERFLOW','PDF 页面内容过多，请拆分长正文或表格后制作，避免导出时裁切内容',422);
        const bytes=await p.pdf({preferCSSPageSize:true,printBackground:true});await p.context().close();a=save(bytes,`${name(master.title)}_演示.pdf`,'pdf','',{pages:master.scenes.length});
      }outputs.push(a);
    }
    let timeline:any[]=[],captions:any[]=[];let audio:any,audioPath:string|undefined,musicIncluded=false;let duration=options.duration;
    if(options.outputs.includes('mp4')){
      let a=stored('mp4');
      if(!a){
        if(options.voice!=='none'){
          workflowActor(input.actorId);
          const narrated=await visualNarration(master,options,{input,dir,signal,transport,check,progress,metadata});
          timeline=narrated.timeline;captions=narrated.captions;duration=narrated.duration;
          writeFileSync(join(dir,'narration.wav'),narrated.bytes);
          audio=save(narrated.bytes,`${name(master.title)}_AI配音.wav`,'wav');outputs.push(audio);
          const srt=captions.map((s,i)=>`${i+1}\n${timestamp(s.start)} --> ${timestamp(s.end)}\n${s.text}\n`).join('\n');
          if(srt)outputs.push(save(Buffer.from(srt),`${name(master.title)}_字幕.srt`,'srt','',{timing:'actual-audio',alignment:options.subtitles==='sentence'?'sentence-group':'scene-level'}));
        } else {
          let elapsed=0;timeline=master.scenes.map((s,i)=>{const start=elapsed;elapsed+=options.useSceneDurations?(s.seconds||5)+ (s.hold||0):duration/master.scenes.length;return {sceneId:s.id,start,end:elapsed}});duration=elapsed;
        }
        if(options.musicAssetId){
          const music=musicAsset(options.musicAssetId,input.actorId),track=join(dir,'music.'+music.format),mixed=join(dir,'mixed.wav');writeFileSync(track,music.data);
          const args=['-v','error','-y',...(audio?['-i',join(dir,'narration.wav')]:[]),'-stream_loop','-1','-format_whitelist','mp3,wav,ogg,flac','-i',track];
          const filter=audio?`[1:a]volume=${options.musicVolume}[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0,volume=2,alimiter=limit=0.95[out]`:`[0:a]volume=${options.musicVolume},alimiter=limit=0.95[out]`;
          await command(ffmpegPath(),[...args,'-filter_complex',filter,'-map','[out]','-t',String(duration),'-ar','16000','-ac','1','-c:a','pcm_s16le',mixed],signal);
          audioPath=mixed;musicIncluded=true;
        }else if(audio)audioPath=join(dir,'narration.wav');
        const fps=15,frames=Math.ceil(duration*fps),width=options.aspect==='landscape'?1280:720,height=options.aspect==='portrait'?1280:720;
        const p=await page(width,height),target=join(dir,'film.mp4');
        const args=['-hide_banner','-loglevel','error','-y','-f','image2pipe','-vcodec','mjpeg','-framerate',String(fps),'-i','pipe:0',...(audioPath?['-i',audioPath,'-map','0:v:0','-map','1:a:0','-c:a','aac','-b:a','128k']:['-an']),'-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart',target];
        const child=spawn(ffmpegPath(),args,{windowsHide:true,stdio:['pipe','ignore','pipe'],signal});let stderr='';child.stderr!.on('data',b=>stderr=(stderr+b).slice(-2500));child.stdin!.on('error',()=>{});
        const completed=new Promise<void>((res,rej)=>{child.once('error',rej);child.once('close',code=>code===0?res():rej(new Error('视频编码失败：'+stderr)))});completed.catch(()=>{});
        try{
          for(let frame=0;frame<frames;frame++){
            check();if(frame%30===0)progress('render',{message:`合成${audio?'带配音':'无声'}视频 ${Math.floor(frame/frames*100)}%`,frame,frames});
            const state=await p.evaluate(({frame,fps,duration,timeline,options}:any)=>(window as any).ecuFrame(frame,fps,duration,timeline,options),{frame,fps,duration,timeline,options:{transition:options.transition,captions:options.subtitles==='off'?[]:captions}});
            if(state.overflow)err('VIDEO_COPY_OVERFLOW','此画幅无法完整展示场景，请缩短内容或改用横屏',422);
            const bytes=await p.screenshot({type:'jpeg',quality:85});
            if(!child.stdin!.write(bytes))await Promise.race([once(child.stdin!,'drain'),completed.then(()=>{throw new Error('编码进程提前退出')})]);
          }
          child.stdin!.end();await completed;
        }finally{if(child.exitCode===null)child.kill();await p.context().close();}
        a=save(readFileSync(target),`${name(master.title)}_${audio?'配音':musicIncluded?'配乐':'无声'}视频.mp4`,'mp4','',{fps,frames,duration,timeline,captions,subtitles:options.subtitles,speed:options.speed,musicIncluded,silent:!audioPath,engine:'Chromium + FFmpeg',width,height});
      }
      outputs.push(a);for(const format of ['wav','srt']){const item=stored(format);if(item&&!outputs.some(x=>x?.id===item.id))outputs.push(item);}
      const meta=parse(a.manifest);duration=meta.duration;timeline=meta.timeline||[];captions=meta.captions||[];
    }
    check();
    outputs.push(save(Buffer.from(json({...master,assets:master.assets.map(({data,...a})=>a),...metadata,outputs:options,timeline,captions,skills:v.body.skill,gifFactoryCommit:'bd6bc31a6e0bebe2be5f79838613bd8041052481'})),`${name(master.title)}_制作记录.json`,'json'));
    // Deliver the current selection together. Prior drafts remain in the project,
    // but mixing them into this ZIP makes it ambiguous which deck/script matches the video.
    const files=outputs.filter(Boolean);
    const unique=[...new Map(files.map(a=>[a.id,a])).values()];
    const bundle=makeBundle(unique,jobId,v.body.projectId,{...metadata,unifiedVisual:true});grantMediaAsset(bundle.asset_id,input.actorId);
    return {visualId:v.id,projectId:v.body.projectId,artifacts:[bundle,...outputs.filter(Boolean)],bundleId:bundle.id,duration,timeline,captions,
      executor:'EcuStudio visual master / GIF Factory / PptxGenJS / Chromium + FFmpeg',
      message:'已从同一视觉项目生成所选成果并更新内容包；内容仍保留草稿与来源核对状态。'};
  } finally {
    if(browser)await browser.close();
    const resolved=resolve(dir),staging=resolve(dataDir,'staging')+sep;
    if(resolved.startsWith(staging))rmSync(resolved,{recursive:true,force:true});
  }
}
