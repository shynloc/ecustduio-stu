#!/usr/bin/env python3
"""Generate a runnable Remotion project from an HCS Visual Master directory."""
import argparse, json, pathlib, shutil
from validate_master import validate
from resolve_content import from_source
BASE=pathlib.Path(__file__).resolve().parent.parent

def build(source,output,production=False):
  source=pathlib.Path(source).resolve();output=pathlib.Path(output).resolve()
  if production:
      from lint_audience_copy import check as check_copy
      copy_quality=check_copy(source,'production')
      if copy_quality['status']!='PASS':
          raise ValueError('Audience copy approval gate FAILED: '+str(copy_quality['errors']))

  quality=validate(source)
  if quality['status']!='PASS':raise ValueError('Visual master failed validation: '+str(quality['errors']))
  template=BASE/'templates'/'remotion'
  required=[source/'stage'/'stage-markup.html',source/'stage'/'stage.css']+[source/'visual-master'/(p+'.json') for p in ('timeline','storyboard','design-tokens')]
  for p in required:
    if not p.is_file():raise FileNotFoundError(p)
  if output.exists():
    if any(output.iterdir()):raise FileExistsError(f'Output directory is not empty: {output}. Use a fresh path.')
  shutil.copytree(template,output,dirs_exist_ok=True)
  dest=output/'src'/'generated';dest.mkdir(parents=True,exist_ok=True)
  for name in ('stage.css','portrait.css'):
    src=source/'stage'/name
    (dest/name).write_text(src.read_text(encoding='utf8') if src.exists() else '',encoding='utf8')
  shutil.copy2(BASE/'shared'/'frame-styles.mjs',dest/'frame-styles.mjs')
  t=json.loads((source/'visual-master'/'timeline.json').read_text(encoding='utf8'))
  s=json.loads((source/'visual-master'/'storyboard.json').read_text(encoding='utf8'))
  d=json.loads((source/'visual-master'/'design-tokens.json').read_text(encoding='utf8'))
  markup=from_source(source,(source/'stage'/'stage-markup.html').read_text(encoding='utf8'))
  preset='hcs-brand-pilot' if (source/'stage'/'hcs-brand.preset').exists() else 'generic'
  data={'timeline':t,'storyboard':s,'tokens':d,'preset':preset,'hasPortrait':(source/'stage'/'portrait.css').is_file()}
  (dest/'master.ts').write_text('/* AUTO-GENERATED. Edit source visual-master files, then bootstrap again. */\nexport const MASTER = '+json.dumps(data,ensure_ascii=False)+';\nexport const STAGE_MARKUP = '+json.dumps(markup,ensure_ascii=False)+';\n',encoding='utf8')
  (output/'.gitignore').write_text('node_modules/\nout/\ndist/\n',encoding='utf8')
  return output
if __name__=='__main__':
  p=argparse.ArgumentParser(description=__doc__)
  p.add_argument('--source',required=True,help='Visual Master project dir containing stage/ and visual-master/')
  p.add_argument('--out',required=True,help='Fresh output folder for Remotion project')
  p.add_argument('--production',action='store_true',help='Require approved audience copy / matching hash before generating a production handoff')
  a=p.parse_args();print('Created Remotion adapter:',build(a.source,a.out,production=a.production))
  if not a.production: print('NOTICE: PROTOTYPE only. Run --production after explicit user copy approval for formal delivery.')
