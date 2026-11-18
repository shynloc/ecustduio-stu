"""One-time source migration; exact anchors fail instead of silently skipping changes."""
from pathlib import Path
import hashlib
ROOT=Path(__file__).resolve().parents[1]
def edit(name,old,new):
    path=ROOT/name
    text=path.read_text(encoding='utf-8')
    if old not in text: raise RuntimeError(f'Missing edit anchor: {name}: {old[:70]}')
    path.write_text(text.replace(old,new),encoding='utf-8')

edit('shared/workflows.ts',"html:'HTML互动页面',video:'HTML视频母版'","html:'视觉网页',video:'配音视频',gif:'动态图卡'")
edit('shared/workflows.ts',"'storyboard','html','video'","'storyboard','html','video','gif'")
edit('shared/workflows.ts','.max(7)','.max(8)')
digest=hashlib.sha256((ROOT/'skills/gif-factory/provenance.json').read_bytes()).hexdigest()
edit('server/workflow-agent.ts',"export const skillCatalog=[", "export const skillCatalog=[{id:'gif-factory',name:'GIF Factory 动态素材',version:'bd6bc31',source:'https://github.com/WoYun520/gif-factory',sha256:'"+digest+"'},")
edit('server/workflow-agent.ts',"const skillFiles:Record<string,string[]>={","const skillFiles:Record<string,string[]>={'gif-factory':['SKILL.md','references/manifest.md','references/keyframes.md','references/brand-film.md'],")
edit('server/workflow-agent.ts',"z.enum(['acks-reprompt','html-creator-studio'])","z.enum(['acks-reprompt','html-creator-studio','gif-factory'])")
edit('server/workflows.ts',"import {createVisualDraft,visualView,approveVisual,runVisualVideo}","import {createVisualDraft,visualView,approveVisual,runVisualVideo,registerVisualStudio}")
edit('server/workflows.ts',"storyboard|html|video]","storyboard|html|video|gif]")
edit('server/workflows.ts',"html为互动网页，video为待用户审稿的网页视频母版","html为视觉网页，gif为动态图卡，video为带配音视频的待审母版；网页、PPT、动图、视频共享一个视觉项目")
edit('server/workflows.ts',"png:'image/png'","png:'image/png',gif:'image/gif',wav:'audio/wav',srt:'application/x-subrip',pdf:'application/pdf',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'")
edit('server/workflows.ts',"const artifacts:any[]=[],reviews:any[]=[];const formatMap", "const artifacts:any[]=[],reviews:any[]=[],visuals:any[]=[];\n if(input.plan.outputs.some((k:string)=>['html','presentation','gif','video'].includes(k))){const source=versions.find(v=>v.kind==='presentation')||versions.find(v=>v.kind==='policy')||versions.find(v=>v.kind==='speech')||master;const visual=await stage('visual_shared','建立共享网页、演示、动图与视频设计',()=>createVisualDraft({actorId:input.actorId,config:input.config,versionId:source.id,designBrief:input.plan.designBrief,duration:input.plan.duration,workflowJobId:jobId},jobId+':visual',progress,signal,transport));visuals.push({...visual,purpose:'shared'});artifacts.push(visual.artifact);}\n const formatMap")
edit('server/workflows.ts',"artifacts.push(await exportFile(freezeExport({targetType:'version',targetId:v.id,format,mode:'draft'}),jobId+':'+v.kind,signal));", "const frozen=freezeExport({targetType:'version',targetId:v.id,format,mode:'draft'});if(v.kind==='presentation'&&visuals[0]?.body.master)frozen.payload.visualMaster=visuals[0].body.master;artifacts.push(await exportFile(frozen,jobId+':'+v.kind,signal));")
path=ROOT/'server/workflows.ts';text=path.read_text(encoding='utf-8');start=text.index(" const visuals:any[]=[];for(const kind of ['html','video'])");end=text.index('\n check();const auditFile',start);text=text[:start]+text[end:];path.write_text(text,encoding='utf-8')
edit('server/workflows.ts',"export async function registerWorkflows(app:any,enqueue:any){","export async function registerWorkflows(app:any,enqueue:any){\n await registerVisualStudio(app,enqueue);")
edit('server/workflows.ts',"视频母版需核对具体文案后再渲染 MP4。","网页与演示已共享设计，可进入视觉制作继续生成动图和配音视频。")
edit('server/tasks.ts',"import { upgradeMaintenance }", "import { runVisualExport } from './visual-export.js';\nimport { runVisualCreate,runVisualRuntime } from './visual-studio.js';\nimport { upgradeMaintenance }")
edit('server/tasks.ts',"else if (j.type === \"visual-video\")", "else if (j.type === 'visual-create') result = await runVisualCreate(input,j.id,progress,signal);\n      else if (j.type === 'visual-export') result = await runVisualExport(input,j.id,progress,signal);\n      else if (j.type === 'visual-runtime') result = await runVisualRuntime(input,progress,signal);\n      else if (j.type === \"visual-video\")")
for name in ['server/auth.ts','server/app.ts']:
    edit(name,'"policy-impact","visual-video"','"policy-impact","visual-video","visual-create","visual-export","visual-runtime"')
edit('server/app.ts','const { a, data } = assetBuffer(r.asset_id);','checkMediaAsset(r.asset_id, req.user);\n    const { a, data } = assetBuffer(r.asset_id);')
edit('server/app.ts','["image/png", "image/jpeg", "image/webp"].includes(a.mime)','["image/png", "image/jpeg", "image/webp", "image/gif"].includes(a.mime)')
edit('server/app.ts','    return result;\n  });\n  app.get("/api/snapshots/:id"', '''    result.artifacts=result.artifacts.filter((a:any)=>{try{checkMediaAsset(a.asset_id,req.user);return true;}catch{return false;}});
    return result;
  });
  app.get("/api/snapshots/:id"''')
edit('server/render.ts','import PptxGenJS from "pptxgenjs";', 'import PptxGenJS from "pptxgenjs";\nimport { writeVisualPresentation } from "./visual-presentation.js";\nimport { masterHtml } from "./visual-document.js";')
edit('server/render.ts','  } else if (format === "pptx") {','  } else if (format === "pptx" && p.visualMaster) {\n    await writeVisualPresentation(p.visualMaster,out,p.versionId);\n  } else if (format === "pptx") {')
edit('server/render.ts','await page.setContent(reportHtml(p),','await page.setContent(p.visualMaster ? masterHtml(p.visualMaster) : reportHtml(p),')
edit('server/render.ts','        format: "A4",','        ...(p.visualMaster ? {preferCSSPageSize:true} : {format: "A4" as const}),')
edit('server/render.ts','        displayHeaderFooter: true,','        displayHeaderFooter: !p.visualMaster,')
edit('server/render.ts','        margin: { top: "18mm", bottom: "20mm", left: "15mm", right: "15mm" },','        margin: p.visualMaster ? {top:0,bottom:0,left:0,right:0} : { top: "18mm", bottom: "20mm", left: "15mm", right: "15mm" },')
path=ROOT/'server/visual-export.ts';text=path.read_text(encoding='utf-8');start=text.index('        const ppt=new');end=text.index('\n        a=save(',start);text=text[:start]+'''        const p=options.pptMode==='snapshot'?await page():null;
        const target=join(dir,'slides.pptx');
        await writeVisualPresentation(master,target,v.copyHash,p?(index:number)=>sceneShot(p,index):undefined);
        if(p)await p.context().close();'''+text[end:];text=text.replace("import PptxGenJS from 'pptxgenjs';","import { writeVisualPresentation } from './visual-presentation.js';");path.write_text(text,encoding='utf-8')
print('Linked unified visual workflows')
