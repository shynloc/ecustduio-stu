"""Host adapter: export reviewed scene frames with the pinned upstream encoder."""
import json
import sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'skills/gif-factory/scripts'))
from export_keyframes import save_and_verify
from review_gif import audit

source, output = map(Path, sys.argv[1:3])
paths = sorted(source.glob('frame-*.png'))
if not 2 <= len(paths) <= 60:
    raise ValueError('Expected 2-60 scene frames')
frames = []
for path in paths:
    with Image.open(path) as im:
        if im.size != (512, 512):
            raise ValueError('Expected 512px frames')
        frames.append(im.convert('RGBA'))
opaque, static = '--opaque' in sys.argv[3:], '--static' in sys.argv[3:]
try:
    save_and_verify(output, frames, [100] * len(frames))
except ValueError as error:
    # The pinned encoder targets moving transparent stickers. It writes the GIF
    # before its sticker-specific assertions; validate intentional variants below.
    expected = (opaque and 'Clipped or invalid transparency:' in str(error)) or (static and 'Missing motion/timing:' in str(error))
    if not expected:
        raise
report = audit(output, source / 'review')
allowed = lambda e: (static and e == 'no visible frame changes') or (opaque and (e.endswith('expected transparent and opaque pixels') or e.endswith('blank or touches canvas edge')))
errors = [e for e in report['errors'] if not allowed(e)]
with Image.open(output) as gif:
    if gif.size != (512, 512) or gif.info.get('loop') != 0:
        errors.append('Invalid size or loop')
if report['loop_ms'] != len(frames) * 100:
    errors.append('Duration changed during encoding')
if errors:
    raise ValueError(errors)
print(json.dumps({'engine': 'GIF Factory export_keyframes.save_and_verify',
    'sha256': report['sha256'], 'frames': report['decoded_frames'],
    'durationMs': report['loop_ms'], 'technical': 'passed',
    'upstreamStickerStatus': report['technical_status'], 'intentionalVariants': {'opaque': opaque, 'static': static},
    'visualReview': 'pending'}, ensure_ascii=False))
