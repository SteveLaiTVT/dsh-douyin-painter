import test from 'node:test';
import assert from 'node:assert/strict';
import omggif from 'omggif';
import { OpenAIImage } from '../src/providers/openai.js';
const png: any=Buffer.from('89504e470d0a1a0a00000000','hex');
const jpeg: any=Buffer.from('ffd8ffe000104a464946000101','hex');
const webp: any=Buffer.from('524946460400000057454250','hex');
function gif(){const bytes: any=Buffer.alloc(10000);const writer: any=new omggif.GifWriter(bytes,2,2,{palette:[0,0xffffff],loop:0});for(let i: any=0;i<6;i++)writer.addFrame(0,0,2,2,new Uint8Array([i%2,1,0,1]),{delay:20});return bytes.subarray(0,writer.end());}
const json: any=(bytes: any)=>new Response(JSON.stringify({data:[{b64_json:bytes.toString('base64')}]}),{headers:{'content-type':'application/json'}});
test('reference images are embedded as JSON data URLs on edits while GIF parameters remain native',async()=>{
 const calls: any=[];const image: any=new OpenAIImage({apiKey:'test',format:'gif',fetchImpl:async(url: any,options: any)=>{calls.push({url,options,body:JSON.parse(options.body)});return json(gif());}});
 const references: any=[{bytes:png,mime:'image/png'},{bytes:jpeg,mime:'image/jpeg'},{bytes:webp,mime:'image/webp'}];
 const result: any=await image.generate({prompt:'让电影中的月光宝盒轻轻打开',references});
 assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.openai.com/v1/images/edits');assert.equal(calls[0].options.method,'POST');assert.equal(calls[0].options.headers['Content-Type'],'application/json');
 assert.deepEqual(calls[0].body.images,references.map(({bytes,mime}: any)=>({image_url:`data:${mime};base64,${bytes.toString('base64')}`})));
 assert.equal(calls[0].body.model,'gpt-image-2.6-flare');assert.equal(calls[0].body.output_format,'gif');assert.equal(calls[0].body.frame_count,6);assert.equal(calls[0].body.frame_duration_ms,200);assert.equal(calls[0].body.stream,false);assert.equal(calls[0].body.size,'auto');assert.equal(result.mime,'image/gif');assert.equal(result.info.referenceCount,3);
});
test('explicit still reference edits preserve PNG format and custom API base prefix',async()=>{
 let called: any;const image: any=new OpenAIImage({apiKey:'test',baseUrl:'https://gateway.example/v1/',fetchImpl:async(url: any,options: any)=>{called={url,body:JSON.parse(options.body)};return json(png);}});
 const result: any=await image.generate({prompt:'对照原物外观',references:[{bytes:png,mime:'image/png'}],format:'png'});
 assert.equal(called.url,'https://gateway.example/v1/images/edits');assert.equal(called.body.output_format,'png');assert.equal(called.body.frame_count,undefined);assert.equal(result.info.referenceCount,1);
});
test('no references retains generations endpoint and existing output shape',async()=>{
 const calls: any=[];const image: any=new OpenAIImage({apiKey:'test',fetchImpl:async(url: any,options: any)=>{calls.push({url,body:JSON.parse(options.body)});return json(png);}});
 for(const references of [undefined,[]])assert.deepEqual(await image.generate({prompt:'月饼',references}),{bytes:png,mime:'image/png'});
 assert.ok(calls.every((call: any)=>call.url.endsWith('/images/generations')&&call.body.images===undefined));
});
test('invalid references, remote URLs and paths never initiate API or filesystem requests',async()=>{
 const image: any=new OpenAIImage({apiKey:'test',fetchImpl:async()=>assert.fail('must not request')});
 const reference: any={bytes:png,mime:'image/png'};
 for(const references of [null,{},[null],[{image_url:'https://example.com/ref.png'}],[{path:'/tmp/ref.png'}],[{bytes:png.toString('base64'),mime:'image/png'}],[{bytes:Buffer.alloc(0),mime:'image/png'}],[{bytes:png,mime:'image/gif'}],[{bytes:png,mime:'image/jpeg'}],Array(4).fill(reference)]){
  await assert.rejects(()=>image.generate({prompt:'宝盒',references}),/参考图/);
 }
});
test('reference limits bound each image to 5MB and combined input to 10MB',async()=>{
 const image: any=new OpenAIImage({apiKey:'test',fetchImpl:async()=>assert.fail('must not request')});
 const big: any=(size: any)=>{const bytes: any=Buffer.alloc(size);png.copy(bytes);return {bytes,mime:'image/png'};};
 await assert.rejects(()=>image.generate({prompt:'宝盒',references:[big(5*1024*1024+1)]}),/参考图/);
 await assert.rejects(()=>image.generate({prompt:'宝盒',references:[big(4*1024*1024),big(4*1024*1024),big(4*1024*1024)]}),/参考图/);
});
test('pre-aborted reference edit makes no paid request and edit failures never fallback to generations',async()=>{
 const abort: any=new AbortController();abort.abort();let calls: any=0;
 const refs: any=[{bytes:png,mime:'image/png'}];const image: any=new OpenAIImage({apiKey:'test',fetchImpl:async()=>{calls++;return new Response('private upstream body',{status:403});}});
 await assert.rejects(()=>image.generate({prompt:'宝盒',references:refs,signal:abort.signal}),/取消/);assert.equal(calls,0);
 await assert.rejects(()=>image.generate({prompt:'宝盒',references:refs,format:'gif'}),(error: any)=>/权限/.test(error.message)&&!error.message.includes('private upstream body'));assert.equal(calls,1);
});
