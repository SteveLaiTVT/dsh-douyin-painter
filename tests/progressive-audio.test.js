import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import {ProgressiveAudio} from '../src/progressive-audio.js';
async function setup(t){const dir=await mkdtemp(join(tmpdir(),'progressive-'));const store=new ProgressiveAudio({directory:dir});t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});return {dir,store};}
test('progressive MP3 is readable before upstream finishes and final audio persists once',async t=>{
 const {dir,store}=await setup(t);let finish;const gate=new Promise(r=>finish=r);const head=Buffer.from('ID3first'),tail=Buffer.from('last');
 const {media,completion}=await store.open({chunks:(async function*(){yield head;await gate;yield tail;})()});
 let completed=false;completion.then(()=>completed=true);
 const server=http.createServer((req,res)=>{void store.serve(media.id,req,res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const response=await fetch(`http://127.0.0.1:${server.address().port}`);const reader=response.body.getReader();
 assert.equal(response.headers.get('content-type'),'audio/mpeg');assert.equal(completed,false);assert.deepEqual(Buffer.from((await reader.read()).value),head);
 finish();await completion;const parts=[];for(;;){const {value,done}=await reader.read();if(done)break;parts.push(Buffer.from(value));}
 assert.deepEqual(Buffer.concat(parts),tail);assert.deepEqual(await readFile(join(dir,media.id)),Buffer.concat([head,tail]));
});
test('abort ends a pending stream without a file or a late publish',async t=>{
 const {dir,store}=await setup(t);const controller=new AbortController();let finish;const gate=new Promise(r=>finish=r);
 const {media,completion}=await store.open({signal:controller.signal,chunks:(async function*(){yield Buffer.from('ID3head');await gate;yield Buffer.from('late');})()});
 controller.abort();await assert.rejects(completion,/取消/);await assert.rejects(readFile(join(dir,media.id)),{code:'ENOENT'});finish();
});
test('empty or oversized audio is rejected before it can be published',async t=>{
 const {store}=await setup(t);await assert.rejects(store.open({chunks:(async function*(){})()}),/音频/);
 await assert.rejects(store.open({chunks:(async function*(){yield Buffer.alloc(11*1024*1024);})()}),/过大/);
});
