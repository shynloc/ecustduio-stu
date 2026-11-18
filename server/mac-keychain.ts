import {spawn} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';

export function keychainError(code:string,message:string){return Object.assign(new Error(message),{code,statusCode:424});}
export function classifyKeychainError(exitCode:number|null,detail=''){
  if(exitCode===36||/interaction is not allowed|interaction not allowed|locked|-25308|不允许.*交互|钥匙串.*锁/i.test(detail))
    return keychainError('KEYCHAIN_LOCKED','Mac 登录钥匙串已锁定，或后台服务无法请求授权。请在这台 Mac 用原登录用户打开“钥匙串访问”，解锁“登录”钥匙串，再回到此处保存。');
  if([51,128].includes(exitCode as number)||/auth.*fail|user cancel|authorization.*denied|-25293|用户.*取消|授权.*拒绝/i.test(detail))
    return keychainError('KEYCHAIN_ACCESS_DENIED','Mac 钥匙串授权被取消或拒绝。请在本机钥匙串提示中允许工作台使用的 security 程序访问，再保存；不要使用 sudo 启动工作台。');
  if(exitCode===44)return keychainError('KEYCHAIN_ITEM_MISSING','钥匙串里没有找到这项凭据，请重新粘贴并保存。');
  if(exitCode===37||/default keychain.*not|specified keychain.*not|could not be found/i.test(detail))
    return keychainError('KEYCHAIN_UNAVAILABLE','当前 Mac 用户没有可用的登录钥匙串。请用安装时的 Mac 用户启动工作台，并在“钥匙串访问”中确认“登录”钥匙串可用。');
  return keychainError('KEYCHAIN_WRITE_FAILED','Mac 钥匙串读写未完成。请点击“检查本机凭据存储”，根据结果解锁或授权钥匙串后重试。');
}
export function createMacKeychainClient(spawnProcess:any=spawn,timeoutMs=60000){
 async function run(args:string[],input='',allowMissing=false):Promise<string>{
  return new Promise((resolve,reject)=>{
   let settled=false,output='',detail='';let child:any;
   const finish=(error:Error|null,value='')=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
   const timer=setTimeout(()=>{finish(keychainError('KEYCHAIN_TIMEOUT','等待 Mac 钥匙串授权超时。请在本机确认钥匙串提示或解锁“登录”钥匙串，再重试。'));child?.kill();},timeoutMs);
   try{child=spawnProcess('/usr/bin/security',args,{stdio:['pipe','pipe','pipe']});}
   catch{finish(keychainError('KEYCHAIN_UNAVAILABLE','无法启动 macOS 钥匙串工具，请从原 Mac 用户重新启动工作台。'));return;}
   child.stdout.setEncoding?.('utf8');child.stderr.setEncoding?.('utf8');
   child.stdout.on('data',(c:any)=>{output+=c;if(output.length>32768){finish(keychainError('KEYCHAIN_RESPONSE_INVALID','钥匙串返回异常，请运行本机凭据存储检查。'));child.kill();}});
   child.stderr.on('data',(c:any)=>{detail=(detail+c).slice(0,8192);});
   child.on('error',()=>finish(keychainError('KEYCHAIN_UNAVAILABLE','无法启动 macOS 钥匙串工具，请从原 Mac 用户重新启动工作台。')));
   // Early security(1) failures can close stdin before all input is written.
   // Handle EPIPE without crashing the workbench; close provides the real status.
   child.stdin.on('error',()=>{});
   child.on('close',(code:number|null)=>{
    if(allowMissing&&code===44){finish(null);return;}
    if(code===0)finish(null,output.replace(/\r?\n$/,''));
    else finish(classifyKeychainError(code,detail));
   });
   try{child.stdin.end(input);}catch{finish(keychainError('KEYCHAIN_INPUT_FAILED','无法把凭据提交给 Mac 钥匙串，请运行本机凭据存储检查后重试。'));child.kill();}
  });
 }
 const quote=(s:string)=>'"'+s.replaceAll('\\','\\\\').replaceAll('"','\\"')+'"';
 async function write(service:string,name:string,value:string){
  if(/[\x00-\x1f\x7f]/.test(service+name+value))throw keychainError('INVALID_SECRET','凭据不能包含换行或控制字符，请只粘贴密钥本身。');
  const command=`add-generic-password -U -a ${quote(name)} -s ${quote(service)} -w ${quote(value)}\n`;
  if(Buffer.byteLength(command,'utf8')>=4096)throw keychainError('SECRET_TOO_LONG','凭据内容过长，请确认只粘贴了密钥本身。');
  // Stdin keeps credentials out of argv and shell history. Explicit -i makes
  // the input channel unambiguous; save is confirmed by an exact readback.
  await run(['-i','-q','-p',''],command);
  if(await read(service,name)!==value)throw keychainError('KEYCHAIN_VERIFY_FAILED','钥匙串保存后读取校验未通过，请检查本机授权后重新保存。');
 }
 const read=(service:string,name:string)=>run(['find-generic-password','-a',name,'-s',service,'-w']);
 const remove=(service:string,name:string)=>run(['delete-generic-password','-a',name,'-s',service],'',true);
 async function diagnose(){
  const service='cn.ecustudio.check.'+randomUUID(),name='temporary-check',sample=randomBytes(24).toString('hex');
  let failure:any=null;
  try{await write(service,name,sample);}catch(e){failure=e;}
  try{await remove(service,name);}catch(e){if(!failure)failure=e;}
  if(failure)throw failure;
  return {ok:true,storage:'macOS Keychain',message:'本机钥匙串写入、读取和删除检查通过。可以重新保存 DeepSeek API Key。'};
 }
 return {run,write,read,remove,diagnose};
}
