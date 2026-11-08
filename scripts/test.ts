import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {PROJECT_ROOT} from '../src/paths.js';
const browser=process.argv.includes('--browser');
const files=(await readdir(`${PROJECT_ROOT}/dist/tests`)).filter(file=>file.endsWith('.test.js') && file.includes('browser')===browser).map(file=>`${PROJECT_ROOT}/dist/tests/${file}`);
const result=spawnSync(process.execPath,['--test',...files],{stdio:'inherit',cwd:PROJECT_ROOT});
process.exitCode=result.status??1;
