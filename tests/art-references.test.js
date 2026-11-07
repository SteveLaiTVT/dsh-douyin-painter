import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveArtReferences} from '../src/art-references.js';
test('Moonlight Box forwards only supplied local reference bytes and verified prop notes',async()=>{
 const result=await resolveArtReferences('月光宝盒 随时随地都能穿越用',{readReference:()=>Buffer.concat([Buffer.from('ffd8ff','hex'),Buffer.alloc(12000)])});
 assert.equal(result.images.length,1);assert.equal(result.images[0].mime,'image/jpeg');assert.ok(Buffer.isBuffer(result.images[0].bytes));assert.ok(result.images[0].bytes.length>10000);
 assert.equal(result.images[0].bytes.subarray(0,3).toString('hex'),'ffd8ff');assert.match(result.notes,/对开/);assert.match(result.notes,/不.*人物/);assert.match(result.sources[0].sourceUrl,/hk01/);
 assert.deepEqual((await resolveArtReferences('月饼')).images,[]);
});
test('missing local reference falls back to verified structural notes without claiming an image input',()=>{
 const result=resolveArtReferences('月光宝盒',{readReference:()=>{throw Object.assign(Error('missing'),{code:'ENOENT'});}});
 assert.deepEqual(result.images,[]);assert.deepEqual(result.sources,[]);assert.match(result.notes,/对开/);assert.doesNotMatch(result.notes,/参考图1/);
});
