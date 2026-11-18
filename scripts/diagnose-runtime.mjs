import {createCanvas} from '@napi-rs/canvas';
import {chromium} from 'playwright';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const result={node:process.version,platform:process.platform,arch:process.arch,sqlite:false,canvas:false,pdfBrowser:false,ocr:false};
try {
 const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE t(id INTEGER)');db.close();result.sqlite=true;
 result.canvas=createCanvas(32,32).toBuffer('image/png').length>20;
 let browser;try{browser=await chromium.launch({headless:true});}catch {browser=await chromium.launch({channel:'msedge',headless:true});}
 const page=await browser.newPage();await page.setContent('<h1>EcuStudio PDF diagnostic</h1>');const bytes=await page.pdf();result.pdfBrowser=bytes.subarray(0,4).toString()==='%PDF';await browser.close();
 if(process.platform==='win32'&&existsSync('scripts/windows-ocr.ps1')){const p=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File','scripts/windows-ocr.ps1','-Probe'],{windowsHide:true,encoding:'utf8',env:{...process.env,PSModulePath:join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/Modules')}});try{const o=JSON.parse(p.stdout.replace(/^\uFEFF/,''));result.ocr=p.status===0&&o.languages?.length>0;result.ocrLanguages=o.languages;}catch{}}
 if(process.platform==='darwin'&&existsSync('scripts/macos-ocr.js')){const p=spawnSync('/usr/bin/osascript',['-l','JavaScript','scripts/macos-ocr.js','-Probe'],{encoding:'utf8',timeout:60000});try{const o=JSON.parse(p.stdout);result.ocr=p.status===0&&o.languages?.length>0;result.ocrLanguages=o.languages;result.secretStorage='macOS Keychain';}catch{}}
 console.log(JSON.stringify(result));
 const reportDir=join(process.env.ECUSTUDIO_DATA_DIR||'../data','logs');mkdirSync(reportDir,{recursive:true});writeFileSync(join(reportDir,'runtime-check.json'),JSON.stringify(result,null,2));
 if(!result.ocr)console.warn('OCR language pack unavailable. Other features remain usable; see the installation guide.');
} catch(e){console.error('Runtime check failed: '+e.message);process.exitCode=1;}
