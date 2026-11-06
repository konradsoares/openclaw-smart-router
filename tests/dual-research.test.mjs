import test from 'node:test';
import assert from 'node:assert/strict';
import {eligibleResearchDocs,researchOfficialDocs} from '../dual-research.mjs';
import {runDual} from '../dual-mode.mjs';
test('official research remains disabled by default',async()=>{
 let called=0;
 const result=await researchOfficialDocs('Qwen3 llama.cpp 128K','',{}, {fetchImpl:async()=>{called++;throw Error('unexpected');}});
 assert.equal(called,0);
 assert.equal(result.externalResearchPerformed,false);
});
test('only fixed official sources are selected',()=>{
 assert.equal(eligibleResearchDocs('What is 2 + 2?').length,0);
 assert.equal(eligibleResearchDocs('Qwen3-4B on llama.cpp').length,2);
});
test('research captures official excerpts and does not follow redirects',async()=>{
 const calls=[];
 const cfg={dualMode:{research:{enabled:true}}};
 const r=await researchOfficialDocs('Qwen3-4B llama.cpp','',cfg,{fetchImpl:async(url,opts)=>{
  calls.push({url,opts});
  return {ok:true,headers:{get:()=>null},text:async()=>String(url).includes('huggingface')?
   'Context Length: 262,144 natively.\nOther info':
   '--ctx-size N size of prompt context\nOther info'};
 }});
 assert.equal(calls.length,2);
 assert.equal(r.sourcesConsulted.length,2);
 assert.equal(r.externalResearchPerformed,true);
 assert.ok(calls.every(x=>x.opts.redirect==='error'&&x.opts.method==='GET'));
 assert.ok(r.sourcesConsulted.every(x=>x.url.startsWith('https://')));
});
test('lookup failures do not become fabricated evidence',async()=>{
 const r=await researchOfficialDocs('Qwen llama-server','',{dualMode:{research:{enabled:true}}},{fetchImpl:async()=>{throw Error('offline')}});
 assert.equal(r.externalResearchPerformed,false);
 assert.equal(r.sourcesConsulted.length,0);
 assert.equal(r.limitations.length,2);
});
test('dual reviewer gets both runtime and research evidence',async()=>{
 let messages;
 const cfg={dualMode:{research:{enabled:true}}};
 await runDual('Qwen llama.cpp',cfg,{
  callPair:async()=> 'draft',
  collectEvidence:async()=>({runtimeChecks:[]}),
  researchDocs:async()=>({externalResearchPerformed:true,sourcesConsulted:[{id:'official',url:'https://example.com',excerpts:['example']}]}),
  callColab:async m=>{messages=m;return {output:'review'};}
 });
 assert.match(messages[1].content,/OFFICIAL DOCUMENTATION RESEARCH/);
 assert.match(messages[1].content,/UNTRUSTED/);
});
