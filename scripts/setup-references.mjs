// Optional local-only film still. This script is never run by startup or tests.
import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const target=new URL('../assets/references/moonlight-box-film.jpg',import.meta.url);
const source='https://cdn.hk01.com/di/media/images/dw/20230822/770744405614137344814965.png/DB940mDAoUGSZwJV2WC2seW78eEJh9jaLukrqi7pK6o?v=w1920';
const expected='0add995fc8b87f068b53ddac55a962836d661d71c0e12cae9c5cd99583257502';
const valid=bytes=>bytes.subarray(0,3).toString('hex')==='ffd8ff'&&createHash('sha256').update(bytes).digest('hex')===expected;
try {
 let bytes;try{bytes=await readFile(target);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(bytes){if(!valid(bytes))throw Error('已有参考素材与核对版本不同，请先人工检查；未覆盖原文件');console.log('本机电影参考素材已就绪；文件不提交到 Git。');}
 else {
  const response=await fetch(source,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error(`参考来源返回 HTTP ${response.status}`);
  const chunks=[];let size=0;for await(const part of response.body){size+=part.length;if(size>5*1024*1024)throw Error('参考素材超过5MB');chunks.push(part);}
  bytes=Buffer.concat(chunks);if(!valid(bytes))throw Error('来源图片已变化，未写入；请人工核对原始来源');
  await mkdir(new URL('../assets/references/',import.meta.url),{recursive:true});
  const temporary=new URL(target.href+'.tmp');
  try{await writeFile(temporary,bytes);await rename(temporary,target);}finally{await rm(temporary,{force:true});}
  console.log('电影参考素材已保存在本机，版权归原权利人；请勿随代码再分发。');
 }
} catch(error){console.error(error.message);process.exitCode=1;}
