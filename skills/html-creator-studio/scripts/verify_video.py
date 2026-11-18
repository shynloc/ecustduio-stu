#!/usr/bin/env python3
"""Verify produced video resolution, fps and frame count using FFprobe."""
import argparse,json,subprocess,sys,math
from fractions import Fraction

def inspect(file):
  x=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-show_entries','stream=codec_type,width,height,r_frame_rate,nb_frames','-of','json',file],text=True))
  stream=next((s for s in x['streams'] if s.get('codec_type')=='video'),None)
  if not stream:raise ValueError('No video stream')
  return {'width':stream.get('width'),'height':stream.get('height'),'fps':float(Fraction(stream.get('r_frame_rate','0/1'))),'frames':int(stream['nb_frames']) if stream.get('nb_frames','').isdigit() else None,'seconds':float(x.get('format',{}).get('duration',0))}
if __name__=='__main__':
  p=argparse.ArgumentParser();p.add_argument('file');p.add_argument('--width',type=int);p.add_argument('--height',type=int);p.add_argument('--fps',type=float);p.add_argument('--frames',type=int);a=p.parse_args()
  result=inspect(a.file);problems=[]
  for name in ('width','height','fps','frames'):
    expected=getattr(a,name)
    if expected is not None and (result[name] is None or abs(result[name]-expected)>0.01):problems.append(name)
  print(json.dumps({'status':'FAIL' if problems else 'PASS','video':result,'mismatches':problems},ensure_ascii=False,indent=2))
  sys.exit(1 if problems else 0)
