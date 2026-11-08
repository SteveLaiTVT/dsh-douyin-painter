import { PROJECT_ROOT } from '../src/paths.js';
import { pathToFileURL } from 'node:url';
// Optional local-only film still. This script is never run by startup or tests.
import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const target: any=pathToFileURL(`${PROJECT_ROOT}/assets/references/moonlight-box-film.jpg`);
const source: any='https://cdn.hk01.com/di/media/images/dw/20230822/770744405614137344814965.png/DB940mDAoUGSZwJV2WC2seW78eEJh9jaLukrqi7pK6o?v=w1920';
const expected: any='0add995fc8b87f068b53ddac55a962836d661d71c0e12cae9c5cd99583257502';
const valid: any=(bytes: any)=>bytes.subarray(0,3).toString('hex')==='ffd8ff'&&createHash('sha256').update(bytes).digest('hex')===expected;
try {
 let bytes: any;try{bytes=await readFile(target);}catch(error: any){if(error.code!=='ENOENT')throw error;}
 if(bytes){if(!valid(bytes))throw Error('已有参考素材与核对版本不同，请先人工检查；未覆盖原文件');console.log('本机电影参考素材已就绪；文件不提交到 Git。');}
 else {
  const response: any=await fetch(source,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error(`参考来源返回 HTTP ${response.status}`);
  const chunks: any=[];let size: any=0;for await(const part of response.body){size+=part.length;if(size>5*1024*1024)throw Error('参考素材超过5MB');chunks.push(part);}
  bytes=Buffer.concat(chunks);if(!valid(bytes))throw Error('来源图片已变化，未写入；请人工核对原始来源');
  await mkdir(pathToFileURL(`${PROJECT_ROOT}/assets/references/`),{recursive:true});
  const temporary: any=new URL(target.href+'.tmp');
  try{await writeFile(temporary,bytes);await rename(temporary,target);}finally{await rm(temporary,{force:true});}
  console.log('电影参考素材已保存在本机，版权归原权利人；请勿随代码再分发。');
 }
} catch(error: any){console.error(error.message);process.exitCode=1;}
