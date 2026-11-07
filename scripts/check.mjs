import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
let count=0;
async function scan(dir){for(const f of await readdir(dir,{withFileTypes:true})){const path=`${dir}/${f.name}`;if(f.isDirectory())await scan(path);else if(/\.(js|mjs)$/.test(f.name)){const r=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);count++;}}}
for(const dir of ['src','public','scripts','tests'])await scan(dir);console.log(`Syntax checked ${count} modules`);
