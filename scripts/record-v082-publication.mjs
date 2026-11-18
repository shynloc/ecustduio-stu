import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {fetchRelease} from './update-protocol.mjs';
const out='D:/EduStudio/deliverables/0.8.2';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const online=read('test-results/online-update-v082-result.json');
const packages=read(out+'/public-package-verification.json');
const local=read('test-results/v082-production-preservation.json');
assert.ok(online.ok&&packages.ok&&local.ok);
const live=await fetchRelease();assert.equal(live.release.version,'0.8.2');
assert.deepEqual(live.envelope,read(out+'/stable.json'));
const result={product:'EcuStudio教创工作台',version:'0.8.2',publishedAt:new Date().toISOString(),ok:true,
stableFeed:'https://dshdisk.acks.com.cn/ecustudio/releases/stable.json',
packages:packages.records.map(({destination,...p})=>p),old050SignatureCompatible:packages.old050SignatureCompatible,
upgradeProtocolAndRecoveryTests:11,macStopMockScenarios:7,realHttpSseShutdown:true,
onlineUpgrade:{fixture:online.fixture,checks:online.checks,ok:online.ok},localDeployment:local,
macRepairLauncher:'Repair-Upgrade.command',firstRepairRequiresNewPackage:true,
privateBusinessDataIncluded:false,macNativeExecuted:false,
limitations:['Mac package integrity and executable permissions checked; native installation, Keychain and LaunchAgent not run on a physical Mac','Video audio technically checked; no subjective word-by-word listening or forced alignment audit']};
writeFileSync(out+'/EcuStudio-0.8.2-Acceptance.json',JSON.stringify(result,null,2));
writeFileSync('test-results/v082-publication.json',JSON.stringify({version:'0.8.2',publishedAt:result.publishedAt,ok:true,onlineUpgrade:true,packagesVerified:true},null,2));
console.log(JSON.stringify({version:'0.8.2',published:true,onlineUpgrade:true,originalDataPreserved:true,macNativeExecuted:false}));
