import test from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../dispatch-policy.mjs';
import { dispatch } from '../dispatch.mjs';
test('multiline and longer self-contained prompts remain local', () => {
 assert.equal(classify('Translate this:\nBonjour').agent,'pair');
 assert.equal(classify('Explain '.repeat(300)).agent,'pair');
});
test('tools require explicit cloud authorization by default', async () => {
 assert.equal(classify('Read a file').blocked,true);
 const r=await dispatch('Read a file',{},'auto',async()=>{throw Error('must not call model')});
 assert.equal(r.finalAgent,'none');
});
test('local failure never silently spends on cloud', async () => {
 const calls=[]; const r=await dispatch('Hello',{},'auto',async(c,a)=>{calls.push(a);return {ok:false};});
 assert.equal(calls.length,1);assert.equal(r.ok,false);assert.equal(r.finalAgent,'pair');
 assert.equal(calls[0][calls[0].indexOf('--thinking')+1],'off');
});
test('opt-in fallback calls cloud once',async()=>{
 const calls=[];const r=await dispatch('Hello',{allowCloudFallback:true},'auto',async(c,a)=>{calls.push(a);return calls.length===1?{ok:false}:{ok:true,stdout:'Hi'};});
 assert.equal(calls.length,2);assert.equal(r.finalAgent,'main');assert.equal(r.ok,true);
});
test('forced local cannot fall back even when enabled',async()=>{
 let calls=0;await dispatch('Hello',{allowCloudFallback:true},'local',async()=>{calls++;return {ok:false};});assert.equal(calls,1);
});
test('forced cloud is explicit and never retried',async()=>{
 let calls=0;const r=await dispatch('Hello',{},'cloud',async()=>{calls++;return {ok:false};});assert.equal(calls,1);assert.equal(r.finalAgent,'main');
});
