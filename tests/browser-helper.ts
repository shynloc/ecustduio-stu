import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
export async function testBrowser(){
  if(!process.env.PLAYWRIGHT_BROWSERS_PATH&&existsSync(resolve('.dev/browsers')))process.env.PLAYWRIGHT_BROWSERS_PATH=resolve('.dev/browsers');
  const {chromium}=await import('playwright');
  try{return await chromium.launch({headless:true});}
  catch(e){if(process.platform==='win32')return chromium.launch({channel:'msedge',headless:true});throw e;}
}
