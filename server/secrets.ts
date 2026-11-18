import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { dataDir, parse, id, err, hash } from "./db.js";
import {createMacKeychainClient,keychainError} from './mac-keychain.js';
const file = join(dataDir, "secrets.dpapi");
const macFile = join(dataDir, "secrets.keychain.json");
const macService = "cn.ecustudio.workspace." + hash(dataDir).slice(0, 20);
const cache = new Map<string, string>();
const mac = createMacKeychainClient();
async function macFind(name: string) {
  return mac.read(macService,name);
}
function readStore(path:string){
 try{if(!existsSync(path))return {};const value=JSON.parse(readFileSync(path,'utf8'));if(!value||Array.isArray(value)||typeof value!=='object')throw new Error('invalid');return value;}
 catch(e:any){throw keychainError(e.code==='EACCES'||e.code==='EPERM'?'SECRET_FILE_PERMISSION':'SECRET_FILE_INVALID',e.code==='EACCES'||e.code==='EPERM'?'凭据配置文件无法读取。请用安装时的操作系统用户启动工作台，检查原 data 文件夹权限。':'本机凭据配置文件损坏。请保留原 data 目录并使用备份修复，不要重新初始化账号。');}
}
function assertWritable(){const probe=join(dataDir,'.secret-write-check-'+id());try{writeFileSync(probe,'',{flag:'wx',mode:0o600});unlinkSync(probe);}catch{throw keychainError('SECRET_FILE_PERMISSION','凭据配置目录不可写。请用安装时的操作系统用户启动工作台，检查原 data 文件夹权限；不要用 sudo 启动。');}}
export function secretStorageIssue(){try{readStore(process.platform==='darwin'?macFile:file);return null;}catch(e:any){return {code:e.code,message:e.message};}}
export async function diagnoseSecretStorage(){
 assertWritable();readStore(process.platform==='darwin'?macFile:file);
 if(process.platform==='darwin')return mac.diagnose();
 if(process.platform==='win32'){const sample='ecustudio-check-'+id();if(await transform(await transform(sample),true)!==sample)err('SECRET_STORAGE_FAILED','Windows 凭据保护检查未通过',424);return {ok:true,storage:'Windows DPAPI',message:'本机凭据加密与读取检查通过。'};}
 err('SECRET_STORAGE_UNAVAILABLE','此系统请使用服务端环境变量配置凭据',424);
}
async function transform(value: string, decrypt = false): Promise<string> {
  if (process.platform !== "win32")
    err("SECRET_STORAGE_UNAVAILABLE", "此系统请使用服务端环境变量配置凭据");
  const script = decrypt
    ? "$s=[Console]::In.ReadToEnd() | ConvertTo-SecureString; [Console]::Out.Write(([System.Net.NetworkCredential]::new('', $s)).Password)"
    : "$s=ConvertTo-SecureString ([Console]::In.ReadToEnd()) -AsPlainText -Force; [Console]::Out.Write((ConvertFrom-SecureString $s))";
  return await new Promise((resolve, reject) => {
    const p = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          PSModulePath: join(
            process.env.SystemRoot || "C:\\Windows",
            "System32",
            "WindowsPowerShell",
            "v1.0",
            "Modules",
          ),
        },
      },
    );
    let out = "";
    p.stdout.on("data", (c) => (out += c));
    p.stderr.resume();
    p.on("error", () => reject(new Error("凭据保护不可用")));
    p.on("exit", (code) =>
      code === 0 ? resolve(out) : reject(new Error("凭据加密或读取失败")),
    );
    p.stdin.end(value);
  });
}
export function hasSecret(name: string) {
  if (name === "deepseek" && process.env.DEEPSEEK_API_KEY) return true;
  if (cache.has(name)) return true;
  try{return Boolean(readStore(process.platform==='darwin'?macFile:file)[name]);}catch{return false;}
}
export async function getSecret(name: string) {
  if (name === "deepseek" && process.env.DEEPSEEK_API_KEY)
    return process.env.DEEPSEEK_API_KEY;
  if (cache.has(name)) return cache.get(name)!;
  if (process.platform === "darwin") {
    if (!hasSecret(name)) return "";
    const value = await macFind(name);
    cache.set(name, value);
    return value;
  }
  const v = readStore(file)[name];
  if (!v) return "";
  const value = await transform(v, true);
  cache.set(name, value);
  return value;
}
let writeQueue:Promise<unknown>=Promise.resolve();
export function setSecret(name:string,value:string){const operation=writeQueue.then(()=>saveSecret(name,value));writeQueue=operation.catch(()=>{});return operation;}
async function saveSecret(name: string, value: string) {
  if (
    (!["deepseek", "dingtalkWebhook", "dingtalkSign"].includes(name) && !/^wechat\.[a-f0-9-]{36}$/.test(name)) ||
    value.length > 4000 ||
    /[\x00-\x1f\x7f]/.test(value)
  )
    err("INVALID_SECRET", "凭据格式不正确");
  assertWritable();
  if (process.platform === "darwin") {
    const markers = readStore(macFile);
    cache.delete(name);
    if (value) {
      await mac.write(macService,name,value);
      markers[name] = true;
    } else {
      await mac.remove(macService,name);
      delete markers[name];
    }
    const tmp = macFile + "." + id();
    try{writeFileSync(tmp, JSON.stringify(markers), { mode: 0o600 });renameSync(tmp, macFile);}
    catch{throw keychainError('SECRET_FILE_PERMISSION','钥匙串操作已完成，但无法更新本机配置标记。请检查原 data 文件夹权限，再保存一次；不要删除原数据。');}
    cache.delete(name);
    return;
  }
  const obj = readStore(file);
  if (value) obj[name] = await transform(value);
  else delete obj[name];
  const tmp = file + "." + id();
  writeFileSync(tmp, JSON.stringify(obj), { mode: 0o600 });
  renameSync(tmp, file);
  cache.delete(name);
}
