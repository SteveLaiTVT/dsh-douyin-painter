import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MiniMaxSpeech} from '../src/providers/minimax.js';
import {OpenAIImage} from '../src/providers/openai.js';
import {Application} from '../src/app.js';
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
test('application speech adapter uses SDK concurrency and exposes queue diagnostics',async()=>{
 const responses:Array<(r:Response)=>void>=[];const speech=new MiniMaxSpeech({apiKey:'mock',fetchImpl:async()=>new Promise<Response>(resolve=>responses.push(resolve))});
 const requests=[1,2,3].map(()=>speech.synthesize({text:'你好'}));await tick();
 assert.equal(responses.length,2);assert.equal(speech.service.stats().running,2);assert.equal(speech.service.stats().queued,1);
 const response=()=>Response.json({base_resp:{status_code:0},data:{status:2,audio:'49443304000000000000'}});
 responses[0](response());await requests[0];await tick();assert.equal(responses.length,3);
 responses[1](response());responses[2](response());await Promise.all(requests);await speech.close();
 assert.equal(speech.service.stats().outstanding,0);
});
test('application close cancels SDK streams and closes both generation services',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'generation-close-'));
 const speech=new MiniMaxSpeech({apiKey:'mock',fetchImpl:async()=>new Response(new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({base_resp:{status_code:0},data:{status:1,audio:'49443304000000000000'}})+'\n\n'));}}),{headers:{'content-type':'text/event-stream'}})});
 const image=new OpenAIImage({apiKey:'mock'});const capture=new EventEmitter() as EventEmitter & {stop():Promise<void>};capture.stop=async()=>{};
 const app=await new Application({dataDir:directory,speech,image,capture}).open();
 try{
  const live=await speech.openStream({text:'你好'});assert.equal(speech.service.stats().running,1);
  await app.close();await assert.rejects(live.completion,{code:'CANCELLED'});
  assert.equal(speech.service.stats().closed,true);assert.equal(image.service.stats().closed,true);assert.equal(speech.service.stats().outstanding,0);
 }finally{await app.close();await rm(directory,{recursive:true,force:true});}
});
