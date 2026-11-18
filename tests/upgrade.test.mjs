import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,existsSync,readdirSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {upgrade,inventory} from '../deployment/upgrade.mjs';
mkdirSync('test-results',{recursive:true});const base=mkdtempSync(resolve('test-results/upgrade-tests-'));
const sha=b=>createHash('sha256').update(b).digest('hex');
function fixture(name){
 const root=join(base,name),source=join(root,'new-package'),target=join(root,'旧工作台 with spaces');mkdirSync(source,{recursive:true});mkdirSync(join(target,'app/node_modules'),{recursive:true});mkdirSync(join(target,'data/assets'),{recursive:true});
 const files={'app/package.json':JSON.stringify({name:'ecustudio',version:'0.4.0'}),'app/package-lock.json':'{"packages":{}}','app/dist-server/server/index.js':'// new program','app/migrations/003_media.sql':'CREATE TABLE IF NOT EXISTS media_test(id TEXT);','Upgrade.txt':'new launcher'};
 const entries=[];for(const [path,body]of Object.entries(files)){const p=join(source,path);mkdirSync(resolve(p,'..'),{recursive:true});writeFileSync(p,body);entries.push({path,bytes:Buffer.byteLength(body),sha256:sha(body)});}
 writeFileSync(join(source,'manifest.json'),JSON.stringify({product:'EcuStudio教创工作台',version:'0.4.0',platform:process.platform==='darwin'?'macOS14+':'Windows-x64',files:entries}));
 writeFileSync(join(target,'app/package.json'),JSON.stringify({name:'ecustudio',version:'0.3.0'}));writeFileSync(join(target,'app/package-lock.json'),'{}');writeFileSync(join(target,'app/node_modules/retained.txt'),'existing dependency');
 writeFileSync(join(target,'app/.env'),'DEEPSEEK_API_KEY=synthetic-test-only\n');writeFileSync(join(target,'ecustudio.json'),'{"port":38429,"networkMode":"lan","autoStart":false}');
 writeFileSync(join(target,'data/secrets.dpapi'),'synthetic-encrypted-bytes');writeFileSync(join(target,'data/assets/original.txt'),'original material');writeFileSync(join(target,'Upgrade.txt'),'old launcher');
 const db=new DatabaseSync(join(target,'data/app.sqlite'));db.exec("CREATE TABLE jobs(id TEXT,state TEXT);CREATE TABLE outbox(id TEXT,state TEXT);CREATE TABLE users(id TEXT,role TEXT,password_hash TEXT);INSERT INTO users VALUES('u','admin','original-hash');CREATE TABLE settings(id INTEGER,body TEXT);INSERT INTO settings VALUES(1,'{\"allowExternalAI\":true}');CREATE TABLE notes(id TEXT,body TEXT);INSERT INTO notes VALUES('n','private note');");db.close();
 const before=inventory(join(target,'data/app.sqlite'));let starts=0,stops=0;
 const adapter={prepare:async()=>true,stop:async()=>{stops++;},migrate:async()=>{const d=new DatabaseSync(join(target,'data/app.sqlite'));d.exec('CREATE TABLE media_test(id TEXT)');d.close();},start:async()=>{starts++;},verify:async()=>{},open:async()=>{}};
 return {source,target,before,adapter,counts:()=>({starts,stops})};
}
function retained(f){assert.deepEqual(inventory(join(f.target,'data/app.sqlite'),f.before),f.before);assert.equal(readFileSync(join(f.target,'data/assets/original.txt'),'utf8'),'original material');assert.equal(readFileSync(join(f.target,'data/secrets.dpapi'),'utf8'),'synthetic-encrypted-bytes');assert.match(readFileSync(join(f.target,'app/.env'),'utf8'),/synthetic-test-only/);assert.match(readFileSync(join(f.target,'ecustudio.json'),'utf8'),/38429/);assert.ok(existsSync(join(f.target,'app/node_modules/retained.txt')));}
test('下载后管理员权限变更时，在停止服务和替换程序前拒绝',async()=>{const f=fixture('permission-change');await assert.rejects(upgrade({...f,noBrowser:true,beforeCommit:()=>{throw new Error('permission revoked');}}),/permission revoked/);retained(f);assert.equal(f.counts().stops,0);assert.equal(existsSync(join(f.target,'data/upgrade.lock')),false);});
test('升级保留账号/资料/设置/凭据及依赖，生成可追溯本地备份',async()=>{const f=fixture('success'),r=await upgrade({...f,noBrowser:true});retained(f);assert.equal(r.status,'complete');assert.equal(JSON.parse(readFileSync(join(f.target,'app/package.json'))).version,'0.4.0');assert.ok(existsSync(join(r.backup,'database.sqlite')));assert.equal(readFileSync(join(r.backup,'old-app/package.json'),'utf8').includes('0.3.0'),true);assert.equal(existsSync(join(f.target,'data/upgrade.lock')),false);});
test('启动失败自动还原数据库、旧程序和依赖',async()=>{const f=fixture('startup-failure');f.adapter.verify=async()=>{throw new Error('synthetic health failure');};await assert.rejects(upgrade({...f,noBrowser:true}),/synthetic health failure/);retained(f);assert.equal(JSON.parse(readFileSync(join(f.target,'app/package.json'))).version,'0.3.0');const db=new DatabaseSync(join(f.target,'data/app.sqlite'));assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name='media_test'").get(),undefined);db.close();assert.equal(readFileSync(join(f.target,'Upgrade.txt'),'utf8'),'old launcher');assert.equal(f.counts().starts,2);});
test('迁移意外更改原账号时拒绝成功并回滚',async()=>{const f=fixture('data-change');f.adapter.migrate=async()=>{const d=new DatabaseSync(join(f.target,'data/app.sqlite'));d.exec("UPDATE users SET role='sales'");d.close();};await assert.rejects(upgrade({...f,noBrowser:true}),/changed unexpectedly/);retained(f);});
test('损坏安装包、活动任务和原目录覆盖均在修改前拒绝',async()=>{
 const f=fixture('corrupt');writeFileSync(join(f.source,'app/package.json'),'corrupt');await assert.rejects(upgrade({...f,noBrowser:true}),/checksum/);retained(f);
 const b=fixture('busy'),db=new DatabaseSync(join(b.target,'data/app.sqlite'));db.exec("INSERT INTO jobs VALUES('j','running')");db.close();await assert.rejects(upgrade({...b,noBrowser:true}),/tasks/);assert.equal(existsSync(join(b.target,'data/upgrade.lock')),false);
 await assert.rejects(upgrade({...b,source:b.target,noBrowser:true}),/separate folder/);
});
test('进程意外退出后恢复入口回到旧版，保留原有数据',async()=>{
 const f=fixture('crash'),runner=join(base,'crash-runner.mjs');
 writeFileSync(runner,`import {upgrade} from ${JSON.stringify(new URL('../deployment/upgrade.mjs',import.meta.url).href)};await upgrade({source:process.argv[2],target:process.argv[3],noBrowser:true,adapter:{prepare:async()=>true,stop:async()=>{},migrate:async()=>process.exit(88)}});`);
 const child=spawnSync(process.execPath,[runner,f.source,f.target],{windowsHide:true,encoding:'utf8'});assert.equal(child.status,88,child.stderr);assert.ok(existsSync(join(f.target,'data/upgrade.lock')));
 const r=await upgrade({...f,recover:true,noBrowser:true});assert.equal(r.status,'rolled-back');retained(f);assert.equal(JSON.parse(readFileSync(join(f.target,'app/package.json'))).version,'0.3.0');assert.equal(existsSync(join(f.target,'data/upgrade.lock')),false);
});
test('恢复自身中断可继续；准备阶段的恢复不会停止正在使用的旧服务',async()=>{
 const f=fixture('rollback-crash'),backup=join(f.target,'data/upgrade-backups/interrupted');mkdirSync(backup,{recursive:true});
 const db=new DatabaseSync(join(f.target,'data/app.sqlite'));const {backup:save}=await import('node:sqlite');await save(db,join(backup,'database.sqlite'));db.exec("UPDATE users SET role='sales'");db.close();
 mkdirSync(join(backup,'failed-app'));const state={target:f.target,backup,source:f.source,status:'installing',inventory:f.before,protected:{},rootFiles:[],reuseDependencies:true};
 writeFileSync(join(backup,'journal.json'),JSON.stringify(state));writeFileSync(join(f.target,'data/upgrade.lock'),JSON.stringify({pid:2147483647,backup:'data/upgrade-backups/interrupted'}));
 await upgrade({...f,recover:true,noBrowser:true});retained(f);
 const g=fixture('prepare-crash'),b=join(g.target,'data/upgrade-backups/preparing');mkdirSync(b,{recursive:true});writeFileSync(join(b,'journal.json'),JSON.stringify({target:g.target,backup:b,status:'staging'}));writeFileSync(join(g.target,'data/upgrade.lock'),JSON.stringify({pid:2147483647,backup:'data/upgrade-backups/preparing'}));
 await upgrade({...g,recover:true,noBrowser:true});assert.equal(g.counts().stops,0);retained(g);
});
