// Input arrives over stdin from a masked terminal prompt, never argv or env.
import {spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
if(process.platform!=='darwin')throw new Error('请在安装工作台的 Mac 上运行。');
const root=resolve(process.cwd(),'..');let db,stored=false;
try{
 let value='';for await(const chunk of process.stdin){value+=chunk;if(value.length>4002)throw new Error('只需粘贴 API Key 本身，内容过长。');}value=value.trim();
 if(!value)throw new Error('未输入密钥，原有凭据未修改。');
 db=await import('../dist-server/server/db.js');
 if(db.get("SELECT count(*) n FROM jobs WHERE state IN ('queued','running')").n||db.get("SELECT count(*) n FROM outbox WHERE state='sending'").n)throw new Error('请先等待工作台中的任务完成，再保存并重启。');
 const secrets=await import('../dist-server/server/secrets.js');await secrets.setSecret('deepseek',value);value='';stored=true;
 db.db.close();db=undefined;
 console.log('DeepSeek 凭据已写入本机钥匙串并完成读取校验，正在重新启动工作台。');
 for(const command of ['stop','start']){const r=spawnSync(process.execPath,[join(root,'app/scripts/macos-service.mjs'),command],{cwd:join(root,'app'),env:{...process.env,ECUSTUDIO_NO_BROWSER:'1'},stdio:'inherit'});if(r.status!==0)throw new Error('密钥已保存，但服务重启未完成。请运行 Start.command，再回到设置测试连接。');}
 console.log('保存完成。请回到设置，允许 DeepSeek 调用并测试连接。');
}catch(e){console.error(JSON.stringify({saved:stored,code:e.code||'KEYCHAIN_CONFIGURE_FAILED',message:e.message}));process.exitCode=1;}
finally{try{db?.db.close();}catch{}}
