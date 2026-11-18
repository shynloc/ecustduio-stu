from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def edit(file,old,new):
 p=ROOT/file;t=p.read_text(encoding='utf-8')
 if old not in t:raise RuntimeError(file+': missing anchor '+old[:50])
 p.write_text(t.replace(old,new),encoding='utf-8')
edit('server/source-review.ts'," return {before,after,removed,added,projects,versions,notes,notice:"," const versionIds=new Set(versions.map(v=>v.id));const visuals=all('SELECT * FROM visual_drafts').filter(v=>versionIds.has(v.version_id)&&(user.role==='admin'||v.owner_id===user.id)).map(v=>({id:v.id,versionId:v.version_id,name:parse(v.body).design.name,createdAt:v.created_at,needsReview:true}));\n return {before,after,removed,added,projects,versions,notes,visuals,notice:")
edit('server/source-review.ts','noteCount:detail.notes.length','noteCount:detail.notes.length,visualCount:detail.visuals.length')
edit('web/WorkflowStudio.tsx','{x.noteCount} 条笔记','{x.noteCount} 条笔记 · {x.visualCount||0} 个视觉项目')
edit('web/WorkflowStudio.tsx','{detail.notes.map((n:any)=>','{detail.visuals?.map((v:any)=><p key={v.id}>视觉项目：<button className="text-link" onClick={()=>go("visual/"+v.id)}>{v.name} · 网页 / 演示 / 动图 / 视频待核对</button></p>)}{detail.notes.map((n:any)=>')
edit('server/visual-studio.ts',"stale:!!get('SELECT stale FROM versions WHERE id=?',row.version_id)?.stale,","stale:!!get('SELECT stale FROM versions WHERE id=?',row.version_id)?.stale||!!body.master?.sources.some((s:any)=>get('SELECT id FROM snapshots WHERE previous_id=? LIMIT 1',s.id)),")
edit('web/UnifiedVisualStudio.tsx','<small>{a.format.toUpperCase()} · {new Date(a.created_at).toLocaleString()}</small>', '''<small>{a.format.toUpperCase()} · {new Date(a.created_at).toLocaleString()}</small>{['gif','png'].includes(a.format)&&<button className="btn secondary" disabled={assets.length>=4||assets.some(x=>x.id===a.asset_id)} onClick={()=>{setAssets([...assets,{id:a.asset_id,name:a.name}]);setConfirmed(false);}}>加入共享配图</button>}''')
for file in ['scripts/package-online.py','scripts/package-macos.py']:
 edit(file,"'diagnose-runtime.mjs','customer-selftest.mjs'","'diagnose-runtime.mjs','customer-selftest.mjs','setup-gif-runtime.mjs','gif-factory-export.py','gif-factory-decode.py'")
print('Linked policy impacts and media reuse')
