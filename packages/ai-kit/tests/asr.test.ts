import test from 'node:test';
import assert from 'node:assert/strict';
import {OpenAITranscription} from '../src/index.js';
test('transcribes uploaded bytes without application dependencies',async()=>{
 let called=0;
 const client=new OpenAITranscription({apiKey:'test',fetchImpl:async(url,init)=>{
  called++;assert.equal(url,'https://api.openai.com/v1/audio/transcriptions');
  assert.equal(init.headers.Authorization,'Bearer test');assert.ok(init.body instanceof FormData);
  assert.equal(init.body.get('model'),'gpt-transcribe');
  return Response.json({text:'你好'});
 }});
 assert.deepEqual(await client.transcribe({bytes:Buffer.from('audio'),filename:'voice.wav'}),{text:'你好'});assert.equal(called,1);
});
test('rejects missing credentials, oversized audio and cancellation without requests',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw Error('unexpected');};
 await assert.rejects(new OpenAITranscription({fetchImpl}).transcribe({bytes:Buffer.from('a')}),/OPENAI_API_KEY/);
 const client=new OpenAITranscription({apiKey:'test',fetchImpl});
 await assert.rejects(client.transcribe({bytes:Buffer.alloc(25*1024*1024+1)}),/25MB/);
 await assert.rejects(client.transcribe({bytes:Buffer.from('a'),signal:AbortSignal.abort()}),/取消/);
 assert.equal(calls,0);
});
