import test from 'node:test';
import assert from 'node:assert/strict';
import {callColabWithRecovery,isTransientColabError} from '../dual-recovery.mjs';
import {runDual} from '../dual-mode.mjs';
const cfg={dualMode:{resilience:{enabled:true,maxRetries:1}}};
test('transient 503 recovers via the same Colab provider, without cloud',async()=>{
 let calls=0; const retries=[]; const pauses=[];
 const output=await callColabWithRecovery([],cfg,async()=>{
  calls++;if(calls===1)throw Error('Colab gateway HTTP 503: backend unavailable');
  return {output:'Colab recovered'};
 },{sleep:async ms=>pauses.push(ms),onRetry:r=>retries.push(r)});
 assert.equal(calls,2);
 assert.equal(output.output,'Colab recovered');
 assert.deepEqual(pauses,[1500]);
 assert.equal(retries[0].attempt,1);
});
test('retry opt-in disabled by default',async()=>{
 let calls=0;
 await assert.rejects(callColabWithRecovery([],{},async()=>{calls++;throw Error('Colab gateway HTTP 503');}),/503/);
 assert.equal(calls,1);
});
test('only temporary gateway failures are retried',async()=>{
 for(const message of ['Colab gateway HTTP 401','Colab gateway HTTP 400','Missing COLAB_GATEWAY_API_KEY','Colab gateway returned no text']){
  let calls=0;
  await assert.rejects(callColabWithRecovery([],cfg,async()=>{calls++;throw Error(message);},{sleep:async()=>{}}));
  assert.equal(calls,1);
 }
 assert.equal(isTransientColabError(Error('PAIR HTTP 503')),false);
});
test('retry exhausted and original error propagated',async()=>{
 let calls=0;
 await assert.rejects(callColabWithRecovery([],cfg,async()=>{calls++;throw Error('Colab gateway HTTP 503');},{sleep:async()=>{}}),/503/);
 assert.equal(calls,2);
});
test('dual pipeline retries Colab once without rerunning PAIR or research',async()=>{
 let pair=0;let research=0;let colab=0;
 const result=await runDual('How does Python asyncio work?',cfg,{
  callPair:async()=>{pair++;return 'draft';},
  collectEvidence:async()=>({}),
  researchDocs:async()=>{research++;return {sourcesConsulted:[]};},
  sleep:async()=>{},
  callColab:async()=>{colab++;if(colab===1)throw Error('Colab gateway HTTP 503: cold start');return {output:'recovered review'};}
 });
 assert.equal(pair,1);assert.equal(research,1);assert.equal(colab,2);
 assert.match(result.colab,/recovered review/);
});
