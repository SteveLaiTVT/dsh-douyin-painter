import test from 'node:test';
import assert from 'node:assert/strict';
import { MiniMaxSpeech } from '../src/index.js';
const packet: any=(audio: any,status: any=1,extra: any={})=>({data:{audio,status},base_resp:{status_code:0,status_msg:'成功'},...extra});
const event: any=(value: any)=>`data: ${JSON.stringify(value)}\r\n\r\n`;
const mp3: any=Buffer.from('49443304000000000000fffb90640001','hex');
function response(parts: any,{onCancel=()=>{}}: any={}){
 const encoded: any=parts.map((part: any)=>typeof part==='string'?Buffer.from(part):part);
 return new Response(new ReadableStream({start(controller: any){for(const part of encoded)controller.enqueue(part);controller.close();},cancel:onCancel}),{headers:{'content-type':'text/event-stream; charset=utf-8'}});
}
const collect: any=async (stream: any)=>{const chunks: any=[];for await(const chunk of stream.chunks)chunks.push(chunk);return chunks;};
test('MiniMax streams split UTF8 SSE and early audio without replaying final aggregate',async()=>{
 let request: any;
 const sse: any=': heartbeat\r\n\r\n'+event(packet('49'))+event(packet(mp3.subarray(1,5).toString('hex')))+event(packet(mp3.subarray(5).toString('hex')))+event(packet(mp3.toString('hex'),2));
 const bytes: any=Buffer.from(sse);const parts: any=Array.from(bytes,(byte: any)=>Buffer.from([byte]));
 const provider: any=new MiniMaxSpeech({apiKey:'test',model:'speech-2.8-turbo',fetchImpl:async(url: any,options: any)=>{request={url,options,body:JSON.parse(options.body)};return response(parts);}});
 const stream: any=await provider.openStream({text:'你好，月球上的猫咪！',voiceId:'Chinese (Mandarin)_Radio_Host'});
 assert.equal(stream.mime,'audio/mpeg');const chunks: any=await collect(stream);assert.ok(chunks[0].length>=3);assert.deepEqual(Buffer.concat(chunks),mp3);
 assert.equal(request.body.stream,true);assert.deepEqual(request.body.stream_options,{exclude_aggregated_audio:true});assert.equal(request.body.model,'speech-2.8-turbo');assert.equal(request.body.voice_setting.voice_id,'Chinese (Mandarin)_Radio_Host');
});
test('a stream yields its first valid MP3 segment before upstream synthesis completes',async()=>{
 let upstream: any;let cancelled: any=false;
 const provider: any=new MiniMaxSpeech({apiKey:'test',fetchImpl:async()=>new Response(new ReadableStream({start(controller: any){upstream=controller;controller.enqueue(Buffer.from(event(packet(mp3.subarray(0,5).toString('hex')))));},cancel(){cancelled=true;}}),{headers:{'content-type':'text/event-stream'}})});
 const stream: any=await provider.openStream({text:'你好'});const iterator: any=stream.chunks[Symbol.asyncIterator]();
 assert.deepEqual((await iterator.next()).value,mp3.subarray(0,5));upstream.enqueue(Buffer.from(event(packet(mp3.subarray(5).toString('hex')))+event(packet('',2))));upstream.close();
 const rest: any=[];for await(const chunk of iterator)rest.push(chunk);assert.deepEqual(Buffer.concat(rest),mp3.subarray(5));
});
test('status2 final-only complete audio is delivered once, while truncated streams fail',async()=>{
 const complete: any=new MiniMaxSpeech({apiKey:'test',fetchImpl:async()=>response([event(packet(mp3.toString('hex'),2))])});
 assert.deepEqual(Buffer.concat(await collect(await complete.openStream({text:'你好'}))),mp3);
 for(const contents of [event(packet(mp3.toString('hex'))),event(packet(mp3.toString('hex')))+'data: [DONE]\n\n',event(packet('',2))]){
  const provider: any=new MiniMaxSpeech({apiKey:'test',fetchImpl:async()=>response([contents])});
  await assert.rejects(async()=>collect(await provider.openStream({text:'你好'})),/语音.*(?:完成|结束|音频)/);
 }
});
test('business errors and malformed SSE/hex/status never leak upstream body or key',async()=>{
 for(const contents of [event({base_resp:{status_code:1004,status_msg:'secret-key'},data:null}),'data: not-json-secret-key\n\n',event(packet('xyz')),event(packet(mp3.toString('hex'),99)),event({data:{audio:mp3.toString('hex'),status:1}}),event(packet(Buffer.from('not mp3').toString('hex')))+event(packet('',2))]){
  const provider: any=new MiniMaxSpeech({apiKey:'secret-key',fetchImpl:async()=>response([contents])});
  await assert.rejects(async()=>collect(await provider.openStream({text:'你好'})),(error: any)=>error.message.includes('语音')&&!error.message.includes('secret-key'));
 }
});
test('a mismatching aggregate final packet is rejected instead of duplicating or losing audio',async()=>{
 const provider: any=new MiniMaxSpeech({apiKey:'test',fetchImpl:async()=>response([event(packet(mp3.toString('hex')))+event(packet(Buffer.concat([mp3,Buffer.from([1])]).toString('hex'),2))])});
 await assert.rejects(async()=>collect(await provider.openStream({text:'你好'})),/完整|汇总|不一致/);
});
test('caller cancellation aborts a stalled reader and consumer early-return cancels upstream',async()=>{
 let cancelled: any=0;
 const make: any=()=>new MiniMaxSpeech({apiKey:'test',fetchImpl:async()=>new Response(new ReadableStream({start(controller: any){controller.enqueue(Buffer.from(event(packet(mp3.toString('hex')))));},cancel(){cancelled++;}}),{headers:{'content-type':'text/event-stream'}})});
 const abort: any=new AbortController();const stream: any=await make().openStream({text:'你好',signal:abort.signal});const iterator: any=stream.chunks[Symbol.asyncIterator]();await iterator.next();const pending: any=iterator.next();abort.abort();await assert.rejects(()=>pending,/取消/);assert.equal(cancelled,1);
 const next: any=await make().openStream({text:'你好'});for await(const chunk of next.chunks){assert.ok(chunk.length);break;}assert.equal(cancelled,2);
});
test('timeout bounds stalled response reads and HTTP errors do not retry or leak bodies',async()=>{
 let calls: any=0;
 const provider: any=new MiniMaxSpeech({apiKey:'secret-key',timeoutMs:10,fetchImpl:async()=>new Response(new ReadableStream({}),{headers:{'content-type':'text/event-stream'}})});
 const keep: any=setTimeout(()=>{},1000);try{await assert.rejects(async()=>collect(await provider.openStream({text:'你好'})),/超时/);}finally{clearTimeout(keep);}
 const bad: any=new MiniMaxSpeech({apiKey:'secret-key',fetchImpl:async()=>{calls++;return new Response('secret-key',{status:401});}});
 await assert.rejects(()=>bad.openStream({text:'你好'}),(error: any)=>/认证/.test(error.message)&&!error.message.includes('secret-key'));assert.equal(calls,1);
});
test('stream size limit and pre-aborted or invalid requests are checked without extra requests',async()=>{
 const provider: any=new MiniMaxSpeech({apiKey:'test',maxStreamBytes:8,fetchImpl:async()=>response([event(packet(mp3.toString('hex')))+event(packet('',2))])});
 await assert.rejects(async()=>collect(await provider.openStream({text:'你好'})),/过大/);
 const abort: any=new AbortController();abort.abort();const noFetch: any=new MiniMaxSpeech({apiKey:'test',fetchImpl:async()=>assert.fail('must not fetch')});
 await assert.rejects(()=>noFetch.openStream({text:'你好',signal:abort.signal}),/取消/);
 await assert.rejects(()=>noFetch.openStream({text:'你好',voiceId:'bad\nvoice'}),/音色/);
});
test('HTTP 200 JSON business failure is inspected without revealing server message',async()=>{
 const provider: any=new MiniMaxSpeech({apiKey:'secret-key',fetchImpl:async()=>new Response(JSON.stringify({base_resp:{status_code:1004,status_msg:'secret-key'}}),{headers:{'content-type':'application/json'}})});
 await assert.rejects(()=>provider.openStream({text:'你好'}),(error: any)=>error.message.includes('1004')&&!error.message.includes('secret-key'));
});
test('SSE multiline data and a final packet without trailing newline are handled',async()=>{
 const first: any=packet(mp3.toString('hex'));const serialized: any=JSON.stringify(first,null,2).split('\n').map((line: any)=>`data: ${line}`).join('\n');
 const provider: any=new MiniMaxSpeech({apiKey:'test',fetchImpl:async()=>response([`${serialized}\n\n`+`data: ${JSON.stringify(packet('',2))}`])});
 assert.deepEqual(Buffer.concat(await collect(await provider.openStream({text:'你好'}))),mp3);
});
test('invalid UTF8, wire size, or endless oversized SSE fields are bounded',async()=>{
 for(const content of [Buffer.from([0xff,0xfe]),Buffer.from(`data: ${'x'.repeat(70000)}`),Buffer.from(`:${'x'.repeat(1100000)}`)]){
  const provider: any=new MiniMaxSpeech({apiKey:'test',maxStreamBytes:8,fetchImpl:async()=>response([content])});
  await assert.rejects(async()=>collect(await provider.openStream({text:'你好'})),/语音.*格式|语音.*过大/);
 }
});
test('final format metadata and errors after the first audio segment still fail completion',async()=>{
 for(const tail of [packet('',2,{extra_info:{audio_format:'wav'}}),{base_resp:{status_code:1008,status_msg:'secret-key'},data:null}]){
  const provider: any=new MiniMaxSpeech({apiKey:'secret-key',fetchImpl:async()=>response([event(packet(mp3.toString('hex')))+event(tail)])});
  const stream: any=await provider.openStream({text:'你好'});const iterator: any=stream.chunks[Symbol.asyncIterator]();assert.deepEqual((await iterator.next()).value,mp3);
  await assert.rejects(()=>iterator.next(),(error: any)=>error.message.includes('语音')&&!error.message.includes('secret-key'));
 }
});

test('real turbo shape completes despite advisory final file size differing from streamed bytes',async()=>{
 // Sanitized production shape: 4653+9792+5184+2304+0 = 21933 bytes;
 // the successful final packet declares audio_size=23028. No real API call.
 const lengths: any=[4653,9792,5184,2304,0];const packets: any=lengths.map((size: any,index: any)=>{const bytes: any=Buffer.alloc(size,index);if(index===0)mp3.copy(bytes);return event(packet(bytes.toString('hex')));});
 packets.push(event(packet('',2,{extra_info:{audio_size:23028,audio_format:'mp3'}})));
 const provider: any=new MiniMaxSpeech({apiKey:'test',model:'speech-2.8-turbo',fetchImpl:async()=>response(packets)});
 const chunks: any=await collect(await provider.openStream({text:'测试流式语音'}));
 assert.equal(Buffer.concat(chunks).length,21933);assert.equal(chunks.length,4);
});
test('advisory size does not override aggregate verification or actual audio limits',async()=>{
 const provider: any=new MiniMaxSpeech({apiKey:'test',fetchImpl:async()=>response([event(packet(mp3.toString('hex')))+event(packet(mp3.toString('hex'),2,{extra_info:{audio_size:mp3.length+100,audio_format:'mp3'}}))])});
 assert.deepEqual(Buffer.concat(await collect(await provider.openStream({text:'你好'}))),mp3);
});
