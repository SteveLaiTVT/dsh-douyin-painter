import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {mkdtemp,rm}from'node:fs/promises';import{join}from'node:path';import{tmpdir}from'node:os';import{Application}from'../src/app.js';
const settle: any=()=>new Promise((r: any)=>setImmediate(r));
async function setup(t: any){let now: any=1000;const capture: any=new EventEmitter();capture.stop=async()=>{};capture.start=async()=>capture.emit('status',{state:'running',active:true});const dataDir: any=await mkdtemp(join(tmpdir(),'workflow-'));
 const calls: any={gif:0,speech:0};const app: any=await new Application({dataDir,capture,clock:()=>now,autoTick:false,text:{explain:async()=>({text:'主题赛开场，先投稿再投票'}),select:async({comments}: any)=>({selections:comments.slice(0,3).map((c: any)=>({commentId:c.id,reason:'有趣',prompt:c.text}))}),converse:async({comments}: any)=>({commentId:comments.at(-1).id,text:'这个创意还能怎样补充？',readOriginal:true})},image:{generate:async()=>{calls.gif++;return {bytes:Buffer.from('GIF89a'),mime:'image/gif',info:{frames:6}};}},speech:{synthesize:async()=>{calls.speech++;return {bytes:Buffer.from('mp3'),mime:'audio/mpeg'};}}}).open();t.after(async()=>{await app.close();await rm(dataDir,{recursive:true,force:true});});return {app,capture,calls,advance:(ms: any)=>now+=ms};}
function send(app: any,id: any,userId: any,text: any){app.receive({id,userId,text,nickname:userId,source:'live',roomId:'r'});}
test('whole workflow collects, recommends, UID votes, reveals native GIF without manual substeps',async (t: any)=>{const {app,capture,calls}=await setup(t);await app.dispatch({action:'theme',title:'月亮便利店'});capture.emit('status',{state:'running',active:true});await app.dispatch({action:'workflow-start',autoChat:false,autoVoice:false});assert.equal(app.snapshot().workflow.phase,'collecting');send(app,'c1','u1','月光罐头');send(app,'c2','u2','星光猫');await app.dispatch({action:'workflow-next'});assert.equal(app.snapshot().workflow.choices.length,2);await app.dispatch({action:'workflow-vote'});send(app,'v1','voter','投1');send(app,'v2','voter','投2');send(app,'v3','','投1');await app.dispatch({action:'workflow-close-vote'});assert.equal(app.snapshot().workflow.winnerCommentId,'c2');assert.equal(app.snapshot().workflow.voters,1);assert.equal(app.snapshot().workflow.unknownVotes,1);await app.dispatch({action:'workflow-reveal'});assert.equal(app.snapshot().workflow.phase,'revealed');assert.equal(app.snapshot().artworks.at(-1).mime,'image/gif');assert.equal(calls.gif,1);});
test('capture loss pauses votes and preserves time; ties require explicit host decision',async (t: any)=>{const {app,capture,advance}=await setup(t);await app.dispatch({action:'theme',title:'猫'});capture.emit('status',{state:'running',active:true});await app.dispatch({action:'workflow-start',autoVoice:false,autoChat:false});send(app,'a','a','猫');send(app,'b','b','狗');await app.dispatch({action:'workflow-next'});await app.dispatch({action:'workflow-vote'});advance(3000);capture.emit('status',{state:'offline',active:true});assert.equal(app.snapshot().workflow.phase,'paused');const time: any=app.snapshot().workflow.remainingMs;advance(10000);await app.workflow.tick();assert.equal(app.snapshot().workflow.remainingMs,time);await assert.rejects(app.dispatch({action:'workflow-resume'}),/连接/);capture.emit('status',{state:'running',active:true});await app.dispatch({action:'workflow-resume'});await app.dispatch({action:'workflow-close-vote'});await assert.rejects(app.dispatch({action:'workflow-reveal'}),/裁定/);await app.dispatch({action:'workflow-reveal',commentId:'a'});assert.equal(app.snapshot().workflow.phase,'revealed');});
test('theme reset and stop prevent late automatic speech or workflow from restarting',async (t: any)=>{const {app}=await setup(t);await app.dispatch({action:'theme',title:'猫'});await app.dispatch({action:'workflow-start',autoVoice:false,autoChat:true});await app.dispatch({action:'workflow-pause'});assert.equal(app.snapshot().workflow.phase,'paused');await app.dispatch({action:'theme',title:'海'});assert.equal(app.snapshot().workflow.phase,'idle');});
test('paused opening cannot enqueue late speech and active workflow forbids old generation bypass',async (t: any)=>{const {app,capture,calls}=await setup(t);await app.dispatch({action:'theme',title:'月亮'});let finish: any;app.text.explain=()=>new Promise((r: any)=>finish=r);const opening: any=app.dispatch({action:'workflow-start',autoVoice:true,autoChat:false});await settle();await app.dispatch({action:'workflow-pause'});finish({text:'迟到的开场'});await opening;await settle();assert.equal(calls.speech,0);await app.dispatch({action:'workflow-resume'});send(app,'a','a','月亮猫');await app.dispatch({action:'workflow-next'});await assert.rejects(app.dispatch({action:'generate',commentId:'a'}),/主控|投票/);assert.equal(calls.gif,0);});
test('pause during GIF generation holds publication until host resumes',async (t: any)=>{const {app,capture}=await setup(t);await app.dispatch({action:'theme',title:'月亮'});capture.emit('status',{state:'running',active:true});await app.dispatch({action:'workflow-start',autoVoice:false,autoChat:false});send(app,'a','a','月亮猫');await app.dispatch({action:'workflow-next'});await app.dispatch({action:'workflow-vote'});send(app,'v','v','投1');await app.dispatch({action:'workflow-close-vote'});let finish: any;app.image.generate=()=>new Promise((r: any)=>finish=r);const generating: any=app.dispatch({action:'workflow-reveal'});await settle();await app.dispatch({action:'workflow-pause'});finish({bytes:Buffer.from('GIF89a'),mime:'image/gif'});await generating;assert.equal(app.snapshot().stage.artworkId,null);assert.equal(app.snapshot().workflow.phase,'paused');await app.dispatch({action:'workflow-resume'});assert.equal(app.snapshot().workflow.phase,'revealed');assert.ok(app.snapshot().stage.artworkId);});
test('recommendation failure can be explicitly retried without losing this round',async (t: any)=>{const {app}=await setup(t);await app.dispatch({action:'theme',title:'猫'});await app.dispatch({action:'workflow-start',autoVoice:false,autoChat:false});send(app,'a','u','月亮猫');let calls: any=0;app.text.select=async()=>{if(++calls===1)throw Error('临时网络失败');return {selections:[{commentId:'a',reason:'有趣',prompt:'月亮猫'}]};};await assert.rejects(app.dispatch({action:'workflow-next'}),/网络/);assert.equal(app.snapshot().workflow.recommendationFailed,true);await app.dispatch({action:'workflow-next'});assert.equal(app.snapshot().workflow.choices[0].commentId,'a');assert.equal(calls,2);});
test('speech failure sends its disabled state to the UI in static phases',async (t: any)=>{const {app}=await setup(t);app.workflow.s.phase='ready';app.speech.synthesize=async()=>{throw Error('音色不可用')};let latest: any;app.on('change',(s: any)=>latest=s);app.workflow.queue.enqueue({text:'测试播报'});await settle();assert.equal(latest.workflow.autoVoice,false);assert.ok(latest.errors.includes('音色不可用'));});
test('host nomination cannot give the same manual UID a second candidate',async (t: any)=>{const {app}=await setup(t);await app.dispatch({action:'theme',title:'猫'});await app.dispatch({action:'workflow-start',autoVoice:false,autoChat:false});await app.dispatch({action:'manual',text:'月亮猫',userId:'u'});await app.dispatch({action:'manual',text:'火星猫',userId:'u'});const comments: any=app.snapshot().comments;app.text.select=async()=>({selections:[{commentId:comments[0].id,reason:'有趣',prompt:'猫'}]});await app.dispatch({action:'workflow-next'});await assert.rejects(app.dispatch({action:'workflow-nominate',commentId:comments[1].id}),/同一观众/);});
test('pausing preserves answered-comment memory and does not pay again for the same chat',async (t: any)=>{const {app,advance}=await setup(t);await app.dispatch({action:'theme',title:'猫'});await app.dispatch({action:'workflow-start',autoVoice:false,autoChat:true});let calls: any=0;app.text.converse=async({comments}: any)=>{calls++;return {commentId:comments[0].id,text:'有趣的猫',readOriginal:false};};send(app,'a','u','月亮猫');await app.workflow.tick();assert.equal(calls,1);await app.dispatch({action:'workflow-pause'});await app.dispatch({action:'workflow-resume'});advance(11000);await app.workflow.tick();assert.equal(calls,1);});
test('ending collection aborts in-flight host interaction before recommendation',async (t: any)=>{const {app}=await setup(t);await app.dispatch({action:'theme',title:'猫'});await app.dispatch({action:'workflow-start',autoVoice:false,autoChat:true});let release: any,signal: any;app.text.converse=(data: any)=>{signal=data.signal;return new Promise((r: any)=>release=r);};send(app,'a','u','月亮猫');const pending: any=app.workflow.tick();await settle();await app.dispatch({action:'workflow-next'});assert.equal(signal.aborted,true);release({commentId:'a',text:'迟到回复',readOriginal:false});await pending;assert.equal(app.snapshot().workflow.conversation.length,0);});
async function playing(app: any){for(let i: any=0;i<100;i++){if(app.workflow.queue.snapshot()[0]?.status==='playing')return app.snapshot().stage;await new Promise((resolve: any)=>setTimeout(resolve,2));}throw Error('speech did not reach playback');}
test('rule narration is cached and gated for 180 seconds across same-theme new rounds',async (t: any)=>{
 const {app,capture,calls,advance}=await setup(t);let explainCalls: any=0;app.text.explain=async()=>{explainCalls++;return {text:'完整规则：提交创意，由观众投票选出作画内容。'};};
 await app.dispatch({action:'theme',title:'猫'});capture.emit('status',{state:'running',active:true});
 await app.dispatch({action:'workflow-start',collectSeconds:600,autoChat:false,autoVoice:true});await settle();
 assert.equal(calls.speech,1);const opening: any=await playing(app);app.workflow.queue.ack({id:opening.speechId,revision:opening.speechRevision});
 advance(179999);await app.workflow.tick();await settle();assert.equal(calls.speech,1);
 advance(1);await app.workflow.tick();await settle();assert.equal(calls.speech,2);assert.equal(explainCalls,1);
 const reminder: any=await playing(app);app.workflow.queue.ack({id:reminder.speechId,revision:reminder.speechRevision});
 send(app,'one','u1','月球猫');await app.dispatch({action:'workflow-next'});await app.dispatch({action:'workflow-vote'});send(app,'v','v','投1');await app.dispatch({action:'workflow-close-vote'});await app.dispatch({action:'workflow-reveal'});await settle();
 const before: any=calls.speech;await app.dispatch({action:'workflow-start',collectSeconds:600,autoChat:false,autoVoice:true});await playing(app);
 assert.equal(explainCalls,1);assert.equal(calls.speech,before+1);assert.doesNotMatch(app.snapshot().stage.caption,/完整规则|每人一票/);
});
test('rule-looking model replies cannot replay rules before timer and never speak model rules directly',async (t: any)=>{
 const {app,calls,advance}=await setup(t);app.text.explain=async()=>({text:'缓存规则：先收词，再进行观众投票。'});
 await app.dispatch({action:'theme',title:'猫'});await app.dispatch({action:'workflow-start',collectSeconds:600,autoChat:true,autoVoice:true});await settle();
 let stage: any=await playing(app);app.workflow.queue.ack({id:stage.speechId,revision:stage.speechRevision});
 app.text.converse=async({comments}: any)=>({commentId:comments.at(-1).id,text:'玩法很简单，每人发一个创意，发送投1投2投3来投票。',kind:'reply',readOriginal:false});
 advance(10000);send(app,'ask1','u1','怎么玩呀');await app.workflow.tick();await settle();assert.equal(calls.speech,1);assert.equal(app.snapshot().workflow.conversation.length,0);
 advance(10000);send(app,'ask2','u2','我该如何参与');await app.workflow.tick();await settle();assert.equal(calls.speech,1);
});
test('muted or occupied queue drops rule reminder slots and phase changes cancel pending reminders',async (t: any)=>{
 const {app,calls,advance}=await setup(t);app.text.explain=async()=>({text:'定时完整规则：每人投稿，选词投票。'});
 await app.dispatch({action:'theme',title:'猫'});await app.dispatch({action:'workflow-start',collectSeconds:600,autoChat:false,autoVoice:true});await settle();
 let stage: any=await playing(app);app.workflow.queue.ack({id:stage.speechId,revision:stage.speechRevision});
 await app.dispatch({action:'workflow-settings',autoVoice:false});advance(180000);await app.workflow.tick();await settle();assert.equal(calls.speech,1);
 await app.dispatch({action:'workflow-settings',autoVoice:true});await app.workflow.tick();await settle();assert.equal(calls.speech,1);
 advance(180000);app.workflow.queue.enqueue({text:'主播正在说话'});await settle();await app.workflow.tick();await settle();assert.equal(calls.speech,2);assert.equal(app.workflow.queue.snapshot().length,1);
 stage=await playing(app);app.workflow.queue.ack({id:stage.speechId,revision:stage.speechRevision});await app.workflow.tick();await settle();assert.equal(calls.speech,2);
 advance(180000);let release: any;app.speech.synthesize=()=>new Promise((resolve: any)=>release=resolve);await app.workflow.tick();await settle();
 await app.dispatch({action:'workflow-pause'});release({bytes:Buffer.from('mp3'),mime:'audio/mpeg'});await settle();assert.equal(app.snapshot().stage.speechId,null);assert.equal(app.workflow.queue.snapshot().length,0);
});
test('changing theme allows fresh rules while pause snapshot exposes the true prior phase',async (t: any)=>{
 const {app,calls}=await setup(t);let explains: any=0;app.text.explain=async()=>{explains++;return {text:`当前主题的完整规则${explains}：先收词再投票。`};};
 await app.dispatch({action:'theme',title:'猫'});await app.dispatch({action:'workflow-start',autoVoice:true,autoChat:false});await playing(app);await app.dispatch({action:'workflow-pause'});assert.equal(app.snapshot().workflow.previousPhase,'collecting');
 await app.dispatch({action:'theme',title:'海'});await app.dispatch({action:'workflow-start',autoVoice:true,autoChat:false});await playing(app);assert.equal(explains,2);assert.equal(calls.speech,2);assert.match(app.snapshot().stage.caption,/完整规则2/);assert.equal(app.snapshot().workflow.previousPhase,null);
});
test('a due reminder during generation describes future-round rules without reopening voting',async (t: any)=>{
 const {app,capture,advance}=await setup(t);app.text.explain=async()=>({text:'现在投稿，等会儿发送投1来选出冠军。'});
 await app.dispatch({action:'theme',title:'猫'});capture.emit('status',{state:'running',active:true});await app.dispatch({action:'workflow-start',autoChat:false,autoVoice:true});await playing(app);send(app,'a','u','月亮猫');await app.dispatch({action:'workflow-next'});await app.dispatch({action:'workflow-vote'});send(app,'v','v','投1');await app.dispatch({action:'workflow-close-vote'});
 let finish: any;app.image.generate=()=>new Promise((resolve: any)=>finish=resolve);const pending: any=app.dispatch({action:'workflow-reveal'});await settle();const stage: any=await playing(app);app.workflow.queue.ack({id:stage.speechId,revision:stage.speechRevision});
 advance(180000);await app.workflow.tick();await playing(app);assert.match(app.snapshot().stage.caption,/投票已经结束/);assert.match(app.snapshot().stage.caption,/下一轮/);assert.doesNotMatch(app.snapshot().stage.caption,/现在投稿|发送投1/);
 finish({bytes:Buffer.from('GIF89a'),mime:'image/gif'});await pending;
});
test('returning to a recently introduced theme retains its 180-second rules gate',async (t: any)=>{
 const {app}=await setup(t);let explains: any=0;app.text.explain=async()=>{explains++;return {text:`完整规则第${explains}版：先投稿，再由观众投票。`};};
 await app.dispatch({action:'theme',title:'A'});await app.dispatch({action:'workflow-start',autoVoice:true,autoChat:false});await playing(app);
 await app.dispatch({action:'theme',title:'B'});await app.dispatch({action:'workflow-start',autoVoice:true,autoChat:false});await playing(app);
 await app.dispatch({action:'theme',title:'A'});await app.dispatch({action:'workflow-start',autoVoice:true,autoChat:false});await playing(app);
 assert.equal(explains,2);assert.match(app.snapshot().stage.caption,/新一轮/);assert.doesNotMatch(app.snapshot().stage.caption,/完整规则/);
});
test('resuming after a long pause drops an elapsed rules slot instead of replaying it',async (t: any)=>{
 const {app,calls,advance}=await setup(t);app.text.explain=async()=>({text:'完整规则：先投稿，再投票。'});
 await app.dispatch({action:'theme',title:'猫'});await app.dispatch({action:'workflow-start',collectSeconds:600,autoVoice:true,autoChat:false});let stage: any=await playing(app);app.workflow.queue.ack({id:stage.speechId,revision:stage.speechRevision});
 advance(10000);await app.dispatch({action:'workflow-pause'});advance(180000);await app.dispatch({action:'workflow-resume'});await app.workflow.tick();await settle();assert.equal(calls.speech,1);
 advance(179999);await app.workflow.tick();await settle();assert.equal(calls.speech,1);
 advance(1);await app.workflow.tick();await playing(app);assert.equal(calls.speech,2);
});
test('a never-scheduled first rules introduction is not mistaken for a missed reminder on resume',async (t: any)=>{
 const {app,calls,advance}=await setup(t);await app.dispatch({action:'theme',title:'猫'});let explain: any;app.text.explain=()=>new Promise((resolve: any)=>explain=resolve);
 const opening: any=app.dispatch({action:'workflow-start',collectSeconds:600,autoVoice:true,autoChat:false});await settle();app.workflow.queue.enqueue({text:'主播正在交谈'});explain({text:'首次完整规则：先投稿再投票。'});await opening;await playing(app);
 assert.equal(calls.speech,2);await app.dispatch({action:'workflow-pause'});advance(180000);await app.dispatch({action:'workflow-resume'});await app.workflow.tick();await playing(app);
 assert.equal(calls.speech,3);assert.match(app.snapshot().stage.caption,/首次完整规则/);
});
test('workflow delegates streaming speech preparation once and honors exact playback revision on stop',async (t: any)=>{
 const {app,calls}=await setup(t);const prepared: any=[];
 app.prepareSpeech=async (input: any)=>{prepared.push(input);return {media:{id:'prepared',url:'/media/prepared',mime:'audio/mpeg'},completion:Promise.resolve()};};
 app.workflow.queue.enqueue({text:'简短直播回复'});await settle();
 assert.equal(calls.speech,0);assert.equal(prepared.length,1);assert.ok(prepared[0].signal instanceof AbortSignal);
 assert.equal(app.state.stage.speechId,'prepared');const oldRevision: any=app.state.stage.speechRevision;
 app.state.stage.speechRevision=oldRevision+1;app.workflow.queue.stop();assert.equal(app.state.stage.speechId,'prepared');
});
test('auto voice reads only short suitable originals and short replies, leaving longer replies as text',async (t: any)=>{
 const {app,advance}=await setup(t);const spoken: any=[];
 app.prepareSpeech=async (input: any)=>{spoken.push(input.text);return {media:{id:`voice${spoken.length}`},completion:Promise.resolve()};};
 await app.dispatch({action:'theme',title:'猫'});await app.dispatch({action:'workflow-start',autoVoice:false,autoChat:true});await app.dispatch({action:'workflow-settings',autoVoice:true});
 app.text.converse=async({comments}: any)=>({commentId:comments.at(-1).id,text:'猫咪的旅行真有趣，下一站去哪儿？',readOriginal:true});
 send(app,'long-original','u1','猫咪旅行故事'.repeat(15));await app.workflow.tick();await settle();
 assert.deepEqual(spoken,['猫咪的旅行真有趣，下一站去哪儿？']);
 let stage: any=app.state.stage;app.workflow.queue.ack({id:stage.speechId,revision:stage.speechRevision});
 advance(11000);app.text.converse=async({comments}: any)=>({commentId:comments.at(-1).id,text:'这是很长但可以留在文字互动区的回复。'.repeat(10),readOriginal:false});
 send(app,'long-reply','u2','小猫在月球跳舞');await app.workflow.tick();await settle();assert.equal(spoken.length,1);
 assert.ok(app.snapshot().workflow.conversation.at(-1).text.length>100);
 assert.equal(app.workflow.interactionNarration({text:'短回复',readOriginal:true},{text:'https://example.com 很长链接',nickname:'观众'}),'短回复');
 assert.equal(app.workflow.interactionNarration({text:'短回复',readOriginal:true},{text:'月球上的猫',nickname:'观众'}),'观众说，月球上的猫。短回复');
});
