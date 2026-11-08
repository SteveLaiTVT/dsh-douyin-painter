import {samplePlan} from './fixtures/theme-plan.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { HarnessText } from '../src/harness-text.js';
import * as plugin from '../src/plugin.js';
const createUserMessage: any = (data: any) => ({id:'prompt-1',...data});
function host({delay=5,error=false,never=false,invalid=false,reply={text:"欢迎画月亮"}}: any={}) {
 const events: any=new EventEmitter();const state: any={created:[],messages:[],disposed:0,cancelled:0,whenIdle:0,toolRestriction:null,toolGuard:null,hooks:{}};
 const session: any={id:'owned'};let idle: any=Promise.resolve();
 const ctx: any={on(name: any,fn: any){events.on(name,fn);return ()=>events.off(name,fn);},agents:{async create(options: any){
  state.created.push(options);
  await options.setup({tools:{restrict(value: any){state.toolRestriction=value;},guard(fn: any){state.toolGuard=fn;}},on(name: any,fn: any){state.hooks[name]=fn;return ()=>{};}});
  const agent: any={session,followup(message: any){
   state.messages.push(message);
   events.emit('session/event',session,{type:'assistant/message',data:{message:{content:[{type:'text',text:'{"text":"old"}'}]}}});
   events.emit('session/event',session,{type:'agent/inbox/spliced',data:{inserted:[message]}});
   idle=new Promise((resolve: any)=>{
    if(never)return;
    setTimeout(()=>{
     events.emit('session/event',{id:'foreign'},{type:'assistant/message',data:{message:{content:[{type:'text',text:'{"text":"foreign"}'}]}}});
     events.emit('session/event',session,{type:'assistant/attempt',data:{message:{content:[{type:'text',text:'{"text":"attempt"}'}]}}});
     if(error)events.emit('agent/error',{agent,error:Error('private-key')});
     else events.emit('session/event',session,{type:'assistant/message',data:{message:{content:[{type:'text',text:invalid?'invalid':JSON.stringify(reply)}]}}});
     resolve();
    },delay);
   });
  },whenIdle(){state.whenIdle++;return idle;},cancel(){state.cancelled++;}};
  return {agent,async dispose(){state.disposed++;}};
 }}};
 return {ctx,state,events};
}
test('Harness tasks wait from own durable inbox receipt through idle and use committed messages only',async()=>{
 const {ctx,state,events}=host();const text: any=new HarnessText(ctx,{createUserMessage});
 assert.deepEqual(await text.explain({theme:'月亮',rules:'自由发挥'}),{text:'欢迎画月亮'});
 assert.equal(state.whenIdle,1);assert.equal(state.disposed,1);
 assert.deepEqual(state.toolRestriction,{allow:[]});
 assert.equal(state.created[0].agentOptions.provider,'deepseek-official');
 assert.equal(state.created[0].agentOptions.model,'deepseek-flash');
 assert.equal(state.created[0].agentOptions.reasoningEffort,'off');
 assert.equal(events.listenerCount('session/event'),0);
 await text.close();
});
test('Harness errors, invalid JSON, timeout and caller cancellation dispose owned tasks',async()=>{
 for(const options of [{error:true},{invalid:true},{never:true}]){
  const {ctx,state}=host(options);const text: any=new HarnessText(ctx,{createUserMessage,timeoutMs:15});
  await assert.rejects(()=>text.explain({theme:'月亮',rules:''}),(error: any)=>!error.message.includes('private-key'));
  assert.equal(state.disposed,1);await text.close();
 }
 const {ctx,state}=host({never:true});const text: any=new HarnessText(ctx,{createUserMessage});const abort: any=new AbortController();
 const pending: any=text.explain({theme:'月亮',rules:'',signal:abort.signal});setTimeout(()=>abort.abort(),5);
 await assert.rejects(()=>pending,/取消/);assert.equal(state.cancelled,1);assert.equal(state.disposed,1);
 await text.close();
});
test('Harness close cancels active work and refuses new tasks',async()=>{
 const {ctx,state}=host({never:true});const text: any=new HarnessText(ctx,{createUserMessage});
 const pending: any=text.explain({theme:'月亮',rules:''});const rejected: any=assert.rejects(()=>pending,/关闭|取消/);
 await new Promise((resolve: any)=>setTimeout(resolve,5));await text.close();await rejected;
 assert.equal(state.disposed,1);await assert.rejects(()=>text.explain({theme:'月亮'}),/关闭/);
});
test('plugin imports without Harness optional packages and cleans up app after host disposal',async()=>{
 const events: any=new EventEmitter();let closed: any=0;let options: any;
 const ctx: any={agents:{create(){}},on(name: any,fn: any){events.on(name,fn);return ()=>events.off(name,fn);},logger:{info(){}}};
 const runtime: any={server:{origin:'http://127.0.0.1:1'},async close(){closed++;}};
 await plugin.apply(ctx,{root:process.cwd(),env:{},port:0,textMode:'api',createApplication:async(config: any,dependencies: any)=>{options={config,dependencies};return runtime;}});
 assert.equal(options.dependencies.text,undefined);events.emit('dispose');await new Promise((resolve: any)=>setTimeout(resolve,0));assert.equal(closed,1);
 assert.deepEqual(plugin.inject,['agents','sessions','sessionPersistence']);
});
test('Harness ignores initial idle until its durable receipt, then awaits active work',async()=>{
 const events: any=new EventEmitter();const session: any={};let calls: any=0;let disposed: any=0;
 const ctx: any={on(name: any,fn: any){events.on(name,fn);return()=>events.off(name,fn);},agents:{async create({setup}: any){
  await setup({tools:{restrict(){},guard(){}},on(){return ()=>{};}});let admitted: any=false;
  const agent: any={session,followup(message: any){
   setTimeout(()=>{
    admitted=true;
    events.emit('session/event',session,{type:'agent/inbox/spliced',data:{inserted:[message]}});
   },5);
  },async whenIdle(){
   calls++;assert.equal(admitted,true);
   events.emit('session/event',session,{type:'assistant/message',data:{message:{content:[{type:'text',text:'{"text":"真正的结果"}'}]}}});
  },cancel(){}};
  return {agent,async dispose(){disposed++;}};
 }}};
 const text: any=new HarnessText(ctx,{createUserMessage});
 assert.equal((await text.explain({theme:'月亮'})).text,'真正的结果');
 assert.equal(calls,1);assert.equal(disposed,1);await text.close();
});
test('plugin default uses Harness text and disposal during startup closes eventual runtime once',async()=>{
 const events: any=new EventEmitter();let complete: any;let dependencies: any;let closes: any=0;
 const ctx: any={agents:{create(){}},on(name: any,fn: any){events.on(name,fn);return()=>events.off(name,fn);}};
 const pending: any=plugin.apply(ctx,{root:process.cwd(),env:{DEEPSEEK_MODEL:'deepseek-chat'},createApplication:async(_config: any,deps: any)=>{
  dependencies=deps;return await new Promise((resolve: any)=>{complete=resolve;});
 }});
 assert.equal(dependencies.text instanceof HarnessText,true);
 assert.equal(dependencies.text.model,'deepseek-flash');
 events.emit('dispose');
 complete({server:{origin:'http://127.0.0.1:1'},async close(){closes++;}});
 await pending;await new Promise((resolve: any)=>setTimeout(resolve,0));
 assert.equal(closes,1);assert.equal(dependencies.text.closed,true);
});

test('Harness plugin preserves an explicitly selected host model',async()=>{
 const events: any=new EventEmitter();let text: any;
 const ctx: any={agents:{create(){}},on(name: any,fn: any){events.on(name,fn);return()=>events.off(name,fn);}};
 await plugin.apply(ctx,{root:process.cwd(),env:{DEEPSEEK_MODEL:'deepseek-chat'},model:'deepseek-v4-pro',createApplication:async(_config: any,deps: any)=>{
  text=deps.text;return {server:{origin:'http://127.0.0.1:1'},async close(){}};
 }});
 assert.equal(text.model,'deepseek-v4-pro');
 events.emit('dispose');await new Promise((resolve: any)=>setTimeout(resolve,0));
});

test('Harness guard denies global and later scoped tools and caps all model request paths',async()=>{
 const {ctx,state}=host();const text: any=new HarnessText(ctx,{createUserMessage});
 await text.explain({theme:'月亮'});
 assert.equal(typeof state.toolGuard,'function');
 for(const tool of [{name:'bash',origin:'global'},{name:'preset-scoped-tool',origin:'agent-preset'}]){
  assert.equal(typeof state.toolGuard({tool}),'string');
  assert.ok(state.toolGuard({tool}).length>0);
 }
 let steps: any=0;const nextStep: any=async()=>{steps++;return {kind:'enter',messages:[]};};
 assert.equal((await state.hooks['agent/pre-step']({},nextStep)).kind,'enter');
 assert.deepEqual(await state.hooks['agent/pre-step']({},nextStep),{kind:'reject'});
 assert.equal(steps,1);
 let requests: any=0;const nextRequest: any=async()=>{requests++;return {};};
 await state.hooks['agent/request']({},nextRequest);
 await assert.rejects(()=>state.hooks['agent/request']({},nextRequest),/一次/);
 assert.equal(requests,1);
 let retries: any=0;assert.equal(await state.hooks['agent/request-error']({},async()=>{retries++;return {kind:'retry'};}),undefined);
 assert.equal(retries,0);await text.close();
});

test('Harness theme planning uses the same complete schema with its larger single-request budget',async()=>{
 const options: any=[samplePlan(),samplePlan('科幻'),samplePlan('志怪')];const {ctx,state}=host({reply:{options}});const text: any=new HarnessText(ctx,{createUserMessage});
 assert.deepEqual(await text.planTheme({theme:'月亮便利店'}),{options});assert.equal(state.created[0].agentOptions.maxTokens,6500);assert.equal(state.created[0].agentOptions.reasoningEffort,'off');assert.equal(state.disposed,1);await text.close();
});

test('Harness shares the reviewed-plan fiction boundary with the API adapter',async()=>{
 const {ctx,state}=host();const text: any=new HarnessText(ctx,{createUserMessage});
 await text.reply({theme:'月球失物招领',themePlan:samplePlan(),comment:{id:'real-1',text:'旧车票',nickname:'旅人'}});
 assert.match(state.messages[0].content[0].text,/其中示例和镜头是虚构策划/);assert.match(state.messages[0].content[0].text,/绝不能当成观众原话/);assert.match(state.messages[0].content[0].text,/reviewedPlan/);await text.close();
});
