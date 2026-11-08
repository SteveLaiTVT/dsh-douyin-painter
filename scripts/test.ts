import {readdir, access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {PROJECT_ROOT} from '../src/paths.js';
const browser=process.argv.includes('--browser');
// Derive the runner list from TypeScript sources, not from whatever compiled
// files happen to be sitting in dist/. A stale artifact must never be executed.
const sources=(await readdir(`${PROJECT_ROOT}/tests`)).filter(file=>file.endsWith('.test.ts')&&file.includes('browser')===browser);
const files=sources.map(file=>`${PROJECT_ROOT}/dist/tests/${file.slice(0,-3)}.js`);
if(!files.length)throw new Error(browser?'未发现浏览器测试用例':'未发现离线测试用例');
for(const file of files){
  try{await access(file);}catch{throw new Error(`测试产物缺失：${file}，请先执行 npm run build`);}
}
const result=spawnSync(process.execPath,['--test',...files],{stdio:'inherit',cwd:PROJECT_ROOT});
process.exitCode=result.status??1;
