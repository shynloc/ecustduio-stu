from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def edit(name,old,new):
    p=ROOT/name;t=p.read_text(encoding='utf-8')
    if old not in t:raise RuntimeError('Missing '+name+': '+old[:60])
    p.write_text(t.replace(old,new),encoding='utf-8')
p=ROOT/'web/WorkflowStudio.tsx';t=p.read_text(encoding='utf-8');start=t.index('export function VisualStudio(');t=t[:start]+"export {UnifiedVisualStudio as VisualStudio} from './UnifiedVisualStudio';\n";p.write_text(t,encoding='utf-8')
edit('web/WorkflowStudio.tsx',"查看{v.purpose==='video'?'视频母版 / 制作 MP4':'HTML 网页'}与真实预览","打开共享视觉制作")
edit('web/WorkflowStudio.tsx','查看视频母版','打开视觉制作与成果')
edit('web/WorkflowStudio.tsx','首版视频为无声 MP4，需核对文案和画面后生成。','网页、可编辑演示、GIF Factory 动图和配音视频共享视觉项目。核对文案和画面后选择交付物。')
edit('web/WorkflowStudio.tsx','视频先交付可预览的 HTML 母版，再由你批准渲染。','视觉项目复用章节、配色与素材；可继续制作动图和配音视频。')
edit('web/main.tsx',"import {WorkflowStudio,PolicyImpacts,VisualStudio,WorkflowResult}","import {ProjectVisualLinks} from './UnifiedVisualStudio';\nimport {WorkflowStudio,PolicyImpacts,VisualStudio,WorkflowResult}")
edit('web/main.tsx','      <div className="tabs project-tabs">','      <ProjectVisualLinks projectId={id} go={go} refresh={taskStates}/>\n      <div className="tabs project-tabs">')
edit('web/main.tsx','          <Button secondary small disabled={dirty} title={dirty ? "请先保存版本" : "使用当前已保存版本生成音频"}', '''          <Button secondary small disabled={dirty || version.stale} onClick={async()=>{const j=await act(()=>post('/visuals/from-version',{versionId:version.id}));if(j)go('job/'+j.id);}}>
            制作网页 / PPT / 动图 / 视频
          </Button>
          <Button secondary small disabled={dirty} title={dirty ? "请先保存版本" : "使用当前已保存版本生成音频"}''')
p=ROOT/'web/workflows.css';p.write_text(p.read_text(encoding='utf-8')+'''
.visual-grid{grid-template-columns:minmax(0,1.4fr) minmax(340px,1fr)}.visual-colors{display:flex;gap:20px;flex-wrap:wrap;margin:14px 0}.visual-colors label{display:grid;gap:6px}.visual-colors input{width:66px;height:42px;padding:3px}.visual-scene-list{display:grid;gap:10px;max-height:240px;overflow:auto}.visual-scene-list label{line-height:1.5}.visual-deliveries{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:20px}.visual-deliveries article{padding:16px;border:1px solid var(--border);border-radius:12px;display:grid;gap:10px;overflow-wrap:anywhere}.visual-deliveries img{width:100%;max-height:250px;object-fit:contain}.visual-deliveries small{color:var(--muted)}.wf-section input[type=file]{max-width:100%}@media(max-width:1000px){.visual-grid{grid-template-columns:1fr}}@media(max-width:600px){.visual-grid .wf-preview iframe{height:580px}}
''',encoding='utf-8')
print('Linked visual UI')
