import {copyFileSync,existsSync} from 'node:fs';
const local=new URL('../deployment/upgrade.mjs',import.meta.url),installed=new URL('../../upgrade.mjs',import.meta.url);
const source=existsSync(local)?local:installed;
if(existsSync(source))copyFileSync(source,new URL('./upgrade.mjs',import.meta.url));
