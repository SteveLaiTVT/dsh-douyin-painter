import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationDirector } from '../src/conversation.js';
import { DeepSeekText } from '../src/providers/deepseek.js';
const c=(id,userId='u1',extra={})=>({id,userId,source:'live',roomId:'room1',nickname:'同名观众',text:`创意${id}`,receivedAt:100000,...extra});
const input=comments=>({theme:'月亮猫咪',rules:'每人一个创意',phase:'collecting',comments});
const answer=id=>({commentId:id,text:'同名观众，你的猫咪邮局真有趣，邮差用什么交通工具呢？',readOriginal:false});
test('default interaction cadence accepts fresh comments at three seconds, never before',async()=>{
 let now=100000,calls=0;
 const director=new ConversationDirector({clock:()=>now,text:{converse:async()=>{calls++;return {commentId:null,text:'',readOriginal:false};}}});
 await director.next(input([c('first')]));
 now+=2999;await director.next(input([c('second','u2',{receivedAt:now})]));assert.equal(calls,1);
 now+=1;await director.next(input([c('second','u2',{receivedAt:now})]));assert.equal(calls,2);
});
test('converse sends only matching viewer history, disables thinking and requires actual IDs',async()=>{
 let body; const text=new DeepSeekText({apiKey:'test',fetchImpl:async(_url,options)=>{body=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(answer('new'))}}]}));}});
 const history=[{...c('old'),reply:'先前回复'},{...c('other','u2'),reply:'其他人的回复'},{...c('unknown',null),reply:'未知身份回复'}];
 assert.equal((await text.converse({...input([c('new')]),history})).commentId,'new');
 assert.deepEqual(body.thinking,{type:'disabled'});
 const payload=JSON.parse(body.messages[1].content);
 assert.equal(payload.comments[0].history.length,1);assert.equal(payload.comments[0].history[0].commentId,'old');
 assert.ok(!JSON.stringify(payload).includes('其他人的回复'));
 assert.match(body.messages[0].content,/投票/);
 const invented=new DeepSeekText({apiKey:'test',fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(answer('fake'))}}]}))});
 await assert.rejects(invented.converse(input([c('real')])),/互动结果/);
});
test('converse supports explicit no-response and rejects ambiguous response shapes',async()=>{
 for(const result of [{commentId:null,text:'',readOriginal:false},{commentId:'c',text:'',readOriginal:true},{commentId:'c',text:'回复',readOriginal:'yes'}]){
  const text=new DeepSeekText({apiKey:'test',fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}))});
  if(result.commentId===null)assert.deepEqual(await text.converse(input([c('c')])),result);
  else await assert.rejects(text.converse(input([c('c')])),/互动结果/);
 }
});
test('director filters votes, duplicates, stale and responded IDs; caps recent input at twelve',async()=>{
 let sent;const director=new ConversationDirector({clock:()=>100000,text:{converse:async data=>{sent=data;return answer(data.comments.at(-1).id);}}});
 const comments=[c('vote','u',{text:'投2'}),c('duplicate','u',{duplicateOf:'x'}),c('stale','u',{receivedAt:69999}),...Array.from({length:20},(_,i)=>c(`c${i}`))];
 const result=await director.next(input(comments));assert.equal(result.commentId,'c19');assert.equal(sent.comments.length,12);assert.equal(sent.comments[0].id,'c8');
 assert.equal(await director.next(input(comments)),null);
});
test('director cooldown also applies after model failure',async()=>{
 let now=100000,calls=0;const director=new ConversationDirector({clock:()=>now,text:{converse:async()=>{calls++;throw Error('failed');}}});
 assert.equal(await director.next(input([c('c')])),null);assert.equal(await director.next(input([c('c')])),null);assert.equal(calls,1);
 now+=10000;await director.next(input([c('new','u1',{receivedAt:now})]));assert.equal(calls,2);
});
test('director prevents concurrent requests and suppresses stale completion',async()=>{
 let resolve,now=100000,calls=0;const director=new ConversationDirector({clock:()=>now,text:{converse:()=>{calls++;return new Promise(r=>resolve=r);}}});
 const pending=director.next(input([c('c')]));assert.equal(await director.next(input([c('other')])),null);assert.equal(calls,1);
 now+=31000;resolve(answer('c'));assert.equal(await pending,null);
});
test('director uses six-turn history only for matching source, room and UID, never nickname',async()=>{
 let now=100000;const batches=[];const replies=['猫咪邮差骑单车送信','冰淇淋山下雨变成糖浆','星际厨师尝试烹饪黑洞','海底城堡的鲸鱼守卫','沙漠绿洲里开放雪花','森林精灵用树叶写信','太空钢琴弹出流星雨','彩虹桥连接云朵车站'];const director=new ConversationDirector({clock:()=>now,text:{converse:async data=>{batches.push(data);return {...answer(data.comments[0].id),text:replies[(batches.length-1)%replies.length]};}}});
 for(let i=0;i<8;i++){await director.next(input([c(`c${i}`,'u1',{receivedAt:now})]));now+=10000;}
 assert.equal(batches.at(-1).history.length,6);
 await director.next(input([c('other','u2',{receivedAt:now})]));assert.equal(batches.at(-1).history.length,0);now+=10000;
 await director.next(input([c('otherroom','u1',{roomId:'room2',receivedAt:now})]));assert.equal(batches.at(-1).history.length,0);now+=10000;
 await director.next(input([c('manual','u1',{source:'manual',receivedAt:now})]));assert.equal(batches.at(-1).history.length,0);now+=10000;
 await director.next(input([c('unknown1',null,{receivedAt:now})]));now+=10000;
 await director.next(input([c('unknown2',null,{receivedAt:now})]));assert.equal(batches.at(-1).history.length,0);
});
test('director reset cancels inflight and prevents late memory while allowing next session',async()=>{
 let resolve,signal;let now=100000,calls=0;const director=new ConversationDirector({clock:()=>now,text:{converse:data=>{calls++;if(calls===1){signal=data.signal;return new Promise(r=>resolve=r);}assert.equal(data.history.length,0);return Promise.resolve(answer('new'));}}});
 const pending=director.next(input([c('old')]));director.reset();assert.equal(signal.aborted,true);
 assert.equal((await director.next(input([c('new')]))).commentId,'new');resolve(answer('old'));assert.equal(await pending,null);
});
test('director validates injected provider IDs and retains no response memory',async()=>{
 let now=100000,calls=0;const director=new ConversationDirector({clock:()=>now,text:{converse:async data=>{calls++;return calls===1?answer('fake'):answer(data.comments[0].id);}}});
 assert.equal(await director.next(input([c('real')])),null);now+=10000;
 assert.equal((await director.next(input([c('real','u1',{receivedAt:now})]))).commentId,'real');now+=10000;
 assert.equal(await director.next(input([c('real','u1',{receivedAt:now})])),null);
});
test('external cancellation propagates to provider and suppresses ignored late responses',async()=>{
 let finish,receivedSignal;const controller=new AbortController();let now=100000;
 const director=new ConversationDirector({clock:()=>now,text:{converse:data=>{receivedSignal=data.signal;return new Promise(resolve=>finish=resolve);}}});
 const pending=director.next({...input([c('old')]),signal:controller.signal});controller.abort();assert.equal(receivedSignal.aborted,true);finish(answer('old'));assert.equal(await pending,null);
 now+=10000;director.text={converse:async data=>{assert.equal(data.history.length,0);return answer('new');}};
 assert.equal((await director.next(input([c('new','u1',{receivedAt:now})]))).commentId,'new');
});
test('converse pre-aborted signal makes no model request',async()=>{
 const controller=new AbortController();controller.abort();
 const text=new DeepSeekText({apiKey:'test',fetchImpl:async()=>assert.fail('must not fetch')});
 await assert.rejects(text.converse({...input([c('c')]),signal:controller.signal}),/取消/);
});
test('a no-reply decision consumes that batch and waits for new audience input',async()=>{
 let now=100000,calls=0;const director=new ConversationDirector({clock:()=>now,text:{converse:async()=>{calls++;return {commentId:null,text:'',readOriginal:false};}}});
 const comments=[c('noise')];await director.next(input(comments));now+=10000;await director.next(input(comments));assert.equal(calls,1);now+=10000;await director.next(input([...comments,c('fresh','u2',{receivedAt:now})]));assert.equal(calls,2);
});
test('global recent replies prevent near-identical scripts across different UIDs and survive phase cancellation',async()=>{
 let now=100000;const batches=[];
 const director=new ConversationDirector({clock:()=>now,text:{converse:async data=>{batches.push(data);const comment=data.comments[0];return {commentId:comment.id,text:batches.length===1?'小甲，月球邮局的猫咪邮差，会用什么交通工具送信？':'小乙，月球邮局的猫咪邮差会用什么交通工具送信呀？',readOriginal:false};}}});
 assert.ok(await director.next(input([c('one','u1',{nickname:'小甲',text:'猫咪邮局',receivedAt:now})])));
 director.cancel();now+=10000;
 assert.equal(await director.next(input([c('two','u2',{nickname:'小乙',text:'陨石餐厅',receivedAt:now})])),null);
 assert.equal(batches[1].history.length,0);
 assert.equal(batches[1].recentReplies.length,1);
 assert.match(batches[1].recentReplies[0].text,/猫咪邮差/);
 now+=10000;await director.next(input([c('two','u2',{nickname:'小乙',text:'陨石餐厅',receivedAt:now})]));assert.equal(batches.length,2);
});
test('same and lightly varied original comment from a new UID is not paid for twice',async()=>{
 let now=100000,calls=0;
 const director=new ConversationDirector({clock:()=>now,text:{converse:async data=>{calls++;return {commentId:data.comments[0].id,text:'给邮差配一辆会发光的单车怎么样？',readOriginal:false};}}});
 await director.next(input([c('one','u1',{text:'月球上的猫咪邮局',receivedAt:now})]));
 now+=10000;await director.next(input([c('two','u2',{text:'月球上的猫咪邮局！',receivedAt:now})]));
 assert.equal(calls,1);
});
test('rules classification catches missing or incorrectly labelled model kind, not just prompt compliance',async()=>{
 for(const result of [{text:'玩法很简单，每人发一个创意，发送投1投2投3来投票。'},{kind:'reply',text:'大家先投稿，收词结束后选出候选，每人一票。'},{kind:'rules',text:'来一起参与今天的活动。'}]){
  const director=new ConversationDirector({clock:()=>100000,text:{converse:async()=>({commentId:'one',readOriginal:false,...result})}});
  assert.equal((await director.next(input([c('one')]))).kind,'rules');
 }
});
test('DeepSeek receives bounded global replies distinct from private viewer history and validates kind',async()=>{
 let body;const provider=new DeepSeekText({apiKey:'test',fetchImpl:async(_url,options)=>{body=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({...answer('one'),kind:'reply'})}}]}));}});
 const result=await provider.converse({...input([c('one')]),recentReplies:[{text:'全场刚刚讲过的内容',kind:'reply',at:1,secret:'ignored'}]});
 const payload=JSON.parse(body.messages[1].content);
 assert.deepEqual(payload.recentReplies,[{text:'全场刚刚讲过的内容',kind:'reply'}]);assert.equal(result.kind,'reply');
 assert.match(body.messages[0].content,/recentReplies/);assert.match(body.messages[0].content,/规则/);
});
test('ordinary creative phrases using a single rule-related word remain replies',async()=>{
 for(const text of ['猫咪投稿给月亮报社，封面会是什么颜色？','这座城市的规则是每晚月光变成海洋，灯塔如何航行？','让猫咪参加一场投票主题的舞台剧会很有意思。']){
  const director=new ConversationDirector({clock:()=>100000,text:{converse:async()=>({commentId:'idea',text,readOriginal:false})}});
  assert.equal((await director.next(input([c('idea')]))).kind,'reply');
 }
});
test('global reply deduplication expires after 180 seconds rather than forbidding phrases forever',async()=>{
 let now=100000;const director=new ConversationDirector({clock:()=>now,text:{converse:async data=>({commentId:data.comments[0].id,text:'月球猫咪邮差要骑一辆发光单车去送信。',readOriginal:false})}});
 assert.ok(await director.next(input([c('first','u1',{text:'猫咪邮局',receivedAt:now})])));
 now+=10000;assert.equal(await director.next(input([c('second','u2',{text:'流星厨房',receivedAt:now})])),null);
 now+=170000;assert.ok(await director.next(input([c('third','u3',{text:'云朵码头',receivedAt:now})])));
});
test('new-round reset can retain recent global replies while discarding viewer conversation history',async()=>{
 let now=100000;let sent;
 const director=new ConversationDirector({clock:()=>now,text:{converse:async data=>{sent=data;return {commentId:data.comments[0].id,text:'猫咪邮差的单车会不会在月球跳起来？',readOriginal:false};}}});
 await director.next(input([c('first','u1',{receivedAt:now})]));director.reset({preserveRecent:true});now+=10000;
 assert.equal(await director.next(input([c('second','u2',{receivedAt:now})])),null);assert.equal(sent.recentReplies.length,1);assert.equal(sent.history.length,0);
});
test('quoting an artistic custom criterion does not turn a creative reply into a rules broadcast',async()=>{
 const director=new ConversationDirector({clock:()=>100000,text:{converse:async()=>({commentId:'idea',text:'你说要有电影画面感，那让月光从猫咪邮局的窗缝里照进来如何？',kind:'reply',readOriginal:false})}});
 const result=await director.next({...input([c('idea')]),rules:'要有电影画面感'});
 assert.equal(result.kind,'reply');assert.match(result.text,/月光/);
});
