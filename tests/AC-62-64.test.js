import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
const mod=await import('../lib/bridge.js').catch(()=>({}));
test('AC-22/62/64: enqueue receipt is not answer; settle owned committed interval only, dispose only owned handle',async()=>{
 assert.equal(typeof mod.DshBridge,'function');const emitter=new EventEmitter();let agent,disposed=0;const session={header:{id:'owned'}};
 const ctx={on:(type,fn)=>{emitter.on(type,fn);return()=>emitter.off(type,fn)},agents:{create:async()=>({agent:agent={session,id:'owned-agent',followup:async()=>({messageId:'receipt'}),cancel:async()=>{}},dispose:async()=>{disposed++}})}};
 const b=new mod.DshBridge(ctx,{isolationVerified:true,createUserMessage:x=>x,expandAssistantStream:x=>x});
 let settled=false;const p=b.run('numbered data',{K:{show_id:'s',round_id:'r',generation:1}}).then(x=>{settled=true;return x;});await new Promise(setImmediate);
 emitter.emit('session/event',{header:{id:'other'}},{type:'turn/end'});emitter.emit('agent/status',{agent:{...agent},status:'idle'});await new Promise(setImmediate);assert.equal(settled,false);
 emitter.emit('agent/status',{agent,status:'running'});emitter.emit('session/event',session,{type:'assistant/message',data:{stream:[{chunk:{type:'text-delta',text:'{"ok":true}'}}]}});emitter.emit('session/event',session,{type:'turn/end'});assert.equal(settled,false);emitter.emit('agent/status',{agent,status:'idle'});
 assert.equal((await p).text,'{"ok":true}');await b.close();assert.equal(disposed,1);
 const disabled=new mod.DshBridge(ctx,{isolationVerified:false});await assert.rejects(disabled.run('x',{}));await disabled.close();
});
