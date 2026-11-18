#!/usr/bin/env python3
"""Optional short local proof: render a few HTML frames with Chromium, pipe to FFmpeg.
This proves the frame-master pipeline, NOT Remotion CLI compatibility.
"""
import argparse,json,pathlib,subprocess,sys
from playwright.sync_api import sync_playwright

def render(html,out,start=90,frames=45,fps=30,width=768):
  output=pathlib.Path(out);output.parent.mkdir(parents=True,exist_ok=True)
  height=int(round(width*9/16));
  if width%2 or height%2:raise ValueError("MP4/H.264 requires even dimensions; try width=768 or width=1280")
  command=['ffmpeg','-y','-loglevel','error','-f','image2pipe','-framerate',str(fps),'-vcodec','png','-i','-','-c:v','libx264','-pix_fmt','yuv420p','-r',str(fps),'-movflags','+faststart',str(output)]
  encoder=subprocess.Popen(command,stdin=subprocess.PIPE,stderr=subprocess.PIPE)
  with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':width+20,'height':height+20},device_scale_factor=1)
    page.set_content(pathlib.Path(html).read_text(encoding='utf8'),wait_until='domcontentloaded')
    page.evaluate('''(w)=>{ const root=document.getElementById('stageRoot');const stage=document.getElementById('stage');
      root.style.width=w+'px';root.style.height=Math.round(w*9/16)+'px';stage.style.transform='scale('+(w/1920)+')';document.querySelector('.bar').style.display='none';
      document.querySelector('.control').style.display='none';document.querySelector('.review').style.display='none';
    }''',width)
    try:
      for frame in range(start,start+frames):
        page.evaluate('(f)=>window.HCS.renderAtFrame(f)',frame)
        screenshot=page.locator('#stageRoot').screenshot(type='png',animations='disabled')
        encoder.stdin.write(screenshot)
    finally:
      browser.close();encoder.stdin.close()
  error=encoder.stderr.read().decode(errors='replace');code=encoder.wait()
  if code:raise RuntimeError('FFmpeg error: '+error)
  probe=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-show_entries','stream=width,height,r_frame_rate,nb_frames','-of','json',str(output)],capture_output=True,text=True,check=True)
  return json.loads(probe.stdout)
if __name__=='__main__':
  p=argparse.ArgumentParser();p.add_argument('--html',required=True);p.add_argument('--out',required=True);p.add_argument('--start',type=int,default=90);p.add_argument('--frames',type=int,default=45);a=p.parse_args()
  data=render(a.html,a.out,a.start,a.frames);print(json.dumps(data,indent=2))
