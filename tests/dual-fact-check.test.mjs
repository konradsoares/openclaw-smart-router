import test from 'node:test';
import assert from 'node:assert/strict';
import {extractDocumentFacts,assessDualAnswer,formatFactCheck} from '../dual-fact-check.mjs';
import {runDual} from '../dual-mode.mjs';
const official='https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507/raw/main/README.md';
const llama='https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/server/README.md';
const research={sourcesConsulted:[
 {id:'qwen3-4b-2507',url:official,retrieved:true,excerpts:['- Context Length: **262,144 natively**.']},
 {id:'llama-server',url:llama,retrieved:true,excerpts:['--ctx-size N set the size of the prompt context']}
]};
test('facts only extracted from allowlisted successfully retrieved source',()=>{
 const facts=extractDocumentFacts(research);
 assert.equal(facts.length,2);
 assert.equal(facts[0].nativeContextTokens,262144);
 assert.equal(facts[1].documentedOption,'--ctx-size');
 assert.deepEqual(extractDocumentFacts({sourcesConsulted:[{...research.sourcesConsulted[0],retrieved:false}]}),[]);
 assert.deepEqual(extractDocumentFacts({sourcesConsulted:[{...research.sourcesConsulted[0],url:'https://example.com/readme'}]}),[]);
});
test('128K nominal context and 24GB unverified minimum are flagged',()=>{
 const text='O contexto nativo do Qwen3-4B-Instruct-2507 é de até 128K tokens. Para executar, requer pelo menos 24 GB de RAM.';
 const findings=assessDualAnswer(text,extractDocumentFacts(research));
 assert.deepEqual(findings.map(f=>f.id),['native-context-conflict','ram-minimum-unverified']);
 assert.match(formatFactCheck(findings),/262.144/);
});
test('correct native capability, specific hardware caveat and 128K goal are not a contradiction',()=>{
 const text='Qwen3-4B-Instruct-2507 tem contexto nativo de 256K. Quero rodar 128K, mas com 4 GB de VRAM não há garantia.';
 assert.equal(assessDualAnswer(text,extractDocumentFacts(research)).length,0);
});
test('bad llama-server CLI option is only flagged when shown as valid',()=>{
 const facts=extractDocumentFacts(research);
 assert.ok(assessDualAnswer('O parâmetro --n_ctx é suportado',facts).some(f=>f.id==='llama-flag-suspect'));
 assert.equal(assessDualAnswer('O parâmetro --n_ctx é inválido; use --ctx-size',facts).length,0);
});
test('regression: reviewer repeats 128K 24GB claim, router annotates separately',async()=>{
 const result=await runDual('Qwen3-4B-Instruct-2507 128K',{},{
  callPair:async()=> 'PAIR draft',
  collectEvidence:async()=>({}),
  researchDocs:async()=>research,
  callColab:async()=>({output:'O contexto nativo do Qwen3-4B-Instruct-2507 é de até 128K tokens. É necessário pelo menos 24 GB de RAM.'})
 });
 assert.equal(result.findings.length,2);
 assert.match(result.colab,/Smart Router — checagem de evidências/);
 assert.match(result.colab,/262.144/);
 assert.match(result.colab,/24 GB/);
});
test('no retrieved evidence does not produce invented correction',()=>{
 const facts=extractDocumentFacts({sourcesConsulted:[{...research.sourcesConsulted[0],retrieved:false}]});
 assert.deepEqual(assessDualAnswer('O contexto nativo do Qwen3-4B-Instruct-2507 é de até 128K tokens.',facts),[]);
});

test('denial of official evidence is distinct from native context ceiling',()=>{
 const message='Nao ha evidencia oficial que confirme o contexto nativo do Qwen3-4B-Instruct-2507 como 128K ou 262.144 tokens. Modelos de 4B exigem mais de 32 GB de VRAM.';
 const findings=assessDualAnswer(message,extractDocumentFacts(research));
 assert.ok(findings.some(f=>f.id==='official-context-evidence-denied'));
 assert.ok(!findings.some(f=>f.id==='native-context-conflict'));
 assert.ok(findings.some(f=>f.id==='ram-minimum-unverified'));
});
