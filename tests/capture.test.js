import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { Capture, normalizeRoom, parseCaptureLine } from '../src/capture.js';

test('room accepts direct IDs and exact Douyin live URLs', () => {
  assert.equal(normalizeRoom(' 551467145991 '), '551467145991');
  assert.equal(normalizeRoom('https://live.douyin.com/551467145991?foo=1'), '551467145991');
  for (const room of ['', 'https://evil.example/123', 'https://live.douyin.com.evil/123', '../123', '123\n456']) assert.throws(() => normalizeRoom(room));
});
test('JSONL normalization preserves comment identity and ignores malformed payloads', () => {
  assert.deepEqual(parseCaptureLine('{"type":"comment","id":"a","text":"画一只猫","nickname":"观众","userId":"u","receivedAt":1}'), { type: 'comment', id: 'a', text: '画一只猫', nickname: '观众', userId: 'u', receivedAt: 1 });
  assert.equal(parseCaptureLine('not json'), null);
  assert.equal(parseCaptureLine('{"type":"comment","text":10}'), null);
});
function child() {
  const c = new EventEmitter();
  c.stdout = new PassThrough(); c.stderr = new PassThrough(); c.stdin = new PassThrough();
  c.kill = signal => { queueMicrotask(() => c.emit('exit', null, signal)); return true; };
  return c;
}
test('managed process forwards split JSONL, keeps cookies off argv, and shuts down', async () => {
  const c = child(); let spawned;
  const cap = new Capture({ binary: '/capture', cookie: 'secret-cookie', prepare: async () => '/capture', spawnImpl: (...args) => { spawned = args; queueMicrotask(() => c.emit('spawn')); return c; } });
  const comments = [], statuses = [];
  cap.on('comment', x => comments.push(x)); cap.on('status', x => statuses.push(x));
  await cap.start('123');
  c.stdout.write('{"type":"comment","id":"m","text":"hello",');
  c.stdout.write('"nickname":"n","userId":"u","receivedAt":1}\n');
  assert.equal(comments[0].text, 'hello');
  assert.deepEqual(spawned[1], ['--room', '123']);
  assert.equal(spawned[2].env.PAINTER_CAPTURE_COOKIE, 'secret-cookie');
  assert.ok(!spawned[1].includes('secret-cookie'));
  await cap.stop();
  assert.equal(statuses.at(-1).state, 'stopped');
});
test('missing binary and process failures produce actionable status', async () => {
  const cap = new Capture({ prepare: async () => { throw Error('请安装 Go'); } });
  const statuses = []; cap.on('status', s => statuses.push(s));
  await assert.rejects(cap.start('123'), /Go/);
  assert.equal(statuses.at(-1).state, 'error');
});
test('child crash reports failure without leaking stderr credentials', async () => {
  const c = child();
  const cap = new Capture({ binary:'/capture', prepare: async () => '/capture', spawnImpl: () => { queueMicrotask(() => c.emit('spawn')); return c; } });
  const statuses=[]; cap.on('status', s => statuses.push(s));
  await cap.start('123');
  c.stderr.write('cookie=private'); c.emit('exit', 1, null);
  assert.equal(statuses.at(-1).state, 'error');
  assert.ok(!statuses.at(-1).message.includes('private'));
});
test('stop during first-use preparation prevents late subprocess spawn', async () => {
  let finish; let spawned = false;
  const cap = new Capture({ prepare: ({signal}) => new Promise(resolve => { finish = resolve; signal.addEventListener('abort',()=>resolve('/capture'),{once:true}); }), spawnImpl: () => { spawned = true; return child(); } });
  const pending = cap.start('123');
  await new Promise(resolve => setImmediate(resolve));
  await cap.stop(); finish('/capture'); await pending;
  assert.equal(spawned, false);
});
test('split multibyte UTF8 comment is decoded without corruption', async () => {
  const c = child();
  const cap = new Capture({ prepare: async () => '/capture', spawnImpl: () => { queueMicrotask(() => c.emit('spawn')); return c; } });
  const comments=[]; cap.on('comment', x => comments.push(x));
  await cap.start('123');
  const bytes = Buffer.from('{"type":"comment","text":"猫"}\n');
  const split = bytes.indexOf(Buffer.from('猫')) + 1;
  c.stdout.write(bytes.subarray(0,split)); c.stdout.write(bytes.subarray(split));
  assert.equal(comments[0].text, '猫');
  await cap.stop();
});
test('stop retains ownership and waits for exit after SIGKILL escalation', async () => {
  const c = child(); const signals=[]; let exited=false;
  c.kill = signal => { signals.push(signal); if(signal==='SIGKILL')setTimeout(()=>{exited=true;c.emit('exit',null,signal);},50); return true; };
  const cap=new Capture({prepare:async()=>'/capture',stopTimeoutMs:5,killTimeoutMs:200,spawnImpl:()=>{queueMicrotask(()=>c.emit('spawn'));return c;}});
  await cap.start('123');
  const stopping=cap.stop();
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(cap.child,c,'process remains owned until actual exit');
  await stopping;
  assert.equal(exited,true,'stop only succeeds after exit');
  assert.equal(cap.child,null);
  assert.deepEqual(signals,['SIGTERM','SIGKILL']);
});
test('unreaped child makes stop fail and prevents replacement start', async () => {
  const c=child();let spawns=0;c.kill=()=>true;
  const cap=new Capture({prepare:async()=>'/capture',stopTimeoutMs:5,killTimeoutMs:10,spawnImpl:()=>{spawns++;queueMicrotask(()=>c.emit('spawn'));return c;}});
  await cap.start('123');
  await assert.rejects(cap.stop(),/退出/);
  assert.equal(cap.child,c);
  await assert.rejects(cap.start('456'),/退出/);
  assert.equal(spawns,1);
  c.emit('exit',null,'SIGKILL');
  await cap.stop();
});
test('spawn failure without exit releases ownership and does not block later stop', async () => {
  const c=child();let kills=0;c.kill=()=>{kills++;return true;};
  const cap=new Capture({prepare:async()=>'/missing',stopTimeoutMs:5,killTimeoutMs:10,spawnImpl:()=>{queueMicrotask(()=>c.emit('error',Object.assign(Error('missing'),{code:'ENOENT'})));return c;}});
  await assert.rejects(cap.start('123'),/无法启动/);
  assert.equal(cap.child,null);
  await cap.stop();assert.equal(kills,0);
});
test('stop cancels first-use preparation and waits for its cleanup', async () => {
  let ready;const started=new Promise(resolve=>ready=resolve);let cleaned=false;
  const cap=new Capture({prepare:({signal})=>new Promise((resolve,reject)=>{
    signal.addEventListener('abort',()=>setTimeout(()=>{cleaned=true;reject(signal.reason);},30),{once:true});ready();
  })});
  const starting=cap.start('123');await started;
  await cap.stop();assert.equal(cleaned,true);await starting;
});
test('capture setup cancellation reaps build process before rejecting and permits retry', async () => {
  const {ensureCapture}=await import('../scripts/setup-capture.mjs');
  let spawned;const ready=new Promise(resolve=>spawned=resolve);let exited=false;
  const controller=new AbortController();const c=child();
  c.kill=signal=>{setTimeout(()=>{exited=true;c.emit('exit',null,signal);},30);return true;};
  const pending=ensureCapture({force:true,signal:controller.signal,spawnImpl:()=>{spawned();return c;}});
  await ready;controller.abort();
  await assert.rejects(pending,e=>e.name==='AbortError');assert.equal(exited,true);
  await assert.rejects(ensureCapture({force:true,spawnImpl:()=>{const retry=child();queueMicrotask(()=>retry.emit('error',Object.assign(Error('mock missing go'),{code:'ENOENT'})));return retry;}}),/Go/);
});
test('capture status preserves upstream, chat and decoder diagnostics without raw payloads',()=>{
 const event=parseCaptureLine(JSON.stringify({type:'status',state:'running',message:'上游有消息，暂无评论',receivedMessages:10,receivedComments:0,decodedComments:0,lastMessageAt:12345,lastCommentAt:0,decodeErrors:0,cookie:'must-not-pass',payload:'must-not-pass'}));
 assert.equal(event.receivedMessages,10);assert.equal(event.decodedComments,0);assert.equal(event.lastMessageAt,12345);assert.equal(event.cookie,undefined);assert.equal(event.payload,undefined);
});
