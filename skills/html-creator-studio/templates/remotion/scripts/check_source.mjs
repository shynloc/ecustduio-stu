import fs from 'node:fs';
const read = file => fs.readFileSync(file,'utf8');
const master=read('src/generated/master.ts');
const stage=read('src/generated/stage.css');
const engine=read('src/generated/frame-styles.mjs');
for (const item of ['STAGE_MARKUP','timeline','storyboard','tokens']) if(!master.includes(item))throw new Error(`Generated master missing ${item}`);
if(!stage.includes('.scene'))throw new Error('Stage CSS missing scene selectors');
if(!engine.includes('frameCSS'))throw new Error('Shared renderer missing frameCSS');
console.log('PASS: generated Remotion sources complete. (Does not substitute CLI render.)');
