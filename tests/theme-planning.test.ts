import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Application} from '../src/app.js';
import {DeepSeekText} from '../src/providers/deepseek.js';
import {normalizeThemePlan} from '../src/theme-planning.js';
import {samplePlan} from './fixtures/theme-plan.js';
async function setup(t: any,text: any={}){const dataDir: any=await mkdtemp(join(tmpdir(),'theme-plan-'));let app: any=await new Application({dataDir,text,autoTick:false}).open();t.after(async()=>{await app.close();await rm(dataDir,{recursive:true,force:true});});return {app,dataDir};}
test('theme plan schema preserves complete editable storyboards and rejects incomplete model results',()=>{
 const plan: any=samplePlan();assert.deepEqual(normalizeThemePlan({...plan,unsafe:'ignored'}),plan);
 for(const bad of [{...plan,storyboard:[]},{...plan,examples:['one']},{...plan,setting:''},{...plan,storyboard:[...plan.storyboard,{title:'bad'}]}])assert.throws(()=>normalizeThemePlan(bad));
});
test('DeepSeek prepares three complete directions with a larger non-thinking request',async()=>{
 let sent: any;const options: any=[samplePlan(),samplePlan('市井科幻'),samplePlan('东方志怪')];
 const text: any=new DeepSeekText({apiKey:'test',fetchImpl:async(url: any,init: any)=>{sent=JSON.parse(init.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({options})}}]}));}});
 assert.deepEqual(await text.planTheme({theme:'月亮便利店',notes:'露天摆摊'}),{options});
 assert.equal(sent.thinking.type,'disabled');assert.ok(sent.max_tokens>2500);assert.match(sent.messages[0].content,/故事板/);assert.match(sent.messages[1].content,/露天摆摊/);
});
test('planning, editing and restoring never publish until a reviewed option is explicitly applied',async (t: any)=>{
 const {app,dataDir}=await setup(t,{planTheme:async()=>({options:[samplePlan(),samplePlan('市井科幻'),samplePlan('东方志怪')]})});
 await app.dispatch({action:'theme',title:'现有主题',rules:'旧规则'});
 await app.dispatch({action:'theme-plan',theme:'月亮便利店'});
 const draft: any=app.snapshot().themeDraft;assert.equal(draft.options.length,3);assert.equal(app.snapshot().theme.title,'现有主题');
 const option: any=draft.options[1];const edited: any={...option.plan,title:'我审核后的月球摊子',setting:'月球山坡上的露天小推车'};
 await app.dispatch({action:'theme-plan-save',draftId:draft.id,optionId:option.id,revision:draft.revision,plan:edited});
 assert.equal(app.snapshot().theme.title,'现有主题');await app.flush();
 const restored: any=await new Application({dataDir,autoTick:false}).open();t.after(()=>restored.close());assert.equal(restored.snapshot().themeDraft.options[1].plan.title,edited.title);
 await app.dispatch({action:'theme-plan-apply',draftId:draft.id,optionId:option.id,revision:app.snapshot().themeDraft.revision,plan:edited});
 assert.equal(app.snapshot().theme.title,edited.title);assert.equal(app.snapshot().theme.plan.setting,edited.setting);assert.equal(app.snapshot().stage.speechId,null);assert.equal(app.snapshot().artworks.length,0);
 await assert.rejects(app.dispatch({action:'theme-plan-save',draftId:'old',optionId:option.id,plan:edited}),/过期/);
});
test('failed regeneration keeps the last draft and applying during a collecting round is rejected',async (t: any)=>{
 let fail: any=false;const {app}=await setup(t,{planTheme:async()=>{if(fail)throw Error('model failed');return {options:[samplePlan(),samplePlan('市井科幻'),samplePlan('东方志怪')]};}});
 await app.dispatch({action:'theme-plan',theme:'月球小摊'});const old: any=app.snapshot().themeDraft;fail=true;await assert.rejects(app.dispatch({action:'theme-plan',theme:'其他主题'}));assert.equal(app.snapshot().themeDraft.id,old.id);
 await app.dispatch({action:'theme',title:'正在直播'});await app.dispatch({action:'start'});
 await assert.rejects(app.dispatch({action:'theme-plan-apply',draftId:old.id,optionId:old.options[0].id,revision:old.revision,plan:old.options[0].plan}),/本轮/);assert.equal(app.snapshot().round.status,'collecting');
});
test('a draft can finish across round resets without changing the live theme',async (t: any)=>{
 let release: any;const gate: any=new Promise((r: any)=>release=r);const {app}=await setup(t,{planTheme:async()=>{await gate;return {options:[samplePlan(),samplePlan('科幻'),samplePlan('志怪')]};}});
 const pending: any=app.dispatch({action:'theme-plan',theme:'明日主题'});await app.dispatch({action:'theme',title:'当前主题'});await app.dispatch({action:'start'});release();await pending;
 assert.equal(app.snapshot().themeDraft.seed,'明日主题');assert.equal(app.snapshot().theme.title,'当前主题');assert.equal(app.snapshot().round.status,'collecting');
});
test('only an applied reviewed plan reaches reply and image generation, replacing the legacy world preset',async (t: any)=>{
 let replyInput: any,imageInput: any,explainCalls: any=0;const plan: any={...samplePlan('月亮便利店'),setting:'月球地下玻璃温室里的旧货架',visualStyle:'墨绿色版画'};
 const {app}=await setup(t,{planTheme:async()=>({options:[plan,samplePlan('科幻'),samplePlan('志怪')]}),reply:async (input: any)=>{replyInput=input;return {text:'欢迎来温室'};},explain:async()=>{explainCalls++;return {text:'没有采用的开场'};}});
 await app.dispatch({action:'theme-plan',theme:'月亮便利店'});const d: any=app.snapshot().themeDraft;
 await app.dispatch({action:'theme-plan-apply',draftId:d.id,optionId:d.options[0].id,revision:d.revision});
 await app.dispatch({action:'explain'});assert.equal(explainCalls,0);assert.equal(app.snapshot().explanation,plan.hostIntro);
 await app.dispatch({action:'manual',text:'旧车票',nickname:'旅人'});const comment: any=app.snapshot().comments[0];await app.dispatch({action:'reply',commentId:comment.id});assert.equal(replyInput.themePlan.setting,plan.setting);
 app.state.selections=[{commentId:comment.id,text:comment.text,nickname:'旅人',prompt:'一张旧车票'}];app.image={generate:async (input: any)=>{imageInput=input;return {bytes:Buffer.from('png'),mime:'image/png'};}};
 await app.dispatch({action:'generate',commentId:comment.id,format:'png'});assert.match(imageInput.prompt,/月球地下玻璃温室/);assert.doesNotMatch(imageInput.prompt,/没有观察窗/);
});
test('stale draft revisions are rejected before editing or applying a newer review',async (t: any)=>{
 const {app}=await setup(t,{planTheme:async()=>({options:[samplePlan(),samplePlan('科幻'),samplePlan('志怪')]})});await app.dispatch({action:'theme-plan',theme:'月球'});const d: any=app.snapshot().themeDraft;const payload: any={draftId:d.id,optionId:d.options[0].id,revision:d.revision,plan:d.options[0].plan};
 await app.dispatch({action:'theme-plan-save',...payload});await assert.rejects(app.dispatch({action:'theme-plan-apply',...payload}),/其他页面/);
 await assert.rejects(app.dispatch({action:'theme-plan-save',draftId:d.id,optionId:d.options[0].id,plan:d.options[0].plan}),/其他页面/);
 assert.equal(app.snapshot().theme.title,'');
});
test('incomplete generated directions do not trigger hidden retries',async()=>{
 let calls: any=0;const text: any=new DeepSeekText({apiKey:'test',fetchImpl:async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({options:[{title:'半份草案'}]})}}]}));}});
 await assert.rejects(text.planTheme({theme:'月球'}),/三个/);assert.equal(calls,1);
});
test('approved planning survives restart and damaged optional drafts do not erase the theme',async (t: any)=>{
 const {app,dataDir}=await setup(t,{planTheme:async()=>({options:[samplePlan(),samplePlan('科幻'),samplePlan('志怪')]})});await app.dispatch({action:'theme-plan',theme:'月球'});const d: any=app.snapshot().themeDraft;
 await app.dispatch({action:'theme-plan-apply',draftId:d.id,optionId:d.options[0].id,revision:d.revision});await app.flush();
 const {readFile,writeFile}=await import('node:fs/promises');const path: any=join(dataDir,'state.json');const saved: any=JSON.parse(await readFile(path,'utf8'));saved.state.themeDraft.options=[];await writeFile(path,JSON.stringify(saved));
 const restored: any=await new Application({dataDir,autoTick:false}).open();t.after(()=>restored.close());assert.equal(restored.snapshot().theme.title,samplePlan().title);assert.equal(restored.snapshot().theme.plan.setting,samplePlan().setting);assert.equal(restored.snapshot().themeDraft,null);
});
test('approved audience prompt is used by the live round instead of a generic opening question',async (t: any)=>{
 const {app}=await setup(t,{planTheme:async()=>({options:[samplePlan(),samplePlan('科幻'),samplePlan('志怪')]})});await app.dispatch({action:'theme-plan',theme:'月球'});const d: any=app.snapshot().themeDraft;
 await app.dispatch({action:'theme-plan-apply',draftId:d.id,optionId:d.options[0].id,revision:d.revision});
 await app.dispatch({action:'workflow-start',autoChat:false,autoVoice:false});assert.equal(app.snapshot().workflow.currentQuestion,samplePlan().audiencePrompt);
});
test('identical generated plans are rejected after one request, preserving the previous draft',async (t: any)=>{
 const plan: any=samplePlan();let calls: any=0;const text: any=new DeepSeekText({apiKey:'test',fetchImpl:async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({options:[plan,plan,plan]})}}]}));}});
 await assert.rejects(text.planTheme({theme:'月球'}),/重复/);assert.equal(calls,1);
 let duplicate: any=false;const {app}=await setup(t,{planTheme:async()=>({options:duplicate?[plan,plan,plan]:[plan,samplePlan('科幻'),samplePlan('志怪')]})});
 await app.dispatch({action:'theme-plan',theme:'月球'});const old: any=app.snapshot().themeDraft;duplicate=true;await assert.rejects(app.dispatch({action:'theme-plan',theme:'月球'}),/重复/);assert.equal(app.snapshot().themeDraft.id,old.id);
});
