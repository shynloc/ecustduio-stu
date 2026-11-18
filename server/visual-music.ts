import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {extname,join,resolve,sep} from 'node:path';
import {dataDir,err} from './db.js';
import {asset} from './domain.js';
import {grantMediaAsset} from './media-access.js';
import {workflowActor} from './workflow-agent.js';
import {command,ffmpegPath} from './visual-runtime.js';
import {readWav} from './wav.js';

export function registerVisualMusic(app:any){
 app.post('/api/visuals/music',async(req:any)=>{
  workflowActor(req.user.id,false);const file=await req.file();if(!file)err('FILE_REQUIRED','请选择背景音乐');
  const formats:Record<string,string>={'.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.flac':'audio/flac'},ext=extname(file.filename).toLowerCase();
  if(!formats[ext])err('MUSIC_INVALID','音乐支持 WAV、MP3、OGG、FLAC',422);
  const bytes=await file.toBuffer();if(!bytes.length||bytes.length>30*1024*1024)err('MUSIC_SIZE','请选择非空音乐文件，最多30MB',413);
  const dir=mkdtempSync(join(dataDir,'staging','music-'));
  try{
   const input=join(dir,'input'+ext),output=join(dir,'decoded.wav');writeFileSync(input,bytes);
   await command(ffmpegPath(),['-v','error','-y','-protocol_whitelist','file','-format_whitelist','mp3,wav,ogg,flac','-i',input,'-t','601','-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',output],AbortSignal.timeout(60000),60000);
   const wav=readWav(readFileSync(output)),seconds=wav.pcm.length/32000;
   if(seconds<=0||seconds>600)err('MUSIC_DURATION','背景音乐需有有效声音且不超过10分钟',422);
   const a=asset(bytes,file.filename.replace(/[<>:"/\\|?*]/g,'_').slice(0,180),formats[ext],'visual-music');grantMediaAsset(a.id,req.user.id);
   return {id:a.id,name:a.name,size:a.size,mime:a.mime,kind:'audio',durationMs:Math.round(seconds*1000)};
  }catch(e:any){if(e.code)throw e;err('MUSIC_INVALID','音乐无法解码，请更换有效的 WAV、MP3、OGG 或 FLAC 文件',422);}
  finally{if(resolve(dir).startsWith(resolve(dataDir,'staging')+sep))rmSync(dir,{recursive:true,force:true});}
 });
}
