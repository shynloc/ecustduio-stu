import {join} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import type {VisualMaster} from '../shared/visual.js';
import {narrationParts} from '../shared/visual-edit.js';
import {get,hash,err} from './db.js';
import {assetBuffer} from './domain.js';
import {grantMediaAsset,checkMediaAsset} from './media-access.js';
import {workflowActor} from './workflow-agent.js';
import {mediaRequest,jsonOptions,responseBytes} from './media-provider.js';
import {makeWav,readWav} from './wav.js';
import {billingCharacters} from '../shared/media.js';
import {command,ffmpegPath} from './visual-runtime.js';

export function musicAsset(id:string,actorId:string){
 const actor=workflowActor(actorId,false);checkMediaAsset(id,actor);const item=assetBuffer(id);
 const formats:Record<string,string>={'audio/mpeg':'mp3','audio/mp3':'mp3','audio/wav':'wav','audio/x-wav':'wav','audio/ogg':'ogg','audio/flac':'flac','audio/x-flac':'flac'};
 const format=formats[item.a.mime];if(!format||item.data.length>30*1024*1024)err('MUSIC_INVALID','背景音乐支持 WAV、MP3、OGG、FLAC，最多30MB',422);
 return {...item,format};
}
export async function visualNarration(master:VisualMaster,options:any,ctx:any){
 const {input,dir,signal,transport,check,progress,metadata}=ctx;
 const {storeWorkflowArtifact}=await import('./workflows.js');
 const allParts=master.scenes.map(s=>narrationParts(s.narration,options.subtitles));
 if(master.scenes.length>40||billingCharacters(master.scenes.map(s=>s.narration).join(''))>10000||allParts.flat().length>100)err('TTS_TEXT_LIMIT','配音最多40个场景、100个句群、10000计费字符，请拆分长稿件',422);
 const chunks:Buffer[]=[],timeline:any[]=[],captions:any[]=[];let elapsed=0;
 for(const [index,s] of master.scenes.entries()){
  const start=elapsed,assetIds:string[]=[];let captionText='';
  for(const text of allParts[index]){
   check();workflowActor(input.actorId);progress('narration',{message:`生成或复用配音 ${index+1}/${master.scenes.length}`});
   const key='visual-audio:'+input.actorId+':'+hash({text,voice:options.voice});
   let item=get("SELECT * FROM artifacts WHERE job_id=? AND format='wav'",key);
   if(!item){
    const response=await mediaRequest('/v1/tools/tts',jsonOptions({text,voice_id:options.voice,format:'wav',filter_markdown:true}),signal,transport);
    const wav=readWav(await responseBytes(response,90*1024*1024),true),raw=join(dir,'raw.wav'),normal=join(dir,'normal.wav');
    writeFileSync(raw,makeWav(wav.pcm,wav.sampleRate,wav.channels));
    await command(ffmpegPath(),['-v','error','-y','-i',raw,'-ac','1','-ar','16000','-c:a','pcm_s16le',normal],signal);
    check();item=storeWorkflowArtifact(readFileSync(normal),`${s.title.replace(/[\\/:*?"<>|]/g,'_').slice(0,65)}_AI配音.wav`,'wav',key,metadata.versionId,{...metadata,text,voice:options.voice});grantMediaAsset(item.asset_id,input.actorId);
   }
   let wav=readWav(assetBuffer(item.asset_id).data);
   if(options.speed!==1){const source=join(dir,'speed-source.wav'),out=join(dir,'speed.wav');writeFileSync(source,makeWav(wav.pcm));await command(ffmpegPath(),['-v','error','-y','-i',source,'-af','atempo='+options.speed,'-c:a','pcm_s16le',out],signal);wav=readWav(readFileSync(out));}
   const begin=elapsed;elapsed+=wav.pcm.length/32000;chunks.push(wav.pcm);assetIds.push(item.asset_id);captionText+=text;
   if(options.subtitles==='sentence')captions.push({sceneId:s.id,start:begin,end:elapsed,text});
   if(elapsed>600)err('VIDEO_TOO_LONG','实际配音超过10分钟，请拆分内容',422);
  }
  const audioEnd=elapsed,padding=(s.hold??.25)+Math.max(options.useSceneDurations?(s.seconds||5)-(elapsed-start):0,elapsed===start?1:0);
  const pad=Buffer.alloc(Math.round(padding*16000)*2);chunks.push(pad);elapsed+=pad.length/32000;
  if(options.subtitles==='scene'&&captionText)captions.push({sceneId:s.id,start,end:audioEnd,text:captionText});
  timeline.push({sceneId:s.id,start,end:elapsed,audioEnd,audioAssetId:assetIds[0],audioAssetIds:assetIds,text:s.narration});
 }
 if(elapsed>600)err('VIDEO_TOO_LONG','包含停留的实际视频超过10分钟，请拆分内容',422);
 return {bytes:makeWav(Buffer.concat(chunks)),timeline,captions,duration:elapsed};
}
