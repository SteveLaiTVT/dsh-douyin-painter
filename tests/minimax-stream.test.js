import test from 'node:test';
import assert from 'node:assert/strict';
import { MiniMaxSpeech } from '../src/providers/minimax.js';
const packet=(audio,status=1,extra={})=>({data:{audio,status},base_resp:{status_code:0,status_msg:'成功'},...extra});
const event=value=>`data: ${JSON.stringify(value)}\r\n\r\n`;
const mp3=Buffer.from('49443304000000000000fffb90640001','hex');
function response(parts,{onCancel=()=>{}}={}){
 const encoded=parts.map(part=>typeof part==='string'?Buffer.from(part):part);
 return new Response(new ReadableStream({start(controller){for(const part of encoded)controller.enqueue(part);controller.close();},cancel:onCancel}),{headers:{'content-type':'text/event-stream; charset=utf-8'}});
}
const collect=async stream=>{const chunks=[];for await(const chunk of stream.chunks)chunks.push(chunk);return chunks;};
test('MiniMax streams split UTF8 SSE and early audio without replaying final aggregate',async()=>{
 let request;
 const sse=': heartbeat\r\n\r\n'+event(packet('49'))+event(packet(mp3.subarray(1,5).toString('hex')))+event(packet(mp3.subarray(5).toString('hex')))+event(packet(mp3.toString('hex'),2));
 const bytes=Buffer.from(sse);const parts=Array.from(bytes,byte=>Buffer.from([byte]));
 const provider=new MiniMaxSpeech({apiKey:'test',model:'speech-2.8-turbo',fetchImpl:async(url,options)=>{request={url,options,body:JSON.parse(options.body)};return response(parts);}});
 const stream=await provider.openStream({text:'你好，月球上的猫咪！',voiceId:'Chinese (Mandarin)_Radio_Host'});
 assert.equal(stream.mime,'audio/mpeg');const chunks=await collect(stream);assert.ok(chunks[0].length>=3);assert.deepEqual(Buffer.concat(chunks),mp3);
 assert.equal(request.body.stream,true);assert.deepEqual(request.body.stream_options,{exclude_aggregated_audio:true});assert.equal(request.body.model,'speech-2.8-turbo');assert.equal(request.body.voice_setting.voice_id,'Chinese (Mandarin)_Radio_Host');
});
test('a stream yields its first valid MP3 segment before upstream synthesis completes',async()=>{
 let upstream;let cancelled=false;
 const provider=new MiniMaxSpeech({apiKey:'test',fetchImpl:async()=>new Response(new ReadableStream({start(controller){upstream=controller;controller.enqueue(Buffer.from(event(packet(mp3.subarray(0,5).toString('hex')))));},cancel(){cancelled=true;}}),{headers:{'content-type':'text/event-stream'}})});
 const stream=await provider.openStream({text:'你好'});const iterator=stream.chunks[Symbol.asyncIterator]();
 assert.deepEqual((await iterator.next()).value,mp3.subarray(0,5));upstream.enqueue(Buffer.from(event(packet(mp3.subarray(5).toString('hex')))+event(packet('',2))));upstream.close();
 const rest=[];for await(const chunk of iterator)rest.push(chunk);assert.deepEqual(Buffer.concat(rest),mp3.subarray(5));
});
test('status2 final-only complete audio is delivered once, while truncated streams fail',async()=>{
 const complete=new MiniMaxSpeech({apiKey:'test',fetchImpl:async()=>response([event(packet(mp3.toString('hex'),2))])});
 assert.deepEqual(Buffer.concat(await collect(await complete.openStream({text:'你好'}))),mp3);
 for(const contents of [event(packet(mp3.toString('hex'))),event(packet(mp3.toString('hex')))+'data: [DONE]\n\n',event(packet('',2))]){
  const provider=new MiniMaxSpeech({apiKey:'test',fetchImpl:async()=>response([contents])});
  await assert.rejects(async()=>collect(await provider.openStream({text:'你好'})),/语音.*(?:完成|结束|音频)/);
 }
});
test('business errors and malformed SSE/hex/status never leak upstream body or key',async()=>{
 for(const contents of [event({base_resp:{status_code:1004,status_msg:'secret-key'},data:null}),'data: not-json-secret-key\n\n',event(packet('xyz')),event(packet(mp3.toString('hex'),99)),event({data:{audio:mp3.toString('hex'),status:1}}),event(packet(Buffer.from('not mp3').toString('hex')))+event(packet('',2))]){
  const provider=new MiniMaxSpeech({apiKey:'secret-key',fetchImpl:async()=>response([contents])});
  await assert.rejects(async()=>collect(await provider.openStream({text:'你好'})),error=>error.message.includes('语音')&&!error.message.includes('secret-key'));
 }
});
test('a mismatching aggregate final packet is rejected instead of duplicating or losing audio',async()=>{
 const provider=new MiniMaxSpeech({apiKey:'test',fetchImpl:async()=>response([event(packet(mp3.toString('hex')))+event(packet(Buffer.concat([mp3,Buffer.from([1])]).toString('hex'),2))])});
 await assert.rejects(async()=>collect(await provider.openStream({text:'你好'})),/完整|汇总|不一致/);
});
test('caller cancellation aborts a stalled reader and consumer early-return cancels upstream',async()=>{
 let cancelled=0;
 const make=()=>new MiniMaxSpeech({apiKey:'test',fetchImpl:async()=>new Response(new ReadableStream({start(controller){controller.enqueue(Buffer.from(event(packet(mp3.toString('hex')))));},cancel(){cancelled++;}}),{headers:{'content-type':'text/event-stream'}})});
 const abort=new AbortController();const stream=await make().openStream({text:'你好',signal:abort.signal});const iterator=stream.chunks[Symbol.asyncIterator]();await iterator.next();const pending=iterator.next();abort.abort();await assert.rejects(()=>pending,/取消/);assert.equal(cancelled,1);
 const next=await make().openStream({text:'你好'});for await(const chunk of next.chunks){assert.ok(chunk.length);break;}assert.equal(cancelled,2);
});
test('timeout bounds stalled response reads and HTTP errors do not retry or leak bodies',async()=>{
 let calls=0;
 const provider=new MiniMaxSpeech({apiKey:'secret-key',timeoutMs:10,fetchImpl:async()=>new Response(new ReadableStream({}),{headers:{'content-type':'text/event-stream'}})});
 const keep=setTimeout(()=>{},1000);try{await assert.rejects(async()=>collect(await provider.openStream({text:'你好'})),/超时/);}finally{clearTimeout(keep);}
 const bad=new MiniMaxSpeech({apiKey:'secret-key',fetchImpl:async()=>{calls++;return new Response('secret-key',{status:401});}});
 await assert.rejects(()=>bad.openStream({text:'你好'}),error=>/认证/.test(error.message)&&!error.message.includes('secret-key'));assert.equal(calls,1);
});
test('stream size limit and pre-aborted or invalid requests are checked without extra requests',async()=>{
 const provider=new MiniMaxSpeech({apiKey:'test',maxStreamBytes:8,fetchImpl:async()=>response([event(packet(mp3.toString('hex')))+event(packet('',2))])});
 await assert.rejects(async()=>collect(await provider.openStream({text:'你好'})),/过大/);
 const abort=new AbortController();abort.abort();const noFetch=new MiniMaxSpeech({apiKey:'test',fetchImpl:async()=>assert.fail('must not fetch')});
 await assert.rejects(()=>noFetch.openStream({text:'你好',signal:abort.signal}),/取消/);
 await assert.rejects(()=>noFetch.openStream({text:'你好',voiceId:'bad\nvoice'}),/音色/);
});
test('HTTP 200 JSON business failure is inspected without revealing server message',async()=>{
 const provider=new MiniMaxSpeech({apiKey:'secret-key',fetchImpl:async()=>new Response(JSON.stringify({base_resp:{status_code:1004,status_msg:'secret-key'}}),{headers:{'content-type':'application/json'}})});
 await assert.rejects(()=>provider.openStream({text:'你好'}),error=>error.message.includes('1004')&&!error.message.includes('secret-key'));
});
test('SSE multiline data and a final packet without trailing newline are handled',async()=>{
 const first=packet(mp3.toString('hex'));const serialized=JSON.stringify(first,null,2).split('\n').map(line=>`data: ${line}`).join('\n');
 const provider=new MiniMaxSpeech({apiKey:'test',fetchImpl:async()=>response([`${serialized}\n\n`+`data: ${JSON.stringify(packet('',2))}`])});
 assert.deepEqual(Buffer.concat(await collect(await provider.openStream({text:'你好'}))),mp3);
});
test('invalid UTF8, wire size, or endless oversized SSE fields are bounded',async()=>{
 for(const content of [Buffer.from([0xff,0xfe]),Buffer.from(`data: ${'x'.repeat(70000)}`),Buffer.from(`:${'x'.repeat(1100000)}`)]){
  const provider=new MiniMaxSpeech({apiKey:'test',maxStreamBytes:8,fetchImpl:async()=>response([content])});
  await assert.rejects(async()=>collect(await provider.openStream({text:'你好'})),/语音.*格式|语音.*过大/);
 }
});
test('final format metadata and errors after the first audio segment still fail completion',async()=>{
 for(const tail of [packet('',2,{extra_info:{audio_format:'wav'}}),{base_resp:{status_code:1008,status_msg:'secret-key'},data:null}]){
  const provider=new MiniMaxSpeech({apiKey:'secret-key',fetchImpl:async()=>response([event(packet(mp3.toString('hex')))+event(tail)])});
  const stream=await provider.openStream({text:'你好'});const iterator=stream.chunks[Symbol.asyncIterator]();assert.deepEqual((await iterator.next()).value,mp3);
  await assert.rejects(()=>iterator.next(),error=>error.message.includes('语音')&&!error.message.includes('secret-key'));
 }
});

test('real turbo shape completes despite advisory final file size differing from streamed bytes',async()=>{
 // Sanitized production shape: 4653+9792+5184+2304+0 = 21933 bytes;
 // the successful final packet declares audio_size=23028. No real API call.
 const lengths=[4653,9792,5184,2304,0];const packets=lengths.map((size,index)=>{const bytes=Buffer.alloc(size,index);if(index===0)mp3.copy(bytes);return event(packet(bytes.toString('hex')));});
 packets.push(event(packet('',2,{extra_info:{audio_size:23028,audio_format:'mp3'}})));
 const provider=new MiniMaxSpeech({apiKey:'test',model:'speech-2.8-turbo',fetchImpl:async()=>response(packets)});
 const chunks=await collect(await provider.openStream({text:'测试流式语音'}));
 assert.equal(Buffer.concat(chunks).length,21933);assert.equal(chunks.length,4);
});
test('advisory size does not override aggregate verification or actual audio limits',async()=>{
 const provider=new MiniMaxSpeech({apiKey:'test',fetchImpl:async()=>response([event(packet(mp3.toString('hex')))+event(packet(mp3.toString('hex'),2,{extra_info:{audio_size:mp3.length+100,audio_format:'mp3'}}))])});
 assert.deepEqual(Buffer.concat(await collect(await provider.openStream({text:'你好'}))),mp3);
});
