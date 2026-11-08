import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../src/config.js';
test('local env config is server-only, environment wins and hyphenated DeepSeek key is supported',async (t: any)=>{
 const root: any=await mkdtemp(join(tmpdir(),'theme-config-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(join(root,'.env.local'),'OPENAI_API_KEY=local-test\nMINIMAX_API_KEY="voice-test"\nDEEPSEEK_API_KEY=text-test\nPAINTER_PORT=3333\n');
 const c: any=loadConfig({root,env:{OPENAI_API_KEY:'env-test'}});assert.equal(c.openaiKey,'env-test');assert.equal(c.minimaxKey,'voice-test');assert.equal(c.port,3333);
 assert.equal(loadConfig({root,env:{DEEPSEEK_API_KEY:'','deepseek-api-key':'alias'}}).deepseekKey,'alias');
 assert.throws(()=>loadConfig({root,env:{PAINTER_PORT:'invalid'}}),/端口/);
});
test('the default host uses a quality preset while explicit voice environment remains authoritative',()=>{
 assert.equal(loadConfig({root:'/tmp/nonexistent-workflow-config',env:{}}).voiceId,'Chinese (Mandarin)_Radio_Host');
 assert.equal(loadConfig({root:'/tmp/nonexistent-workflow-config',env:{MINIMAX_VOICE_ID:'custom-voice'}}).voiceId,'custom-voice');
});
