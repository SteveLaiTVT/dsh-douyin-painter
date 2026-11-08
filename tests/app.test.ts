import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Application } from '../src/app.js';
async function setup(t: any, overrides: any={}) {
 const dataDir: any=await mkdtemp(join(tmpdir(),'theme-test-'));
 const capture: any=new EventEmitter(); capture.start=async()=>{}; capture.stop=async()=>{};
 const text: any={explain:async()=>({text:'围绕月球展开想象'}),select:async({comments}: any)=>({selections:comments.slice(0,3).map((c: any)=>({commentId:c.id,reason:'有趣',prompt:'月球上的猫'}))}),evaluate:async()=>({eligible:true,score:8,reason:'切题',reply:'真有想象力'}),reply:async()=>({text:'这只猫很有趣'})};
 const app: any=new Application({dataDir,capture,text,image:{generate:async()=>({bytes:Buffer.from('png'),mime:'image/png'})},speech:{synthesize:async()=>({bytes:Buffer.from('mp3'),mime:'audio/mpeg'})},...overrides});
 await app.open(); t.after(async()=>{await app.close();await rm(dataDir,{recursive:true,force:true});});return {app,capture,dataDir};
}
test('theme competition, response, image and speech compose without live API',async (t: any)=>{
 const {app}=await setup(t);await app.dispatch({action:'theme',title:'月球奇遇',rules:'发挥想象'});
 await app.dispatch({action:'start'});await app.dispatch({action:'manual',text:'戴草帽的月球猫',nickname:'观众'});
 const c: any=app.snapshot().comments[0];await app.dispatch({action:'close-round'});await app.dispatch({action:'select'});
 assert.equal(app.snapshot().selections[0].commentId,c.id);
 await app.dispatch({action:'reply',commentId:c.id});assert.equal(app.snapshot().comments[0].reply,'这只猫很有趣');
 await app.dispatch({action:'generate',commentId:c.id});assert.match(app.snapshot().artworks[0].url,/^\/media\//);
 await app.dispatch({action:'speak',text:'欢迎参加'});assert.equal(app.snapshot().stage.speechId,app.snapshot().speech[0].id);
 await app.dispatch({action:'stop-speech'});assert.equal(app.snapshot().stage.speechId,null);
});
test('late generation cannot replace a new theme, duplicate clicks do not bill twice',async (t: any)=>{
 let finish: any;let calls: any=0;const {app}=await setup(t,{image:{generate:()=>{calls++;return new Promise((r: any)=>finish=r)}}});
 await app.dispatch({action:'theme',title:'猫'});await app.dispatch({action:'start'});await app.dispatch({action:'manual',text:'月球猫'});await app.dispatch({action:'close-round'});await app.dispatch({action:'select'});
 const commentId: any=app.snapshot().comments[0].id;const first: any=app.dispatch({action:'generate',commentId});
 await assert.rejects(app.dispatch({action:'generate',commentId}),/进行中/);
 await app.dispatch({action:'theme',title:'海洋'});finish({bytes:Buffer.from('png'),mime:'image/png'});await first;
 assert.equal(calls,1);assert.equal(app.snapshot().artworks.length,0);assert.equal(app.snapshot().theme.title,'海洋');
});
test('model cannot invent contestants, empty rounds cannot select',async (t: any)=>{
 const {app}=await setup(t,{text:{select:async()=>({selections:[{commentId:'invented',reason:'x',prompt:'x'}]})}});
 await app.dispatch({action:'theme',title:'猫'});await app.dispatch({action:'start'});await app.dispatch({action:'close-round'});
 await assert.rejects(app.dispatch({action:'select'}),/投稿/);
 await app.dispatch({action:'start'});await app.dispatch({action:'manual',text:'小猫'});await app.dispatch({action:'close-round'});
 await assert.rejects(app.dispatch({action:'select'}),/候选/);
});
test('capture comments deduplicate and persistence survives restart without auto playback',async (t: any)=>{
 const {app,capture,dataDir}=await setup(t);await app.dispatch({action:'theme',title:'猫'});await app.dispatch({action:'start'});
 capture.emit('comment',{id:'same',text:'小猫',nickname:'观众'});capture.emit('comment',{id:'same',text:'小猫'});assert.equal(app.snapshot().comments.length,1);
 await app.flush();const restored: any=new Application({dataDir,capture});await restored.open();assert.equal(restored.snapshot().theme.title,'猫');assert.equal(restored.snapshot().round.status,'closed');assert.equal(restored.snapshot().stage.speechId,null);await restored.close();
});
test('stop and clear prevent pending media from returning to stage',async (t: any)=>{
 let finishSpeech: any;const {app}=await setup(t,{speech:{synthesize:()=>new Promise((resolve: any)=>finishSpeech=resolve)}});
 const pending: any=app.dispatch({action:'speak',text:'稍后朗读'});await app.dispatch({action:'stop-speech'});
 finishSpeech({bytes:Buffer.from('mp3'),mime:'audio/mpeg'});await pending;assert.equal(app.snapshot().stage.speechId,null);
 await app.dispatch({action:'theme',title:'猫'});await app.dispatch({action:'start'});await app.dispatch({action:'manual',text:'月球猫'});await app.dispatch({action:'close-round'});await app.dispatch({action:'select'});
 let finishImage: any;app.image={generate:()=>new Promise((resolve: any)=>finishImage=resolve)};
 const image: any=app.dispatch({action:'generate',commentId:app.snapshot().comments[0].id});await app.dispatch({action:'clear-stage'});finishImage({bytes:Buffer.from('png'),mime:'image/png'});await image;
 assert.equal(app.snapshot().stage.artworkId,null);assert.equal(app.snapshot().artworks.length,1);
});
test('close during media write cannot publish after shutdown',async (t: any)=>{
 const {app}=await setup(t);let release: any;let entered: any;const writing: any=new Promise((r: any)=>entered=r);
 app.media=async()=>{entered();return new Promise((r: any)=>release=r);};
 const pending: any=app.dispatch({action:'speak',text:'稍后完成'});await writing;await app.close();
 release({id:'late',url:'/media/late',text:'稍后完成'});await pending;
 assert.equal(app.snapshot().speech.length,0);assert.equal(app.snapshot().stage.speechId,null);
});
test('duplicate speech request leaves the first accepted synthesis eligible to play',async (t: any)=>{
 let finish: any;let calls: any=0;const {app}=await setup(t,{speech:{synthesize:()=>{calls++;return new Promise((resolve: any)=>finish=resolve);}}});
 const accepted: any=app.dispatch({action:'speak',text:'第一句话'});await assert.rejects(app.dispatch({action:'speak',text:'第二句话'}),/进行中/);
 finish({bytes:Buffer.from('mp3'),mime:'audio/mpeg'});await accepted;
 assert.equal(calls,1);assert.equal(app.snapshot().stage.speechId,app.snapshot().speech[0].id);
});

test('invalid persisted shapes retain usable defaults instead of poisoning state',async (t: any)=>{
 const {app,dataDir,capture}=await setup(t);await app.close();
 await writeFile(join(dataDir,'state.json'),JSON.stringify({version:1,state:{comments:null,round:null,theme:null}}));
 const restored: any=new Application({dataDir,capture});await restored.open();
 assert.equal(restored.snapshot().theme.title,'');assert.deepEqual(restored.snapshot().comments,[]);assert.ok(restored.snapshot().errors.length);
 await restored.dispatch({action:'theme',title:'恢复后的主题'});assert.equal(restored.snapshot().theme.title,'恢复后的主题');await restored.close();
});
test('UID, room and raw repetitions survive the business layer; one viewer gets one finalist',async (t: any)=>{
 const {app,capture}=await setup(t,{text:{select:async({comments}: any)=>({selections:comments.slice(0,2).map((c: any)=>({commentId:c.id,reason:'有画面感',prompt:c.text}))})}});
 await app.dispatch({action:'room',room:'https://live.douyin.com/551467145991'});await app.dispatch({action:'theme',title:'月球便利店'});await app.dispatch({action:'start'});
 capture.emit('comment',{id:'a',userId:'u',nickname:'观众',text:'月光罐头'});capture.emit('comment',{id:'b',userId:'u',nickname:'观众',text:'哈哈'});capture.emit('comment',{id:'c',userId:'u',nickname:'观众',text:'会发光的猫'});capture.emit('comment',{id:'d',userId:'u',nickname:'观众',text:'月光罐头'});
 const comments: any=app.snapshot().comments;assert.equal(comments[0].userId,'u');assert.equal(comments[0].occurrenceCount,2);assert.equal(comments[3].duplicateOf,'a');assert.equal(comments.length,4);
 await app.dispatch({action:'close-round'});await assert.rejects(app.dispatch({action:'select'}),/同一位观众/);
 app.text.select=async()=>({selections:[{commentId:'a',reason:'有创意',prompt:'月光罐头',sourceIds:['a','c']}]});await app.dispatch({action:'select'});assert.deepEqual(app.snapshot().selections[0].sources.map((c: any)=>c.text),['月光罐头','会发光的猫']);
});
test('room settings persist separately from connection and unknown UID never uses nickname identity',async (t: any)=>{
 const {app,capture,dataDir}=await setup(t);await app.dispatch({action:'room',room:'551467145991'});await app.dispatch({action:'theme',title:'猫'});await app.dispatch({action:'start'});
 capture.emit('comment',{id:'a',text:'小猫',nickname:'同名'});capture.emit('comment',{id:'b',text:'小猫',nickname:'同名'});assert.equal(app.snapshot().comments[0].occurrenceCount,1);
 await app.dispatch({action:'disconnect'});await app.flush();const restored: any=await new Application({dataDir,capture}).open();assert.equal(restored.snapshot().settings.room,'551467145991');assert.equal(restored.snapshot().capture.state,'disconnected');await restored.close();
});
test('different rooms can reuse a source message ID without losing a comment',async (t: any)=>{
 const {app,capture}=await setup(t);await app.dispatch({action:'theme',title:'猫'});await app.dispatch({action:'start'});
 capture.emit('comment',{id:'same-id',userId:'u',roomId:'first',text:'月亮猫'});capture.emit('comment',{id:'same-id',userId:'u',roomId:'second',text:'火星猫'});
 assert.equal(app.snapshot().comments.length,2);assert.notEqual(app.snapshot().comments[0].id,app.snapshot().comments[1].id);
 capture.emit('comment',{id:'same-id',userId:'u',roomId:'second',text:'火星猫'});assert.equal(app.snapshot().comments.length,2);
});
test('manual UID uses saved room after disconnecting a previous room',async (t: any)=>{
 const {app}=await setup(t);await app.dispatch({action:'theme',title:'猫'});await app.dispatch({action:'start'});
 await app.dispatch({action:'connect',room:'A'});await app.dispatch({action:'disconnect'});await app.dispatch({action:'room',room:'B'});
 await app.dispatch({action:'manual',text:'月亮猫',userId:'u'});assert.equal(app.snapshot().comments[0].roomId,'B');
 await app.dispatch({action:'connect',room:'B'});await app.dispatch({action:'manual',text:'月亮猫',userId:'u'});assert.equal(app.snapshot().comments[1].duplicateOf,app.snapshot().comments[0].id);
});
