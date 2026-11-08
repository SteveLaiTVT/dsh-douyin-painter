import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {chromium} from 'playwright';
import {Application} from '../src/app.js';
import {LocalServer} from '../src/server.js';

test('stage starts progressive MP3 before full generation, saves a replay and stops another live stream',async (t: any)=>{
 const dataDir: any=await mkdtemp(join(tmpdir(),'speech-stream-browser-'));
 const tone: any=await readFile(new URL('./fixtures/stream-tone.mp3',import.meta.url));
 const capture: any=new EventEmitter();capture.stop=async()=>{};
 let release: any,completed: any=false,signal: any;
 const speech: any={openStream:async (input: any)=>{signal=input.signal;const gate: any=new Promise((resolve: any)=>release=resolve);return {mime:'audio/mpeg',chunks:(async function*(){yield tone.subarray(0,32000);await gate;yield tone.subarray(32000);completed=true;})()};}};
 const app: any=await new Application({dataDir,capture,speech,autoTick:false}).open();const server: any=new LocalServer({app});await server.start(0);
 let executablePath: any;try{await access('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');executablePath='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';}catch{}
 const browser: any=await chromium.launch({headless:true,executablePath});
 t.after(async()=>{release?.();await browser.close();await server.close();await app.close();await rm(dataDir,{recursive:true,force:true});});
 const stage: any=await browser.newPage({viewport:{width:540,height:960}});const faults: any=[];stage.on('pageerror',(error: any)=>faults.push(error.message));
 await stage.goto(server.origin+'/stage');await stage.locator('#enable-sound').click();
 await app.dispatch({action:'speak',text:'短句流式验证'});
 try{await stage.waitForFunction(()=>{const audio: any=document.querySelector<any>('#stage-audio');return !audio.paused&&audio.currentTime>0.05;},{},{timeout:10000});}catch(error: any){console.log(await stage.evaluate(()=>{const a: any=document.querySelector<any>('#stage-audio');return {src:a.src,paused:a.paused,time:a.currentTime,ready:a.readyState,network:a.networkState,error:a.error?.message,status:document.querySelector<any>('#sound-status').textContent};}));throw error;}
 assert.equal(completed,false,'first audible audio must precede the upstream final packet');
 assert.equal(app.snapshot().speech[0].streaming,true);
 release();await stage.waitForFunction(async()=>!(await(await fetch('/api/state')).json()).speech[0].streaming);
 assert.deepEqual(await readFile(join(dataDir,'media',app.snapshot().speech[0].id)),tone);
 await app.dispatch({action:'speak',text:'停止时取消后续流式片段'});
 assert.equal(signal.aborted,false);await app.dispatch({action:'stop-speech'});assert.equal(signal.aborted,true);
 await stage.waitForFunction(()=>!document.querySelector<any>('#stage-audio').getAttribute('src'));
 release();assert.deepEqual(faults,[]);
});
