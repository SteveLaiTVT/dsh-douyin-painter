import {cp, mkdir} from 'node:fs/promises';
import {PROJECT_ROOT} from '../src/paths.js';
await mkdir(`${PROJECT_ROOT}/dist/tests/fixtures`,{recursive:true});
await cp(`${PROJECT_ROOT}/tests/fixtures/stream-tone.mp3`,`${PROJECT_ROOT}/dist/tests/fixtures/stream-tone.mp3`);
