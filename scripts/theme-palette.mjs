// One-time semantic-color migration. Scholar keeps every original fallback.
import {readFileSync,writeFileSync} from 'node:fs';
import postcss from 'postcss';
const file='web/style.css',css=postcss.parse(readFileSync(file,'utf8'));
css.walkDecls(d=>{
 if(d.value.includes('--theme-'))return;
 const selector=d.parent.selector||'';
 // PPT previews represent the exported slide's actual colors.
 if(selector.includes('.slide-preview'))return;
 let state=/failed|excluded|needs_changes|error-banner|connection.error/.test(selector)?'danger':/pending|partial|interrupted|unknown|warning|next-step/.test(selector)?'warning':/verified|succeeded|confirmed|\.sent|connection.success/.test(selector)?'positive':null;
 const prop=d.prop;
 d.value=d.value.replace(/#[\da-f]{3,8}\b/gi,hex=>{
  let value=hex.slice(1);if(value.length===3)value=value.split('').map(c=>c+c).join('');if(![6,8].includes(value.length))return hex;
  const [r,g,b]=[0,2,4].map(n=>parseInt(value.slice(n,n+2),16));const light=(r*.2126+g*.7152+b*.0722)/255;
  const alpha=value.length===8?parseInt(value.slice(6),16)/255:1;
  let role;
  if(prop.startsWith('--'))role=({'--green':'accent','--muted':'muted','--border':'line','--orange':'gold','--paper':'surface','--warm':'raised'})[prop];
  else if(prop==='color'||prop==='fill'||prop==='stroke')role=state?state:r>245&&g>245&&b>245?'on-accent':light<.4?'text':light>.72?'subtle':'muted';
  else if(prop.startsWith('border')||prop.startsWith('outline'))role=state?state+'-line':'line';
  else if(prop==='background'||prop==='background-color')role=selector===':root'?'bg':state?state+'-bg':alpha<.85?'wash':light<.5?'accent':value.slice(0,6).toLowerCase()==='ffffff'?'surface':'raised';
  if(!role)return hex;
  return `var(--theme-${role}, ${hex})`;
 });
});writeFileSync(file,css.toString());
