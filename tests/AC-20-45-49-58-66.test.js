import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const J=await import('../lib/journal.js').catch(()=>({}));
const B=await import('../lib/budget.js').catch(()=>({}));
const A=await import('../lib/auth.js').catch(()=>({}));
const K={show_id:'show',round_id:'r1',generation:1};
const root=()=>mkdtemp(join(tmpdir(),'painter-ac-'));
test('AC-13/20/63: durable state replays and missing safety index fails closed',async()=>{
 assert.equal(typeof J.Journal,'function'); const dir=await root();const j=await J.Journal.open(dir,'show');
 await j.commit('round',[{table:'rounds',id:'r1',value:K}]);await j.close();
 let r=await J.Journal.open(dir,'show');assert.deepEqual(r.state.rounds.r1,K);assert.equal(r.trusted,true);await r.close();
 await writeFile(join(dir,'revocations.json'),'{}');r=await J.Journal.open(dir,'show');assert.equal(r.trusted,false);assert.equal(r.isAllowed(K),false);
});
for(const fault of ['barrier:intent:write','barrier:intent:fsync','event:revoked:write','index:revocations:write','barrier:close:fsync'])test(`AC-66: ${fault} then crash cannot revive old valid bytes`,async()=>{
 assert.equal(typeof J.Journal,'function');const dir=await root();let fail=false;const j=await J.Journal.open(dir,'show',{fault:point=>{if(fail&&point===fault)throw Error('disk fault')}});
 await j.commit('round',[{table:'rounds',id:'r1',value:K}]);await j.close();
 const running=await J.Journal.open(dir,'show',{fault:point=>{if(fail&&point===fault)throw Error('disk fault')}});fail=true;
 let masked=false;running.onSafety=()=>{masked=true};const p=running.revoke(K,'output',[]);assert.equal(masked,true);assert.equal(running.isAllowed(K),false);await assert.rejects(p);
 const restart=await J.Journal.open(dir,'show');assert.equal(restart.trusted,false);assert.equal(restart.isAllowed(K),false);assert.equal(restart.isolated.has('r1'),true);
 await assert.rejects(restart.confirmRecovery(K,'op','hash'));await restart.close();
 const again=await J.Journal.open(dir,'show');assert.equal(again.isAllowed(K),false);
});
test('AC-45/46: no explicit limit or no conservative evidence disables every paid channel',async()=>{
 assert.equal(typeof B.Budget,'function');const j=await J.Journal.open(await root(),'show');const b=new B.Budget(j);
 for(const limit of [undefined,'',0,-1,'NaN']){await b.configure(limit);await assert.rejects(b.reserve({K,phase:'text',bound:0.025,evidence:'estimate'}));}
 await b.configure(5);await assert.rejects(b.reserve({K,phase:'still',bound:0.025}));
});
test('AC-47/48/49: atomic money boundary, unknown cost retained through restart and overrun stops',async()=>{
 assert.equal(typeof B.Budget,'function');const dir=await root();const j=await J.Journal.open(dir,'show');const b=new B.Budget(j);await b.configure(5);
 const make=(phase,bound)=>b.reserve({K,phase,bound,evidence:{verified:true,rule:'test'}});
 const a=await make('text',4.7);await b.settle(a.request_id,4.7);await make('still',0.2);await assert.rejects(make('gif',0.11));
 const c=await Promise.allSettled([make('text',0.1),make('text',0.1)]);assert.equal(c.filter(x=>x.status==='fulfilled').length,1);assert.equal(b.summary().reserved,0.3);
 await j.close();const r=await J.Journal.open(dir,'show');const recovered=new B.Budget(r);assert.equal(recovered.summary().reserved,0.3);assert.equal(recovered.summary().requests,3);
 await recovered.settle(c.find(x=>x.status==='fulfilled').value.request_id,0.5);assert.equal(recovered.summary().stopped,true);await assert.rejects(recovered.reserve({K,phase:'text',bound:0.01,evidence:{verified:true}}));
});
test('AC-58/59/60/61: exact origins, one-time exchange, cookie+token+CSRF and restart invalidation',()=>{
 assert.equal(typeof A.Auth,'function');let now=0;const a=new A.Auth(12345,()=>now);const headers={host:'127.0.0.1:12345',origin:'http://127.0.0.1:12345'};
 assert.throws(()=>a.exchange({...headers,origin:'null'},a.oneTime));const otp=a.oneTime;const session=a.exchange(headers,otp);assert.throws(()=>a.exchange(headers,otp));
 const h={...headers,authorization:`Bearer ${session.token}`,cookie:session.cookie.split(';')[0],'x-csrf-token':session.csrf};assert.equal(a.authorize(h,'POST').operator,session.operator);
 for(const bad of [{...h,host:'evil127.0.0.1:12345'},{...h,origin:undefined},{...h,'x-csrf-token':''},{...h,authorization:''},{...h,cookie:''}])assert.throws(()=>a.authorize(bad,'POST'));
 assert.throws(()=>a.authorize({...headers,cookie:h.cookie},'GET'));a.logout(h);assert.throws(()=>a.authorize(h,'GET'));now=300000;assert.throws(()=>a.exchange(headers,otp));
});
