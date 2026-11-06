import test from 'node:test';
import assert from 'node:assert/strict';
import {validateInventoryUrl,validatePropsUrl,collectDualEvidence,evidencePolicy} from '../dual-evidence.mjs';

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

test('optional server props exposes only allowlisted runtime fields',async()=>{
 const calls=[];
 const cfg={dualMode:{verification:{enabled:true,serverPropsEnabled:true}}};
 const result=await collectDualEvidence(cfg,{fetchImpl:async(url,opts)=>{
  calls.push([String(url),opts.method,opts.redirect]);
  if(String(url).endsWith('/props'))return {ok:true,json:async()=>({
   default_generation_settings:{n_ctx:8192},total_slots:2,build_info:'b9001-abcd',
   is_sleeping:false,model_path:'C:/private/models/model.gguf',
   chat_template:'SECRET TEMPLATE',private_token:'SECRET'
  })};
  return {ok:true,json:async()=>({data:[]})};
 }});
 assert.equal(calls.length,2);
 assert.deepEqual(calls.map(x=>x[2]),['error','error']);
 const props=result.runtimeChecks.find(x=>x.kind==='llama-server-properties');
 assert.equal(props.configuredContextTokens,8192);
 assert.equal(props.totalSlots,2);
 assert.equal(props.buildInfo,'b9001-abcd');
 assert.doesNotMatch(JSON.stringify(result),/SECRET|private\/models|chat_template|private_token/);
 assert.equal(result.commandsExecuted.length,0);
 assert.equal(result.externalResearchPerformed,false);
});
test('invalid props URL fails closed without fetching it',async()=>{
 const cfg={dualMode:{verification:{enabled:true,serverPropsEnabled:true,propsUrl:'http://example.org/props'}}};
 const calls=[];
 const result=await collectDualEvidence(cfg,{fetchImpl:async(url)=>{
  calls.push(String(url));return {ok:true,json:async()=>({data:[]})};
 }});
 assert.equal(calls.length,1);
 assert.match(result.limitations.join(' '),/server properties check failed/);
 assert.throws(()=>validatePropsUrl('http://127.0.0.1:8080/props?model=private'));
});
test('unavailable server props does not interrupt the review',async()=>{
 const result=await collectDualEvidence({dualMode:{verification:{enabled:true,serverPropsEnabled:true}}},
  {fetchImpl:async(url)=>String(url).endsWith('/props')?{ok:false,status:503}:{ok:true,json:async()=>({data:[]})}});
 assert.equal(result.runtimeChecks.length,1);
 assert.match(result.limitations.join(' '),/HTTP 503/);
});

test('llama-server router role does not misreport zero context as model context',async()=>{
 const result=await collectDualEvidence({dualMode:{verification:{enabled:true,serverPropsEnabled:true}}},
 {fetchImpl:async(url)=>({ok:true,json:async()=>String(url).endsWith('/props')?
 {role:'router',default_generation_settings:{n_ctx:0},build_info:'b11146-test',model_path:'private'}:
 {data:[{id:'qwen',meta:{n_ctx:11520}}]}})});
 const props=result.runtimeChecks.find(x=>x.kind==='llama-server-properties');
 assert.equal(props.serverRole,'router');
 assert.equal(props.configuredContextTokens,null);
 assert.equal(result.runtimeChecks[0].models[0].contextWindow,11520);
 assert.doesNotMatch(JSON.stringify(result),/private/);
});
