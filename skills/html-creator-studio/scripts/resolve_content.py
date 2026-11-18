"""Optional safe text bindings from content.json into trusted Stage markup.
Write `{{S01.headline}}` or `{{tagline}}` in stage-markup.html.
Bindings are HTML-escaped, including quotes; raw HTML injection is never supported.
"""
import html, json, pathlib, re
SLOT=re.compile(r'\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}')
def resolve(markup,content):
  values={k:v for k,v in content.items() if isinstance(v,(str,int,float))}
  for scene in content.get('scenes',[]):
    sid=scene.get('id')
    for key,val in scene.items():
      if isinstance(val,(str,int,float)):values[f'{sid}.{key}']=val
  def replace(match):
    key=match.group(1)
    if key not in values:raise ValueError(f'Unknown content slot {key}. Update content.json or remove token.')
    return html.escape(str(values[key]),quote=True)
  return SLOT.sub(replace,markup)
def from_source(source,markup):
  data=json.loads((pathlib.Path(source)/'visual-master'/'content.json').read_text(encoding='utf8'))
  return resolve(markup,data)
