import test from 'node:test';import assert from 'node:assert/strict';import {SpeechQueue} from '../src/speech-queue.js';
const settle: any=()=>new Promise((r: any)=>setImmediate(r));
test('speech prefetch preserves serial playback, exact end receipt advances, stop clears late work',async()=>{
 const played: any=[];let count: any=0;const q: any=new SpeechQueue({synthesize:async (item: any)=>({id:'audio'+(++count),text:item.text}),onPlay:(media: any)=>{played.push(media.id);return {revision:played.length};},onStop:()=>{}});
 q.enqueue({text:'一'});q.enqueue({text:'二'});await settle();assert.deepEqual(played,['audio1']);q.ack({id:'wrong',revision:1});await settle();assert.equal(played.length,1);q.ack({id:'audio1',revision:1});await settle();assert.deepEqual(played,['audio1','audio2']);q.stop();assert.equal(q.snapshot().length,0);
 let finish: any;q.synthesize=()=>new Promise((r: any)=>finish=r);q.enqueue({text:'迟到'});await settle();q.stop();finish({id:'late'});await settle();assert.equal(played.includes('late'),false);
});
test('expired queued speech drops and missing playback receipts expire without overlap',async()=>{let now: any=0;const played: any=[];const q: any=new SpeechQueue({clock:()=>now,maxPlaybackMs:100,synthesize:async (i: any)=>({id:i.text}),onPlay:(m: any)=>{played.push(m.id);return {revision:1};},onStop:()=>{}});q.enqueue({text:'第一条'});q.enqueue({text:'过期',expiresAt:20});await settle();now=101;q.tick();await settle();assert.deepEqual(played,['第一条']);assert.equal(q.snapshot().length,0);});
test('synthesis failure cancels already-prefetched speech without starting further requests',async()=>{
 const calls: any=[];const played: any=[];let failFirst: any;let errors: any=0;
 const q: any=new SpeechQueue({synthesize:async (item: any)=>{calls.push(item.text);if(item.text==='失败')await new Promise((_resolve: any,reject: any)=>{failFirst=reject;});return {id:item.text};},onPlay:(media: any)=>{played.push(media.id);return {revision:1};},onError:()=>{errors++;}});
 q.enqueue({text:'失败'});q.enqueue({text:'旧队列'});failFirst(Error('合成失败'));await settle();
 assert.deepEqual(calls,['失败','旧队列']);assert.deepEqual(played,[]);assert.equal(errors,1);assert.equal(q.snapshot().length,0);
 q.enqueue({text:'用户重新操作'});await settle();assert.deepEqual(calls,['失败','旧队列','用户重新操作']);assert.deepEqual(played,['用户重新操作']);q.stop();
});
test('playback error clears old pending queue while retaining a new interaction from the error callback',async()=>{
 const calls: any=[];const q: any=new SpeechQueue({synthesize:async (item: any)=>{calls.push(item.text);return {id:item.text};},onPlay:()=>({revision:1}),onError:()=>{q.enqueue({text:'新的用户操作'});}});
 q.enqueue({text:'正在播放'});q.enqueue({text:'不可继续付费的旧队列'});await settle();
 assert.equal(q.ack({id:'正在播放',revision:1,error:true}),true);await settle();
 assert.deepEqual(calls,['正在播放','不可继续付费的旧队列','新的用户操作']);assert.equal(q.snapshot()[0].mediaId,'新的用户操作');q.stop();
});
test('playback timeout stops every pending item rather than continuing the queue',async()=>{
 let now: any=0;const calls: any=[];let errors: any=0;
 const q: any=new SpeechQueue({clock:()=>now,maxPlaybackMs:100,synthesize:async (item: any)=>{calls.push(item.text);return {id:item.text};},onPlay:()=>({revision:1}),onError:()=>{errors++;}});
 q.enqueue({text:'未收到播放回执'});q.enqueue({text:'待播内容'});await settle();now=101;q.tick();await settle();
 assert.deepEqual(calls,['未收到播放回执','待播内容']);assert.equal(errors,1);assert.deepEqual(q.snapshot(),[]);
});
test('a cancelled task failing late cannot clear a newer queue generation',async()=>{
 let failOld: any;let errors: any=0;const played: any=[];
 const q: any=new SpeechQueue({synthesize:async (item: any)=>{if(item.text==='旧请求')await new Promise((_resolve: any,reject: any)=>{failOld=reject;});return {id:item.text};},onPlay:(media: any)=>{played.push(media.id);return {revision:1};},onError:()=>{errors++;}});
 q.enqueue({text:'旧请求'});q.stop();q.enqueue({text:'新请求'});await settle();failOld(Error('旧请求迟到失败'));await settle();
 assert.equal(errors,0);assert.deepEqual(played,['新请求']);assert.equal(q.snapshot()[0].mediaId,'新请求');q.stop();
});
test('two synthesis jobs prefetch concurrently while playback follows enqueue order',async()=>{
 const waiting: any=new Map(),calls: any=[],played: any=[];let concurrent: any=0,max: any=0;
 const q: any=new SpeechQueue({synthesize:(item: any)=>{calls.push(item.text);max=Math.max(max,++concurrent);return new Promise((resolve: any)=>waiting.set(item.text,(value: any)=>{concurrent--;resolve(value);}));},onPlay:(media: any)=>{played.push(media.id);return {revision:played.length};}});
 q.enqueue({text:'first'});q.enqueue({text:'second'});q.enqueue({text:'third'});
 assert.deepEqual(calls,['first','second']);assert.equal(max,2);
 waiting.get('second')({id:'two'});await settle();assert.deepEqual(played,[]);assert.deepEqual(calls,['first','second','third']);
 waiting.get('first')({id:'one'});await settle();assert.deepEqual(played,['one']);
 waiting.get('third')({id:'three'});await settle();assert.deepEqual(played,['one']);
 assert.equal(q.ack({id:'one',revision:99}),false);assert.equal(q.ack({id:'one',revision:1}),true);await settle();assert.deepEqual(played,['one','two']);q.stop();
});
test('stream completion retains synthesis permit beyond first playable media',async()=>{
 const completions: any=new Map(),calls: any=[],played: any=[];
 const q: any=new SpeechQueue({synthesize:async (item: any)=>{calls.push(item.text);return {media:{id:item.text},completion:new Promise((resolve: any)=>completions.set(item.text,resolve))};},onPlay:(media: any)=>{played.push(media.id);return {revision:played.length};}});
 q.enqueue({text:'first'});q.enqueue({text:'second'});q.enqueue({text:'third'});await settle();
 assert.deepEqual(calls,['first','second']);assert.deepEqual(played,['first']);
 q.ack({id:'first',revision:1});await settle();assert.deepEqual(played,['first','second']);assert.deepEqual(calls,['first','second']);
 completions.get('first')();await settle();assert.deepEqual(calls,['first','second','third']);
 q.stop();for(const finish of completions.values())finish();await settle();
});
test('stop aborts every prefetch and late stream failures do not clear a new generation',async()=>{
 const signals: any=[],finish: any=[];let errors: any=0;const played: any=[];
 const q: any=new SpeechQueue({synthesize:async(item: any,signal: any)=>{signals.push(signal);return {media:{id:item.text},completion:new Promise((resolve: any,reject: any)=>finish.push({resolve,reject}))};},onPlay:(media: any)=>{played.push(media.id);return {revision:played.length};},onError:()=>errors++});
 q.enqueue({text:'old1'});q.enqueue({text:'old2'});await settle();q.stop();assert.equal(signals.every((signal: any)=>signal.aborted),true);
 q.enqueue({text:'new'});finish[0].reject(Error('old stream'));finish[1].resolve();await settle();assert.equal(errors,0);assert.deepEqual(played,['old1','new']);q.stop();finish[2].resolve();await settle();
});
test('expired prefetch is aborted and stream error is attributed to its own item',async()=>{
 let now: any=0;let failed: any;const signals: any={},errors: any=[];const played: any=[];
 const q: any=new SpeechQueue({clock:()=>now,synthesize:async(item: any,signal: any)=>{signals[item.text]=signal;return {media:{id:item.text},completion:item.text==='second'?new Promise((resolve: any,reject: any)=>failed=reject):Promise.resolve()};},onPlay:(media: any)=>{played.push(media.id);return {revision:played.length};},onError:(error: any,item: any)=>errors.push(item.text)});
 q.enqueue({text:'first'});q.enqueue({text:'expired',expiresAt:5});await settle();now=10;q.tick();assert.equal(signals.expired.aborted,true);
 q.enqueue({text:'second'});await settle();failed(Error('prefetch failure'));await settle();assert.deepEqual(errors,['second']);assert.deepEqual(played,['first']);assert.deepEqual(q.snapshot(),[]);
});
test('waiting backlog is bounded and old prefetched items are cancelled when fresher speech arrives',async()=>{
 const signals: any={};const q: any=new SpeechQueue({maxPending:2,synthesize:async(item: any,signal: any)=>{signals[item.text]=signal;return {id:item.text};},onPlay:()=>({revision:1})});
 q.enqueue({text:'playing'});await settle();q.enqueue({text:'old'});q.enqueue({text:'keep'});q.enqueue({text:'fresh'});await settle();
 assert.deepEqual(q.snapshot().map((item: any)=>item.text),['playing','keep','fresh']);assert.equal(signals.old.aborted,true);q.stop();
});
