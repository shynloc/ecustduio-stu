import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
const env={...process.env,ECUSTUDIO_WEB_DIR:resolve('dist')};
if(!env.PLAYWRIGHT_BROWSERS_PATH&&existsSync('.dev/browsers'))env.PLAYWRIGHT_BROWSERS_PATH=resolve('.dev/browsers');
for(const test of ['tests/pipeline.e2e.ts','tests/wechat.e2e.ts','tests/notebook.e2e.ts','tests/navigation.e2e.ts','tests/conversation-files.e2e.ts']){
 const run=spawnSync(process.execPath,['--import','tsx',test],{env,stdio:'inherit',windowsHide:true});
 if(run.status!==0)process.exit(run.status||1);
}
