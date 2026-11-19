import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { root, err } from './db.js';

export const ffmpegPath = () => createRequire(import.meta.url)('@ffmpeg-installer/ffmpeg').path as string;
export async function visualBrowser(options:any={}) {
  try { return await chromium.launch({...options,headless:true}); }
  catch(e) { if(process.platform==='win32')return chromium.launch({...options,channel:'msedge',headless:true}); throw e; }
}
export async function command(file:string,args:string[],signal:AbortSignal,limit=180000) {
  signal.throwIfAborted();
  return new Promise<string>((resolve,reject)=>{
    const child=spawn(file,args,{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],signal});
    let stdout='',stderr='',expired=false;
    const timer=setTimeout(()=>{expired=true;child.kill();},limit);
    child.stdout.on('data',b=>stdout=(stdout+b).slice(-100000));
    child.stderr.on('data',b=>stderr=(stderr+b).slice(-3000));
    child.on('error',e=>{clearTimeout(timer);reject(e)});
    child.on('close',code=>{clearTimeout(timer);code===0?resolve(stdout):reject(new Error(expired?'制作工具运行超时':stderr||`制作工具退出（${code}）`))});
  });
}
export async function gifPython(signal:AbortSignal) {
  const candidates=[process.env.ECUSTUDIO_GIF_PYTHON,
    join(root,'../runtime/gif-python',process.platform==='win32'?'Scripts/python.exe':'bin/python'),
    ...(process.platform==='win32'?['python','py']:['python3','/opt/homebrew/bin/python3','/usr/local/bin/python3'])].filter(Boolean) as string[];
  for(const file of candidates)try{
    const args=file==='py'?['-3']:[];
    await command(file,[...args,'-c','import PIL; from PIL import Image; print(PIL.__version__)'],signal,12000);
    return {file,args};
  }catch(e){signal.throwIfAborted();}
  err('GIF_DEPENDENCY_MISSING','动图需要 Python 3 与 Pillow。请管理员在视觉制作中点击“安装动图依赖”，或运行 node scripts/setup-gif-runtime.mjs。网页、PPT 和视频可继续使用。',503);
}
export async function visualCapabilities() {
  let gif=false;
  try {await gifPython(AbortSignal.timeout(18000));gif=true;}catch{}
  return {gif,ffmpeg:existsSync(ffmpegPath()),gifFactoryCommit:'bd6bc31a6e0bebe2be5f79838613bd8041052481',
    supported:['html','editable-pptx','slide-pdf','gif','voiced-mp4'],gifHelp:'管理员可安装独立 Pillow 环境；需要本机已安装 Python 3。'};
}
