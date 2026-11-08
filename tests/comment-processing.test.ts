import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCandidates, viewerKey, duplicateKey } from '../src/comment-processing.js';
const c: any=(id: any,userId: any,text: any,extra: any={})=>({id,userId,text,roomId:'room',source:'live',roundId:'r',...extra});
test('repeated messages merge without discarding later distinct ideas or confusing names',()=>{
 const comments: any=[c('1','u','月光罐头'),c('2','u','哈哈主播'),c('3','u','会发光的月球猫'),c('4','u','月光罐头'),c('5','v','月光罐头')];
 const pool: any=prepareCandidates(comments,{roundId:'r'});assert.equal(pool.length,4);
 assert.deepEqual(pool.find((c: any)=>c.id==='1').sourceIds,['1','4']);assert.ok(pool.some((c: any)=>c.id==='3'));assert.ok(pool.some((c: any)=>c.id==='5'));
 assert.equal(viewerKey(c('6','','x')),null);assert.notEqual(duplicateKey(c('1','u','x')),duplicateKey(c('2','v','x')));
});
test('unknown identities are not merged by nickname; rooms, sources and rounds are scoped',()=>{
 const pool: any=prepareCandidates([c('1','','同文',{nickname:'同名'}),c('2','','同文',{nickname:'同名'}),c('3','u','同文'),c('4','u','同文',{roomId:'other'}),c('5','u','同文',{source:'manual'}),c('6','u','其他',{roundId:'old'})],{roundId:'r'});
 assert.equal(pool.length,5);
});
test('candidate limits allocate across users and retain early and recent ideas with original context',()=>{
 const comments: any=Array.from({length:30},(_: any,i: any)=>c('a'+i,'a','创意'+i));comments.push(c('b','b','第二个观众'));
 const pool: any=prepareCandidates(comments,{roundId:'r',maxTotal:4,maxPerUser:3});assert.equal(pool.length,4);assert.ok(pool.some((c: any)=>c.id==='b'));assert.ok(pool.some((c: any)=>c.id==='a0'));assert.ok(pool.some((c: any)=>c.id==='a29'));
 assert.ok(pool.find((c: any)=>c.id==='a29').context.some((x: any)=>x.id==='a29'));assert.equal(pool.every((x: any)=>x.context.every((s: any)=>comments.some((c: any)=>c.id===s.id&&c.text===s.text))),true);
});
test('history capacity removes an overrepresented viewer before another viewer only idea',async()=>{
 const { historyEvictionIndex }=await import('../src/comment-processing.js');
 const comments: any=[c('valuable','other','一位观众的创意')];
 for(let i: any=0;i<30;i++){comments.push(c('s'+i,'spammer','刷屏'+i));if(comments.length>6)comments.splice(historyEvictionIndex(comments,{roundId:'r'}),1);}
 assert.ok(comments.some((c: any)=>c.id==='valuable'));assert.ok(comments.some((c: any)=>c.id==='s29'));
});
test('ordinary one-word ideas remain registered candidates despite an earlier negative evaluation',()=>{
 const comments: any=[c('moon','u1','月'),c('cake','u2','月饼',{evaluation:{eligible:false,score:10,reason:'太普通'}}),c('cup','u3','杯子'),c('old','u4','旧轮次',{roundId:'older'})];
 const before: any=structuredClone(comments);const candidates: any=prepareCandidates(comments,{roundId:'r'});
 assert.deepEqual(candidates.map((item: any)=>item.id),['moon','cake','cup']);assert.deepEqual(comments,before);
});
test('only clear noise and pure votes are removed; short objects and meaningful conversation are preserved',()=>{
 const comments: any=['月饼','杯子','🥮','哈哈主播','……','哈哈哈','投1','投 一','投２','投3号'].map((text: any,index: any)=>c(String(index),'u'+index,text));
 const candidates: any=prepareCandidates(comments,{roundId:'r'});
 assert.deepEqual(candidates.map((item: any)=>item.text),['月饼','杯子','🥮','哈哈主播']);
 assert.equal(comments.length,10,'registration/raw messages are untouched');
});
