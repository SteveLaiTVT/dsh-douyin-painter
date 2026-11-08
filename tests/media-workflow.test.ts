import test from 'node:test';
import assert from 'node:assert/strict';
import omggif from 'omggif';
import { OpenAIImage } from '../src/providers/openai.js';
import { MiniMaxSpeech, VOICE_PRESETS } from '../src/providers/minimax.js';
const json: any=(body: any)=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
function gif({frames=6,delay=20}: any={}){
 const bytes: any=Buffer.alloc(10000);const writer: any=new omggif.GifWriter(bytes,2,2,{palette:[0x000000,0xffffff],loop:0});
 for(let f: any=0;f<frames;f++)writer.addFrame(0,0,2,2,new Uint8Array([f%2,1,0,1]),{delay});
 return bytes.subarray(0,writer.end());
}
const response: any=(bytes: any)=>json({data:[{b64_json:bytes.toString('base64')}]});
test('GPT Image GIF request is native non-streaming animation and returns inspected metadata',async()=>{
 const bytes: any=gif();let body: any;
 const provider: any=new OpenAIImage({apiKey:'test',format:'gif',fetchImpl:async(_url: any,options: any)=>{body=JSON.parse(options.body);return response(bytes);}});
 const result: any=await provider.generate({prompt:'猫咪月球邮局，邮差挥手'});
 assert.equal(body.output_format,'gif');assert.equal(body.size,'auto');assert.equal(body.frame_count,6);assert.equal(body.frame_duration_ms,200);assert.equal(body.stream,false);
 for(const omitted of ['partial_images','mask','output_compression'])assert.equal(body[omitted],undefined);
 assert.deepEqual(result,{bytes,mime:'image/gif',info:{frames:6,width:2,height:2,durationMs:1200}});
});
test('GIF generation can be requested explicitly while old PNG generation stays compatible',async()=>{
 const animated: any=gif({frames:2});const png: any=Buffer.from('89504e470d0a1a0a00000000','hex');let body: any;
 const provider: any=new OpenAIImage({apiKey:'test',format:'gif',fetchImpl:async(_url: any,options: any)=>{body=JSON.parse(options.body);return response(body.output_format==='gif'?animated:png);}});
 assert.equal((await provider.generate({prompt:'猫',format:'png'})).mime,'image/png');assert.equal(body.size,'1024x1024');assert.equal(body.frame_count,undefined);
 assert.equal((await provider.generate({prompt:'猫',format:'gif'})).mime,'image/gif');
});
test('GIF output rejects a PNG fallback, single frame, broken content and invalid frame delays',async()=>{
 for(const bytes of [Buffer.from('89504e470d0a1a0a00000000','hex'),gif({frames:1}),gif({delay:0}),Buffer.from('GIF89a')]){
  const provider: any=new OpenAIImage({apiKey:'test',fetchImpl:async()=>response(bytes)});
  await assert.rejects(()=>provider.generate({prompt:'猫',format:'gif'}),/GIF|动图/);
 }
});
test('GIF preview failure makes only one request and never silently substitutes PNG',async()=>{
 let calls: any=0;const provider: any=new OpenAIImage({apiKey:'test',format:'gif',fetchImpl:async()=>{calls++;return new Response('{"error":"GIF preview unavailable"}',{status:403});}});
 await assert.rejects(()=>provider.generate({prompt:'猫'}),/权限|GIF/);assert.equal(calls,1);
});
test('unsupported image format rejects before any paid request',async()=>{
 const provider: any=new OpenAIImage({apiKey:'test',fetchImpl:async()=>assert.fail('must not request')});
 await assert.rejects(()=>provider.generate({prompt:'猫',format:'webm'}),/格式/);
});
test('MiniMax offers radio, warm and crisp presets and applies per-request voice only',async()=>{
 assert.deepEqual(VOICE_PRESETS,[
  {id:'Chinese (Mandarin)_Radio_Host',label:'电台男主播'},
  {id:'Chinese (Mandarin)_Warm_Bestie',label:'温暖闺蜜'},
  {id:'Chinese (Mandarin)_Crisp_Girl',label:'清脆少女'},
 ]);
 const calls: any=[];const provider: any=new MiniMaxSpeech({apiKey:'test',voiceId:'constructor-default',fetchImpl:async(_url: any,options: any)=>{calls.push(JSON.parse(options.body));return json({base_resp:{status_code:0},data:{status:2,audio:'49443304000000000000'}});}});
 await provider.synthesize({text:'欢迎参加',voiceId:VOICE_PRESETS[0].id,model:'not-allowed',voice_setting:{speed:50}});
 await provider.synthesize({text:'继续比赛'});
 assert.equal(calls[0].voice_setting.voice_id,VOICE_PRESETS[0].id);assert.equal(calls[0].voice_setting.speed,1);assert.equal(calls[0].model,'speech-2.8-hd');
 assert.equal(calls[1].voice_setting.voice_id,'constructor-default');
});
test('MiniMax rejects invalid or oversized voice IDs before fetch',async()=>{
 const provider: any=new MiniMaxSpeech({apiKey:'test',fetchImpl:async()=>assert.fail('must not request')});
 for(const voiceId of ['',null,{id:'bad'},'x'.repeat(129),'bad\nvoice'])await assert.rejects(()=>provider.synthesize({text:'你好',voiceId}),/音色/);
});
test('GIF inspection rejects oversized canvases and bytes, too many frames, or off-canvas frames',async()=>{
 const oversizedCanvas: any=Buffer.from(gif());oversizedCanvas.writeUInt16LE(4096,6);
 const offCanvas: any=Buffer.from(gif());offCanvas.writeUInt16LE(2,offCanvas.indexOf(0x2c)+1);
 const tooLarge: any=Buffer.alloc(20*1024*1024+1);tooLarge.write('GIF89a');tooLarge[tooLarge.length-1]=0x3b;
 for(const bytes of [oversizedCanvas,offCanvas,gif({frames:17}),tooLarge]){
  const provider: any=new OpenAIImage({apiKey:'test',fetchImpl:async()=>response(bytes)});
  await assert.rejects(()=>provider.generate({prompt:'猫',format:'gif'}),/GIF|20MB/);
 }
});
