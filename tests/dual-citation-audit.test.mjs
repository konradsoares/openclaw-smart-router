import test from 'node:test';
import assert from 'node:assert/strict';
import {auditReviewCitations} from '../dual-citation-audit.mjs';
import {runDual} from '../dual-mode.mjs';
const trusted='https://raw.githubusercontent.com/nodejs/node/main/doc/api/fs.md';
test('retrieved reference is not flagged',()=>{
 const result=auditReviewCitations('Source: '+trusted,{sourcesConsulted:[{url:trusted,retrieved:true}]});
 assert.deepEqual(result,[]);
});
test('unretrieved citations are flagged regardless of topic',()=>{
 const result=auditReviewCitations('Fonte: https://example.org/guessed',{sourcesConsulted:[{url:trusted,retrieved:true}]});
 assert.equal(result.length,1);
 assert.equal(result[0].id,'citation-not-retrieved');
});
test('generic example URLs are not mistaken for a citation',()=>{
 assert.deepEqual(auditReviewCitations('Use https://example.org/api to send requests',{}),[]);
});
test('failed retrieval cannot count as verified',()=>{
 const r=auditReviewCitations('Documentation: '+trusted,{sourcesConsulted:[{url:trusted,retrieved:false}]});
 assert.equal(r.length,1);
});
test('reviewer citation audit appends separate warning but leaves answer intact',async()=>{
 const result=await runDual('What does node:fs do?',{},{
  callPair:async()=> 'Draft',
  collectEvidence:async()=>({}),
  researchDocs:async()=>({sourcesConsulted:[{url:trusted,retrieved:true}]}),
  callColab:async()=>({output:'See source: https://example.org/not-fetched'})
 });
 assert.ok(result.findings.some(x=>x.id==='citation-not-retrieved'));
 assert.match(result.colab,/Smart Router/);
 assert.match(result.colab,/not-fetched/);
});
