import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {Application} from '../src/app.js';
import {resolveArtReferences} from '../src/art-references.js';
async function setup(t: any,speech: any){const dataDir: any=await mkdtemp(join(tmpdir(),'app-stream-'));const capture: any=new EventEmitter();capture.stop=async()=>{};const app: any=await new Application({dataDir,capture,speech,autoTick:false,artReferences:(raw: any)=>resolveArtReferences(raw,{readReference:()=>Buffer.from('ffd8ff00','hex')})}).open();t.after(async()=>{await app.close();await rm(dataDir,{recursive:true,force:true});});return {app,dataDir,capture};}
const settle: any=()=>new Promise((resolve: any)=>setImmediate(resolve));
test('partial speech is playable but never restored as a completed replay',async (t: any)=>{
 let release: any;const gate: any=new Promise((resolve: any)=>release=resolve);
 const {app,dataDir,capture}=await setup(t,{openStream:async()=>({chunks:(async function*(){yield Buffer.from('ID3first');await gate;yield Buffer.from('last');})()})});
 const {media,completion}=await app.prepareSpeech({text:'欢迎'});assert.equal(app.snapshot().speech.length,1);assert.equal(media.streaming,true);await app.flush();
 const restored: any=await new Application({dataDir,capture,autoTick:false}).open();assert.equal(restored.snapshot().speech.length,0);await restored.close();
 release();await completion;assert.equal(app.snapshot().speech[0].streaming,false);assert.equal((await readFile(join(dataDir,'media',media.id))).toString(),'ID3firstlast');
});
test('stop during first packet wait prevents late media from entering history or stage',async (t: any)=>{
 let release: any,observed: any;const gate: any=new Promise((resolve: any)=>release=resolve);
 const {app}=await setup(t,{openStream:async({signal}: any)=>{observed=signal;return {chunks:(async function*(){await gate;yield Buffer.from('ID3late');})()};}});
 const pending: any=app.dispatch({action:'speak',text:'等待首段'});await settle();await app.dispatch({action:'stop-speech'});assert.equal(observed.aborted,true);await pending;release();await settle();assert.equal(app.snapshot().speech.length,0);assert.equal(app.snapshot().stage.speechId,null);
});
test('changing theme cancels stream after publication and cannot recreate a replay',async (t: any)=>{
 let release: any;const gate: any=new Promise((resolve: any)=>release=resolve);
 const {app,dataDir}=await setup(t,{openStream:async()=>({chunks:(async function*(){yield Buffer.from('ID3first');await gate;yield Buffer.from('late');})()})});
 const {media,completion}=await app.prepareSpeech({text:'上一主题'});await app.dispatch({action:'theme',title:'新主题'});await assert.rejects(completion,/取消/);release();assert.equal(app.snapshot().speech.length,0);assert.equal(app.snapshot().stage.speechId,null);await assert.rejects(readFile(join(dataDir,'media',media.id)),{code:'ENOENT'});
});
test('actual image dispatch applies shared art direction to a host supplied candidate',async (t: any)=>{
 const {app}=await setup(t,{});let sent: any;
 await app.dispatch({action:'theme',title:'月亮便利店'});app.state.selections=[{commentId:'idea',text:'月饼',nickname:'观众',prompt:'一枚月饼'}];
 app.image={generate:async (input: any)=>{sent=input;return {bytes:Buffer.from('png'),mime:'image/png'};}};
 await app.dispatch({action:'generate',commentId:'idea',format:'png'});assert.match(sent.prompt,/朴素/);assert.match(sent.prompt,/中国电影/);assert.match(sent.prompt,/月饼/);assert.equal(app.snapshot().artworks[0].prompt,sent.prompt);
});
test('manual speech stays busy through final streaming packet without blocking early playback',async (t: any)=>{
 let release: any,calls: any=0;const gate: any=new Promise((resolve: any)=>release=resolve);
 const {app}=await setup(t,{openStream:async()=>{calls++;return {chunks:(async function*(){yield Buffer.from('ID3first');await gate;yield Buffer.from('last');})()};}});
 await app.dispatch({action:'speak',text:'第一条'});assert.ok(app.snapshot().stage.speechId);assert.ok(app.snapshot().busy.includes('speak'));
 await assert.rejects(app.dispatch({action:'speak',text:'重复点击'}),/进行中/);assert.equal(calls,1);
 release();for(let i: any=0;i<20&&app.snapshot().busy.includes('speak');i++)await settle();assert.equal(app.snapshot().busy.includes('speak'),false);
});
test('Moonlight Box dispatch supplies local reference bytes with verified reference directions',async (t: any)=>{
 const {app}=await setup(t,{});let sent: any;
 await app.dispatch({action:'theme',title:'月亮便利店'});app.state.selections=[{commentId:'movie-prop',text:'月光宝盒 随时随地都能穿越用',nickname:'观众',prompt:'一只发光铜宝箱'}];
 app.image={generate:async (input: any)=>{sent=input;return {bytes:Buffer.from('png'),mime:'image/png'};}};
 await app.dispatch({action:'generate',commentId:'movie-prop',format:'png'});assert.equal(sent.references.length,1);assert.ok(Buffer.isBuffer(sent.references[0].bytes));assert.match(sent.prompt,/对开结构/);assert.match(sent.prompt,/参考图/);assert.equal(app.snapshot().artworks[0].references[0].id,'moonlight-box-film');
});
test('validated same-viewer supplements supply both the named prop reference and explicit audience style',async (t: any)=>{
 const {app}=await setup(t,{});let sent: any;await app.dispatch({action:'theme',title:'月亮便利店'});
 const main: any={id:'first',text:'穿越用的盒子',userId:'u1',roomId:'r1',source:'live'}, supplement: any={id:'second',text:'就是月光宝盒，做成水彩风',userId:'u1',roomId:'r1',source:'live'}, stranger: any={id:'other',text:'不要水彩，画霓虹赛博',userId:'u2',roomId:'r1',source:'live'};
 app.state.selections=[{...main,commentId:'first',nickname:'观众',prompt:'普通宝箱',sourceIds:['first','second'],sources:[main,supplement,stranger]}];
 app.image={generate:async (input: any)=>{sent=input;return {bytes:Buffer.from('png'),mime:'image/png'};}};
 await app.dispatch({action:'generate',commentId:'first',format:'png'});assert.equal(sent.references.length,1);assert.match(sent.prompt,/就是月光宝盒，做成水彩风/);assert.ok(!sent.prompt.includes(stranger.text));
});
test('SDK completion failure after local chunks finish removes the replay and persisted file',async (t: any)=>{
 const provider=Promise.withResolvers<void>();
 const {app,dataDir}=await setup(t,{openStream:async()=>({chunks:(async function*(){yield Buffer.from('ID3complete');})(),completion:provider.promise})});
 const {media,completion}=await app.prepareSpeech({text:'等待 SDK 完成'});void completion.catch(()=>{});
 await settle();await settle();
 assert.equal(app.snapshot().speech[0].streaming,true);
 provider.reject(Error('provider cleanup failed'));
 await assert.rejects(completion,/provider cleanup failed/);
 assert.equal(app.snapshot().speech.length,0);
 await assert.rejects(readFile(join(dataDir,'media',media.id)),{code:'ENOENT'});
});
