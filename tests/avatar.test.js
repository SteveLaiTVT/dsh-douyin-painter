import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Application} from '../src/app.js';
import {LocalServer} from '../src/server.js';
test('avatar visibility persists without clearing the room, stage or audio',async t=>{
 const dataDir=await mkdtemp(join(tmpdir(),'moon-host-'));let app=await new Application({dataDir,autoTick:false}).open();
 t.after(async()=>{await app.close();await rm(dataDir,{recursive:true,force:true});});
 await app.dispatch({action:'room',room:'551467145991'});
 await app.dispatch({action:'avatar',enabled:false});
 assert.equal(app.snapshot().settings.avatarEnabled,false);assert.equal(app.snapshot().settings.room,'551467145991');
 await app.close();app=await new Application({dataDir,autoTick:false}).open();assert.equal(app.snapshot().settings.avatarEnabled,false);
 await assert.rejects(app.dispatch({action:'avatar',enabled:'false'}));
 await app.dispatch({action:'avatar',enabled:true});assert.equal(app.snapshot().settings.avatarEnabled,true);
});
test('browser player is served locally, with no arbitrary node_modules access',async t=>{
 const dataDir=await mkdtemp(join(tmpdir(),'moon-host-http-'));const app=await new Application({dataDir,autoTick:false}).open();const server=new LocalServer({app});await server.start(0);
 t.after(async()=>{await server.close();await app.close();await rm(dataDir,{recursive:true,force:true});});
 for(const path of ['/stage-avatar.js','/moon-body.js','/vendor/livliv/body.js','/vendor/livliv/voice.js']){
  const response=await fetch(server.origin+path);assert.equal(response.status,200,path);assert.match(response.headers.get('content-type'),/javascript/);
 }
 for(const path of ['/vendor/livliv/../../../package.json','/vendor/livliv/package.json','/vendor/livliv/tracking.js'])assert.equal((await fetch(server.origin+path)).status,404);
});
