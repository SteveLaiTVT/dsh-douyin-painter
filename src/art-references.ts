import { PROJECT_ROOT } from './paths.js';
import { pathToFileURL } from 'node:url';
import {readFileSync} from 'node:fs';
// Optional verified visual references are user-prepared local files. Neither audience nor
// model output can turn a URL/path into a server-side image download.
export function resolveArtReferences(originalText: any='',{readReference=()=>readFileSync(pathToFileURL(`${PROJECT_ROOT}/assets/references/moonlight-box-film.jpg`))}: any={}){
  if(typeof originalText!=='string'||!originalText.normalize('NFKC').includes('月光宝盒'))return {images:[],notes:'',sources:[]};
  let bytes: any;
  try{bytes=readReference();}
  catch(error: any){if(error.code!=='ENOENT')throw error;return {images:[],notes:'未提供本机图片参考。已核对的《大话西游》月光宝盒结构：深褐色狭长扁平木质感匣体，中央对开结构与纵向刻字；不是带月牙徽章的金色翻盖大宝箱。只按上述物体特征创作，不复刻演员与电影背景。',sources:[]};}
  if(bytes.length>5*1024*1024||bytes.subarray(0,3).toString('hex')!=='ffd8ff')throw Error('月光宝盒参考素材格式无效');
  return {
    images:[{bytes,mime:'image/jpeg'}],
    notes:'参考图1是《大话西游》电影片段截图。只参考人物胸前手持的月光宝盒：深褐色、狭长、扁平木质感匣体，中央对开结构与纵向刻字是辨识锚点；不是正面带月牙徽章的金色翻盖大宝箱。截图中的人物、人脸、手、服装和洞穴背景都不进入新画面。保留道具轮廓、长宽比例、开启结构、旧物质感和已有刻字痕迹；唯美只通过新场景与光影表达，不重新设计匣体。',
    sources:[{id:'moonlight-box-film',label:'《大话西游》电影片段道具参考',sourceUrl:'https://www.hk01.com/電影/932703/'}],
  };
}
