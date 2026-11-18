"""Fetch the explicitly supported, pinned GIF Factory adapter inputs."""
from pathlib import Path
import hashlib
import json
import urllib.request

REV = 'bd6bc31a6e0bebe2be5f79838613bd8041052481'
ROOT = Path(__file__).resolve().parents[1] / 'skills' / 'gif-factory'
FILES = ['LICENSE', 'SKILL.md', 'GUIDE.md', 'references/manifest.md',
         'references/brand-film.md', 'references/keyframes.md',
         'scripts/export_pack.py', 'scripts/export_keyframes.py', 'scripts/review_gif.py']
EXPECTED = {'scripts/export_pack.py': '6a1c9e7ff37906e34f551a4ed5d966dab20ddc4b',
            'scripts/export_keyframes.py': '9e8f0a267c5c5b7b0572724ae2527c147e66c0c4',
            'scripts/review_gif.py': 'f28c6ad39b4617f27203237bd6df8a15f6448f96'}
records = []
for name in FILES:
    url = f'https://raw.githubusercontent.com/WoYun520/gif-factory/{REV}/{name}'
    data = urllib.request.urlopen(url, timeout=40).read()
    blob = hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()
    if name in EXPECTED and blob != EXPECTED[name]:
        raise RuntimeError('Upstream integrity mismatch: ' + name)
    path = ROOT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    records.append({'path': name, 'sha256': hashlib.sha256(data).hexdigest(), 'gitBlob': blob})
(ROOT / 'provenance.json').write_text(json.dumps({'repository': 'https://github.com/WoYun520/gif-factory',
    'commit': REV, 'scope': 'Selected upstream scripts and references; no example media or model service included',
    'files': records}, indent=2), encoding='utf-8')
print(json.dumps({'commit': REV, 'files': len(records)}))
