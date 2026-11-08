import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {Application} from '../src/app.js';
import {LocalServer} from '../src/server.js';
async function fixture(t: any){
 const dataDir: any=await mkdtemp(join(tmpdir(),'avatar-browser-'));
 const tone: any=await readFile(new URL('./fixtures/stream-tone.mp3',import.meta.url));let release: any,complete: any=false;
 const speech: any={openStream:async()=>({mime:'audio/mpeg',chunks:(async function*(){yield tone.subarray(0,32000);await new Promise((r: any)=>release=r);yield tone.subarray(32000);complete=true;})()})};
 const app: any=await new Application({dataDir,speech,autoTick:false}).open();const server: any=new LocalServer({app});await server.start(0);
 const browser: any=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 t.after(async()=>{release?.();await browser.close();await server.close();await app.close();await rm(dataDir,{recursive:true,force:true});});
 return {app,server,browser,get complete(){return complete;},release:()=>release?.()};
}
test('original host follows actual progressive audio, closes its mouth on mute, and preserves safe margins',async (t: any)=>{
 const f: any=await fixture(t);const stage: any=await f.browser.newPage({viewport:{width:540,height:960}});const faults: any=[],external: any=[];
 stage.on('pageerror',(e: any)=>faults.push(e.message));stage.on('request',(r: any)=>{if(!r.url().startsWith(f.server.origin)&&!r.url().startsWith('blob:'))external.push(r.url());});
 await stage.goto(f.server.origin+'/stage');await stage.waitForSelector('#stage-avatar[data-ready="true"]');
 await stage.locator('#enable-sound').click();await f.app.dispatch({action:'speak',text:'欢迎来到月球路边摊'});
 await stage.waitForFunction(()=>Number(document.querySelector<any>('#host-canvas')?.dataset.mouth)>0.1&&document.querySelector<any>('#stage-audio').currentTime>0.05);
 assert.equal(f.complete,false,'lip sync must start before upstream completes');
 assert.match(await stage.locator('#host-caption').textContent(),/欢迎来到/);
 const control: any=await f.browser.newPage();await control.goto(f.server.origin+'/control');await control.locator('#avatar-enabled').uncheck();
 await stage.waitForSelector('#stage-avatar[hidden]',{state:'attached'});assert.equal(await stage.locator('#stage-audio').evaluate((a: any)=>a.paused),false,'hiding the host must not stop speech');
 await control.locator('#avatar-enabled').check();await stage.waitForSelector('#stage-avatar:not([hidden])');
 await stage.locator('#stage-sound').hover();await stage.locator('#disable-sound').click();
 await stage.waitForFunction(()=>Number(document.querySelector<any>('#host-canvas').dataset.mouth)===0);
 f.release();await f.app.dispatch({action:'stop-speech'});
 for(const [width,height] of [[360,640],[540,960],[1080,1920]]){
  await stage.setViewportSize({width,height});
  const bounds: any=await stage.evaluate(()=>{const q: any=(s: any)=>{const r: any=document.querySelector<any>(s).getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom};};return {host:q('#stage-avatar'),content:q('.stage-content'),layout:q('.stage-layout')};});
  const unit: any=width/1080;assert.ok(bounds.host.x>=112*unit-1);assert.ok(bounds.host.right<=width-112*unit+1);assert.ok(bounds.host.bottom<=bounds.layout.bottom-230*unit+1);assert.ok(bounds.content.bottom<=bounds.host.y+1,'host must not overlay the content');
 }
 assert.deepEqual(faults,[]);assert.deepEqual(external,[]);
});
test('missing animation module does not prevent original stage audio',async (t: any)=>{
 const f: any=await fixture(t);const page: any=await f.browser.newPage();await page.route('**/vendor/livliv/**',(route: any)=>route.abort());
 await page.goto(f.server.origin+'/stage');await page.waitForFunction(()=>document.querySelector<any>('#stage-avatar')?.dataset.failed==='true');
 await page.locator('#enable-sound').click();await f.app.dispatch({action:'speak',text:'动画失败时声音仍然可用'});
 await page.waitForFunction(()=>document.querySelector<any>('#stage-audio').currentTime>0.05);
 assert.equal(f.complete,false);f.release();
});
test('original face draws visible eyes from the actual LivLiv pose field names',async (t: any)=>{
 const f: any=await fixture(t);const page: any=await f.browser.newPage();await page.goto(f.server.origin+'/stage');
 const pixel: any=await page.evaluate(async()=>{
  const {MoonBody}=await import('/moon-body.js');const body: any=new MoonBody();const c: any=document.createElement('canvas');body.attach(c);
  body.render(c,{params:{angleX:0,angleY:0,angleZ:0,eyeLOpen:1,eyeROpen:1,eyeBallX:0,eyeBallY:0,browLY:0,browRY:0,mouthOpen:0,smile:0,vowel:0,bodyX:0,bodyZ:0,breath:0},move:{x:0,y:0,s:1},expr:{}},260,290);
  return [...c.getContext('2d').getImageData(104,111,1,1).data];
 });
 assert.deepEqual(pixel,[185,235,220,255],'a visible eye must occupy the expected face anchor');
});
test('sound gesture waits for local avatar initialization and then drives lips on the first playback',async (t: any)=>{
 const f: any=await fixture(t);const page: any=await f.browser.newPage();let release: any;
 const gate: any=new Promise((r: any)=>release=r);await page.route('**/stage-avatar.js',async (route: any)=>{await gate;await route.continue();});
 await page.goto(f.server.origin+'/stage',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector<any>('#enable-sound')?.disabled===true);
 release();await page.waitForSelector('#stage-avatar[data-ready="true"]');await page.locator('#enable-sound').click();
 await f.app.dispatch({action:'speak',text:'第一句就要对上嘴型'});
 await page.waitForFunction(()=>Number(document.querySelector<any>('#host-canvas').dataset.mouth)>.1&&document.querySelector<any>('#stage-audio').currentTime>0);
 assert.equal(f.complete,false);f.release();
});
