import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {marked} from 'marked';
import AdmZip from 'adm-zip';
import {fetchRelease,verifyRelease,extractRelease} from './update-protocol.mjs';
const out='D:/EduStudio/deliverables/0.8.3';mkdirSync(out,{recursive:true});
verifyRelease(JSON.parse(readFileSync(join(out,'stable.json'),'utf8')));
const prior=await fetchRelease();if(prior.release.version!=='0.8.2')throw new Error('Stable feed changed; inspect before publishing');
if(!existsSync(join(out,'previous-stable.json')))writeFileSync(join(out,'previous-stable.json'),JSON.stringify(prior.envelope,null,2));
const css="body{font:16px/1.85 system-ui,'Microsoft YaHei','PingFang SC',sans-serif;background:#f6f4ee;color:#253d32;max-width:980px;margin:30px auto;padding:24px}a{color:#28624b}h1{line-height:1.4}code{overflow-wrap:anywhere}li{margin:8px 0}pre{white-space:pre-wrap}";
for(const [name,source]of [['Guide','发布与升级说明'],['Agent','本地Agent安装升级提示词']]){
 const md=readFileSync('docs/0.8.3'+source+'.md','utf8'),stem='EcuStudio-0.8.3-'+name;
 writeFileSync(join(out,stem+'.md'),md);writeFileSync(join(out,stem+'.html'),`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>0.8.3${source}</title><style>${css}</style></head><body>${marked.parse(md)}</body></html>`);
}
const original='test-results/v083-original-0.8.2';
if(!existsSync(original))extractRelease(readFileSync('D:/EduStudio/deliverables/0.8.2/Windows/EcuStudio-0.8.2-Windows-x64-UpgradeReady.zip'),original,AdmZip);
console.log(JSON.stringify({prepared:true,previousVersion:prior.release.version,oldInstallation:original}));
