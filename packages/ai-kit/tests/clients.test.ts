import test from 'node:test';
import assert from 'node:assert/strict';
import {JsonTextClient, OpenAIImage, OpenAITranscription} from '../src/index.js';
test('generic text client preserves caller instruction and custom endpoint',async()=>{
 const client=new JsonTextClient({apiKey:'mock',baseUrl:'https://example.test/api',fetchImpl:async(url,init)=>{
  assert.equal(url,'https://example.test/api/chat/completions');
  const body=JSON.parse(String(init.body));assert.deepEqual(body.messages,[{role:'system',content:'Return JSON'},{role:'user',content:'{"hello":"world"}'}]);assert.equal(body.max_tokens,42);
  return Response.json({choices:[{message:{content:'{"ok":true}'}}]});
 }});
 assert.deepEqual(await client.complete('Return JSON',{hello:'world'},undefined,{maxTokens:42}),{ok:true});
});
test('generic image client does not add application prompts',async()=>{
 const png=Buffer.from('89504e470d0a1a0a','hex');
 const client=new OpenAIImage({apiKey:'mock',fetchImpl:async(_url,init)=>{
  assert.equal(JSON.parse(String(init.body)).prompt,'a cat');
  return Response.json({data:[{b64_json:png.toString('base64')}]});
 }});
 assert.deepEqual((await client.generate({prompt:'a cat'})).bytes,png);
});
test('ASR never exposes vendor errors or retries paid requests',async()=>{
 let calls=0;const client=new OpenAITranscription({apiKey:'mock',fetchImpl:async()=>{
  calls++;return new Response('secret upstream details',{status:429});
 }});
 await assert.rejects(client.transcribe({bytes:Buffer.from('audio')}),error=>/受限/.test(String(error))&&!String(error).includes('secret'));
 assert.equal(calls,1);
});
test('text client rejects truncated or non-object JSON',async()=>{
 for(const choice of [{finish_reason:'length',message:{content:'{}'}},{message:{content:'[]'}},{message:{content:'invalid'}}]){
  const client=new JsonTextClient({apiKey:'mock',fetchImpl:async()=>Response.json({choices:[choice]})});
  await assert.rejects(client.complete('Return JSON',{}));
 }
});
