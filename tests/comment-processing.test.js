import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCandidates, viewerKey, duplicateKey } from '../src/comment-processing.js';
const c=(id,userId,text,extra={})=>({id,userId,text,roomId:'room',source:'live',roundId:'r',...extra});
test('repeated messages merge without discarding later distinct ideas or confusing names',()=>{
 const comments=[c('1','u','月光罐头'),c('2','u','哈哈主播'),c('3','u','会发光的月球猫'),c('4','u','月光罐头'),c('5','v','月光罐头')];
 const pool=prepareCandidates(comments,{roundId:'r'});assert.equal(pool.length,4);
 assert.deepEqual(pool.find(c=>c.id==='1').sourceIds,['1','4']);assert.ok(pool.some(c=>c.id==='3'));assert.ok(pool.some(c=>c.id==='5'));
 assert.equal(viewerKey(c('6','','x')),null);assert.notEqual(duplicateKey(c('1','u','x')),duplicateKey(c('2','v','x')));
});
test('unknown identities are not merged by nickname; rooms, sources and rounds are scoped',()=>{
 const pool=prepareCandidates([c('1','','同文',{nickname:'同名'}),c('2','','同文',{nickname:'同名'}),c('3','u','同文'),c('4','u','同文',{roomId:'other'}),c('5','u','同文',{source:'manual'}),c('6','u','其他',{roundId:'old'})],{roundId:'r'});
 assert.equal(pool.length,5);
});
test('candidate limits allocate across users and retain early and recent ideas with original context',()=>{
 const comments=Array.from({length:30},(_,i)=>c('a'+i,'a','创意'+i));comments.push(c('b','b','第二个观众'));
 const pool=prepareCandidates(comments,{roundId:'r',maxTotal:4,maxPerUser:3});assert.equal(pool.length,4);assert.ok(pool.some(c=>c.id==='b'));assert.ok(pool.some(c=>c.id==='a0'));assert.ok(pool.some(c=>c.id==='a29'));
 assert.ok(pool.find(c=>c.id==='a29').context.some(x=>x.id==='a29'));assert.equal(pool.every(x=>x.context.every(s=>comments.some(c=>c.id===s.id&&c.text===s.text))),true);
});
test('history capacity removes an overrepresented viewer before another viewer only idea',async()=>{
 const { historyEvictionIndex }=await import('../src/comment-processing.js');
 const comments=[c('valuable','other','一位观众的创意')];
 for(let i=0;i<30;i++){comments.push(c('s'+i,'spammer','刷屏'+i));if(comments.length>6)comments.splice(historyEvictionIndex(comments,{roundId:'r'}),1);}
 assert.ok(comments.some(c=>c.id==='valuable'));assert.ok(comments.some(c=>c.id==='s29'));
});
test('ordinary one-word ideas remain registered candidates despite an earlier negative evaluation',()=>{
 const comments=[c('moon','u1','月'),c('cake','u2','月饼',{evaluation:{eligible:false,score:10,reason:'太普通'}}),c('cup','u3','杯子'),c('old','u4','旧轮次',{roundId:'older'})];
 const before=structuredClone(comments);const candidates=prepareCandidates(comments,{roundId:'r'});
 assert.deepEqual(candidates.map(item=>item.id),['moon','cake','cup']);assert.deepEqual(comments,before);
});
test('only clear noise and pure votes are removed; short objects and meaningful conversation are preserved',()=>{
 const comments=['月饼','杯子','🥮','哈哈主播','……','哈哈哈','投1','投 一','投２','投3号'].map((text,index)=>c(String(index),'u'+index,text));
 const candidates=prepareCandidates(comments,{roundId:'r'});
 assert.deepEqual(candidates.map(item=>item.text),['月饼','杯子','🥮','哈哈主播']);
 assert.equal(comments.length,10,'registration/raw messages are untouched');
});
