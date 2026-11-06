import test from 'node:test';
import assert from 'node:assert/strict';
import {validateInventoryUrl,collectDualEvidence,evidencePolicy} from '../dual-evidence.mjs';

test('verification is opt-in and never accesses network when disabled',async()=>{
 let requests=0;
 const r=await collectDualEvidence({}, {fetchImpl:async()=>{requests++;throw Error('unexpected fetch');}});
 assert.equal(requests,0);
 assert.equal(r.externalResearchPerformed,false);
 assert.equal(r.runtimeChecks.length,0);
});
test('read-only inventory returns bounded, attributed runtime metadata',async()=>{
 let called;
 const cfg={dualMode:{verification:{enabled:true}},nativeRouting:{pairModelsUrl:'http://127.0.0.1:8080/v1/models'}};
 const r=await collectDualEvidence(cfg,{fetchImpl:async(u,o)=>{called=[String(u),o.method];return {ok:true,json:async()=>({data:[{id:'model-a',meta:{n_ctx:11520},status:{value:'loaded'}}]})};}});
 assert.deepEqual(called,['http://127.0.0.1:8080/v1/models','GET']);
 assert.equal(r.runtimeChecks[0].models[0].contextWindow,11520);
 assert.equal(r.sourcesConsulted.length,0);
 assert.equal(r.commandsExecuted.length,0);
 assert.equal(r.externalResearchPerformed,false);
});
test('rejects non-loopback, credentials, query, and other paths',()=>{
 for(const u of ['https://localhost/v1/models','http://example.org/v1/models','http://127.0.0.1:8080/admin','http://127.0.0.1:8080/v1/models?key=x','http://u:p@127.0.0.1:8080/v1/models'])assert.throws(()=>validateInventoryUrl(u));
});
test('failed inventory remains unverified instead of failing dual',async()=>{
 const r=await collectDualEvidence({dualMode:{verification:{enabled:true}}},{fetchImpl:async()=>{throw Error('offline');}});
 assert.match(r.limitations.join(' '),/offline/);
 assert.equal(r.runtimeChecks.length,0);
 assert.match(evidencePolicy(),/Do not invent/);
});
