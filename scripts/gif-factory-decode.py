"""Bounded, frame-addressable GIF assets for the shared browser renderer."""
from pathlib import Path
from PIL import Image, ImageSequence
import base64, io, json, sys
source, destination=map(Path,sys.argv[1:3])
frames=[]
with Image.open(source) as gif:
    if getattr(gif,'n_frames',1)>60:
        raise ValueError('动画配图最多60帧，请使用短循环动图或静态封面')
    for frame in ImageSequence.Iterator(gif):
        im=frame.convert('RGBA')
        im.thumbnail((512,512),Image.Resampling.LANCZOS)
        out=io.BytesIO();im.save(out,format='PNG')
        frames.append({'data':'data:image/png;base64,'+base64.b64encode(out.getvalue()).decode('ascii'),
                       'durationMs':max(20,int(frame.info.get('duration',100)))})
        if sum(len(f['data']) for f in frames)>12*1024*1024:
            raise ValueError('动图解码后过大，请使用较小素材')
destination.write_text(json.dumps(frames),encoding='utf-8')
