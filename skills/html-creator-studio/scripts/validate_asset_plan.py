#!/usr/bin/env python3
"""Validate visual asset provenance, permission and fallback strategy (stdlib only)."""
from __future__ import annotations
import argparse,json,pathlib,sys

VALID_ORIGIN={'original-svg','original-css','provided-by-user','commissioned','licensed-stock','generated-local','generated-external','public-domain','unknown'}
VALID_STATUS={'planned','ready','needs-permission','blocked'}

def check(path):
    d=json.loads(path.read_text(encoding='utf8'))
    errors=[];warn=[]
    if not isinstance(d,dict) or not isinstance(d.get('assets'),list):return {'status':'FAIL','errors':['expected {assets:[...]}'],'warnings':[]}
    ids=set()
    for i,a in enumerate(d['assets']):
        tag=f'assets[{i}]'
        if not isinstance(a,dict):errors.append(tag+' must be object');continue
        for f in ('id','scene_id','purpose','origin','status','fallback','alt_text'):
            if not a.get(f):errors.append(f'{tag}: missing {f}')
        aid=a.get('id');origin=a.get('origin');status=a.get('status');source=a.get('source_or_license')
        if aid in ids:errors.append(f'{tag}: duplicate id {aid}')
        ids.add(aid)
        if origin not in VALID_ORIGIN:errors.append(f'{tag}: unsupported origin {origin}')
        if status not in VALID_STATUS:errors.append(f'{tag}: unsupported status {status}')
        if origin in {'provided-by-user','licensed-stock','commissioned','public-domain','generated-external'} and not source:
            errors.append(f'{tag}: source_or_license is required for origin {origin}')
        if origin=='generated-external' and not a.get('external_transfer_approved',False):
            warn.append(f'{tag}: external generation requires explicit authorization for transmission')
        if origin in {'provided-by-user','commissioned','licensed-stock','public-domain'} and not a.get('publication_rights_confirmed',False):
            warn.append(f'{tag}: publication/right-to-reuse must be confirmed for public release')
        if status in {'needs-permission','blocked'}:warn.append(f'{tag}: asset not ready for official release')
        if origin=='unknown':warn.append(f'{tag}: provenance unknown; do not publish')
    return {'status':'FAIL' if errors else ('REVIEW' if warn else 'PASS'),'errors':errors,'warnings':warn,'checked_assets':len(d['assets'])}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--plan',required=True);p.add_argument('--production',action='store_true');p.add_argument('--out')
    args=p.parse_args();result=check(pathlib.Path(args.plan))
    if args.production and result['warnings']:
        result['errors']+=result['warnings'];result['status']='FAIL'
    if args.out:pathlib.Path(args.out).write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf8')
    print(json.dumps(result,indent=2,ensure_ascii=False))
    return 1 if result['status']=='FAIL' else 0
if __name__=='__main__':sys.exit(main())
