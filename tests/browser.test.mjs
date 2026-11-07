import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, mkdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { Application } from '../src/app.js';
import { LocalServer } from '../src/server.js';
const waitFor=async(page,condition)=>page.waitForFunction(condition);
function silenceWav(){const b=Buffer.alloc(44+16000);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(16000,40);return b;}
test('browser: theme, comments, AI selections, image, reply, speech, replay and mobile layout',async t=>{
 const dataDir=await mkdtemp(join(tmpdir(),'theme-browser-'));const capture=new EventEmitter();let stops=0;capture.stop=async()=>{stops++;};capture.start=async()=>capture.emit('status',{state:'connected',message:'离线测试连接'});
 const app=await new Application({dataDir,capture,config:{deepseek:true,openai:true,minimax:true},
 text:{explain:async()=>({text:'今天来想象月亮便利店，发一句奇妙商品名。'}),select:async({comments})=>({selections:comments.slice(0,3).map(c=>({commentId:c.id,reason:'有创意、有画面感',prompt:c.text}))}),reply:async()=>({text:'这件商品适合带回地球！'}),evaluate:async()=>({eligible:true,score:92,reason:'想象生动',reply:'很棒的想法'})},
 image:{generate:async()=>({bytes:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=','base64'),mime:'image/png'})},
 speech:{synthesize:async()=>({bytes:silenceWav(),mime:'audio/wav'})}}).open();
 const server=new LocalServer({app});await server.start(0);let executablePath;try{await access('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');executablePath='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';}catch{}
 const browser=await chromium.launch({headless:true,executablePath});t.after(async()=>{await browser.close();await server.close();await app.close();await rm(dataDir,{recursive:true,force:true});});
 const page=await browser.newPage({viewport:{width:1600,height:1100}});const faults=[];page.on('pageerror',e=>faults.push(e.message));
 await page.goto(server.origin+'/control');capture.emit('status',{state:'offline',message:'直播间未开播',active:true});await page.locator('#disconnect-button').waitFor({state:'visible'});await page.locator('#disconnect-button').click();await page.locator('#disconnect-button').waitFor({state:'hidden'});assert.equal(stops,1);await page.locator('#theme-title').fill('如果月亮开了一家便利店');await page.locator('#theme-rules').fill('一句话说出店里最奇妙的商品');await page.locator('#save-theme').click();
 await waitFor(page,()=>!document.querySelector('#start-round').disabled);await page.locator('#start-round').click();await waitFor(page,()=>document.querySelector('#round-status').textContent==='正在收词');
 await page.locator('.manual-details summary').click();await page.locator('#manual-name').fill('离线测试观众');await page.locator('#manual-text').fill('可以把乡愁装进口袋的月光罐头');await page.locator('#manual-form button').click();await waitFor(page,()=>document.querySelectorAll('.comment-card').length===1);
 await page.getByRole('button',{name:'AI 接话',exact:true}).click();await waitFor(page,()=>document.querySelector('.reply-block')?.textContent.includes('带回地球'));
 await page.locator('#close-round').click();await waitFor(page,()=>!document.querySelector('#select-button').disabled);await page.locator('#select-button').click();await waitFor(page,()=>document.querySelectorAll('.selection-card').length===1);
 await page.getByRole('button',{name:'✧ 将创意画出来'}).click();await waitFor(page,()=>document.querySelectorAll('.artwork-card').length===1);
 const stage=await browser.newPage();stage.on('pageerror',e=>faults.push(e.message));await stage.goto(server.origin+'/stage');await stage.locator('#stage-image').waitFor({state:'visible'});await stage.locator('#enable-sound').click();
 await page.getByRole('button',{name:'♫ 朗读',exact:true}).click();await waitFor(page,()=>document.querySelectorAll('.speech-row').length===1);
 await stage.waitForFunction(()=>document.querySelector('#stage-audio').getAttribute('src')?.startsWith('/media/'));
 await page.getByRole('button',{name:'重新播放',exact:true}).click();const rev=app.snapshot().stage.speechRevision;assert.ok(rev>=2);
 await page.getByRole('button',{name:'■ 停止朗读',exact:true}).click();await stage.waitForFunction(()=>!document.querySelector('#stage-audio').getAttribute('src'));
 await mkdir('.data/validation',{recursive:true});await page.screenshot({path:'.data/validation/control-desktop.png',fullPage:true});await stage.screenshot({path:'.data/validation/stage.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.data/validation/control-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(faults,[]);
});
test('browser resumes after a service restart with a new revision sequence',async t=>{
 const dataDir=await mkdtemp(join(tmpdir(),'theme-reconnect-'));const capture=()=>{const c=new EventEmitter();c.stop=async()=>{};return c;};
 let app=await new Application({dataDir,capture:capture()}).open();let server=new LocalServer({app});await server.start(0);const port=server.port,origin=server.origin;
 await app.dispatch({action:'theme',title:'重启前主题'});for(let i=0;i<12;i++)await app.dispatch({action:'manual',text:'重启前发言'+i});
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 t.after(async()=>{await browser.close();await server.close();await app.close();await rm(dataDir,{recursive:true,force:true});});
 const page=await browser.newPage();await page.goto(origin+'/control');await page.waitForFunction(()=>document.querySelector('#theme-title').value==='重启前主题');
 const stage=await browser.newPage();await stage.goto(origin+'/stage');await stage.waitForFunction(()=>document.querySelector('#stage-title').textContent==='重启前主题');
 await server.close();await app.close();app=await new Application({dataDir,capture:capture()}).open();server=new LocalServer({app});await server.start(port);await app.dispatch({action:'theme',title:'重启后主题'});
 await page.waitForFunction(()=>document.querySelector('#theme-title').value==='重启后主题',{},{timeout:7000});await stage.waitForFunction(()=>document.querySelector('#stage-title').textContent==='重启后主题',{},{timeout:7000});
});
test('browser: theme and room settings restore, UID stays visible across distinct comments, candidate sources stay attributable',async t=>{
 const dataDir=await mkdtemp(join(tmpdir(),'theme-settings-browser-'));const capture=new EventEmitter();capture.stop=async()=>{};
 const app=await new Application({dataDir,capture}).open();const server=new LocalServer({app});await server.start(0);
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 t.after(async()=>{await browser.close();await server.close();await app.close();await rm(dataDir,{recursive:true,force:true});});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const faults=[];page.on('pageerror',e=>faults.push(e.message));
 // UI-only offline backend. Saved settings survive page reload in this fixture;
 // no provider or real capture operation is called by this test.
 const saved={settings:{room:''},theme:{title:'',rules:''},round:{id:'r1',status:'collecting'},capture:{state:'disconnected',active:false,message:'尚未连接直播间',room:''},comments:[],selections:[],artworks:[],speech:[],stage:{},errors:[],busy:[],config:{}};
 const actions=[];let nextComment=0;
 await page.route('**/api/state',route=>route.fulfill({json:saved}));
 await page.route('**/api/events',route=>route.fulfill({status:200,contentType:'text/event-stream',body:': offline fixture\n\n'}));
 await page.route('**/api/actions',async route=>{
  const input=route.request().postDataJSON();actions.push(input);
  if(input.action==='theme')saved.theme={title:input.title,rules:input.rules};
  if(input.action==='room')saved.settings.room=input.room;
  if(input.action==='manual'){
   const existing=saved.comments.find(c=>c.text===input.text&&c.userId===input.userId);
   if(existing){existing.occurrenceCount=(existing.occurrenceCount||1)+1;saved.comments.push({id:'c'+(++nextComment),duplicateOf:existing.id,text:input.text,nickname:input.nickname,userId:input.userId,source:'manual',receivedAt:Date.now()});}
   else saved.comments.push({id:'c'+(++nextComment),text:input.text,nickname:input.nickname,userId:input.userId,source:'manual',occurrenceCount:1,receivedAt:Date.now()});
  }
  if(input.action==='close-round')saved.round.status='closed';
  if(input.action==='select')saved.selections=[{commentId:'c1',sourceIds:['c1','c2'],text:'综合两个灵感的月光罐头',nickname:'月亮来客',reason:'两条创意有相同的温柔想象',prompt:'月光罐头'}];
  await route.fulfill({json:saved});
 });
 await page.goto(server.origin+'/control');
 assert.equal(await page.getByRole('heading',{name:'直播间设置',exact:true}).count(),1);
 assert.equal(await page.getByRole('heading',{name:/今日主题设置$/}).count(),1);
 await page.locator('#theme-title').fill('月亮便利店');await page.locator('#theme-rules').fill('每人给一个奇妙商品灵感');await page.locator('#save-theme').click();
 await page.locator('#room').fill('551467145991');await page.locator('#save-room').click();
 await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('直播间设置已保存'));
 await page.reload();await page.waitForFunction(()=>document.querySelector('#room').value==='551467145991'&&document.querySelector('#theme-title').value==='月亮便利店');
 assert.equal(actions.some(a=>a.action==='connect'),false,'saving settings must not connect capture');
 await page.locator('.manual-details summary').click();await page.locator('#manual-name').fill('月亮来客');await page.locator('#manual-user-id').fill('viewer-42');
 for(const text of ['可以收藏乡愁的月光罐头','装着故乡晚风的罐头']){await page.locator('#manual-text').fill(text);await page.locator('#manual-form button').click();await page.waitForFunction(()=>!document.querySelector('#manual-text').value);}
 assert.equal(await page.locator('.comment-identity').filter({hasText:'UID viewer-42'}).count(),2);
 await page.locator('#manual-text').fill('可以收藏乡愁的月光罐头');await page.locator('#manual-form button').click();await page.waitForFunction(()=>document.querySelector('.comment-repeat')?.textContent.includes('2'));
 assert.equal(await page.locator('.comment-card').count(),2,'duplicate display is merged without merging distinct ideas');
 await page.locator('#manual-user-id').fill('');await page.locator('#manual-text').fill('主播晚上好');await page.locator('#manual-form button').click();await page.waitForFunction(()=>document.querySelectorAll('.comment-card').length===3);
 assert.equal(await page.locator('.comment-identity').filter({hasText:'身份未知'}).count(),1);
 await page.locator('#close-round').click();await page.locator('#select-button').click();await page.locator('.selection-card').waitFor();
 assert.equal(await page.locator('.selection-card h3').textContent(),'综合两个灵感的月光罐头');
 await page.locator('.source-details summary').click();
 assert.equal(await page.locator('.source-comment').count(),2);
 assert.ok((await page.locator('.source-details').textContent()).includes('装着故乡晚风的罐头'));
 assert.ok((await page.locator('#comment-feed').textContent()).includes('主播晚上好'),'unrelated chat stays readable after selection');
 assert.ok(actions.filter(a=>a.action==='manual').slice(0,3).every(a=>a.userId==='viewer-42'));
 // Candidate source snapshots remain readable after raw-cache eviction. A
 // duplicate whose primary row was evicted must itself stay visible.
 saved.selections[0].sources=saved.comments.filter(c=>['c1','c2'].includes(c.id)).map(c=>({...c}));
 saved.comments=saved.comments.filter(c=>!['c1','c2'].includes(c.id));
 await page.reload();await page.locator('.selection-card').waitFor();await page.locator('.source-details summary').click();
 assert.equal(await page.locator('.source-comment').count(),2);
 assert.ok((await page.locator('.source-details').textContent()).includes('装着故乡晚风的罐头'));
 assert.ok((await page.locator('#comment-feed').textContent()).includes('可以收藏乡愁的月光罐头'),'orphan duplicate remains visible after primary eviction');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(faults,[]);
});
