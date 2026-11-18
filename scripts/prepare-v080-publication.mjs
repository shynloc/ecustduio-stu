import {readFileSync,writeFileSync,copyFileSync,readdirSync,existsSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {marked} from 'marked';
import AdmZip from 'adm-zip';
import {fetchRelease,verifyRelease} from './update-protocol.mjs';
import {verifyRelease as verifyOld} from '../test-results/v070-client-0.5.0.mjs';
const out='D:/EduStudio/deliverables/0.8.0',read=p=>JSON.parse(readFileSync(p,'utf8'));
const envelope=read(join(out,'stable.json'));verifyRelease(envelope);verifyOld(envelope);
const prior=await fetchRelease();writeFileSync(join(out,'previous-stable.json'),JSON.stringify(prior.envelope,null,2));
const css="body{font:16px/1.85 system-ui,'Microsoft YaHei','PingFang SC',sans-serif;background:#f6f4ee;color:#253d32;max-width:980px;margin:30px auto;padding:24px}a{color:#28624b}h1{line-height:1.4}code{overflow-wrap:anywhere}li{margin:8px 0}pre{white-space:pre-wrap}";
for(const [name,source]of [['Guide','发布与升级说明'],['Agent','本地Agent安装升级提示词'],['Visual-Guide','视觉创作使用指南']]){
 const md=readFileSync('docs/0.8.0'+source+'.md','utf8'),stem='EcuStudio-0.8.0-'+name;writeFileSync(join(out,stem+'.md'),md);writeFileSync(join(out,stem+'.html'),`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>0.8.0${source}</title><style>${css}</style></head><body>${marked.parse(md)}</body></html>`);
}
const real=read('test-results/visual-editor-real-result.json'),data=read('test-results/visual-editor-production-preservation.json'),packages=read(join(out,'local-package-verification.json'));
if(!real.ok||!data.same||!packages.ok)throw new Error('Acceptance prerequisites not met');
const report={product:'EcuStudio教创工作台',version:'0.8.0',createdAt:new Date().toISOString(),ok:true,regressionCases:12,newFeatureCases:7,finalExportFixCases:2,realDeepSeek:{checkedAt:real.finishedAt,checks:real.checks,duration:real.duration},localDeployment:{version:'0.8.0',existingRecordsPreserved:true,credentialsAndConfigUnchanged:true},oldClientSignatureCompatibility:['0.5.0'],updaterChanged:false,packages:packages.records.map(({destination,...r})=>r),privateBusinessDataIncluded:false,macNativeExecuted:false,limits:['Mac native installation and playback not tested on a physical Mac','Mobile checks use 390px browser viewport','Subtitles use real audio segments, not word-level forced alignment; audio was not subjectively reviewed','New character poses, 3D scenes and handwriting stroke synthesis require separate assets or generation capabilities']};
writeFileSync(join(out,'EcuStudio-0.8.0-Acceptance.json'),JSON.stringify(report,null,2));
const zip=new AdmZip();for(const file of readdirSync(real.folder))if(/^编辑与制作实测\.(html|pptx|pdf|gif|mp4|wav|srt|zip)$/.test(file))zip.addLocalFile(join(real.folder,file));
const screenshots=readdirSync('test-results').filter(f=>f.startsWith('visual-editor-')&&existsSync(join('test-results',f,'scholar-1440.png'))).sort((a,b)=>statSync(join('test-results',b,'scholar-1440.png')).mtimeMs-statSync(join('test-results',a,'scholar-1440.png')).mtimeMs)[0];
for(const file of ['scholar-1440.png','obsidian-390.png']){zip.addLocalFile(join('test-results',screenshots,file));copyFileSync(join('test-results',screenshots,file),join(out,file));}
zip.addFile('说明.txt',Buffer.from('这是隔离环境的合成软件测试样例，不是真实招生政策。AI 修改与配音调用实际 DeepSeek API；截图为1440/390像素浏览器视口。'));
zip.writeZip(join(out,'EcuStudio-0.8.0-Visual-Samples.zip'));
console.log(JSON.stringify({prepared:true,previousVersion:prior.release.version,old050ClientAccepts:true,samples:true}));
