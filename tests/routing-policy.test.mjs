import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateTokens,requiredTokens,chooseRoute,PairInventory,selectNativeModels} from '../routing-policy.mjs';
import {createNativeRouting,LANGUAGE_INSTRUCTION} from '../native-routing.mjs';
import {callColab} from '../colab.mjs';
const small={model:'nvpair/small',contextWindow:4096,maxOutputTokens:512};
const big={model:'nvpair/big',contextWindow:11520,maxOutputTokens:2048};
const inventory=new Map([['small',{contextWindow:4096}],['big',{contextWindow:11520}]]);
test('token estimate budgets history, instructions, and output',()=>{
 assert.ok(estimateTokens('Olá mundo!')>0);
 assert.ok(requiredTokens({prompt:'hello',historyTokens:9000})>requiredTokens({prompt:'hello'}));
 assert.ok(requiredTokens({prompt:'hello',outputTokens:2048})>requiredTokens({prompt:'hello',outputTokens:512}));
});
test('small prompts route to smallest eligible local model',()=>{
 const route=chooseRoute({prompt:'hello',profiles:[big,small],availableModels:new Set(['small','big'])});
 assert.equal(route.model,'nvpair/small');
 assert.deepEqual(route.fallbacks,['nvpair/big']);
});
test('longer context selects larger model when small cannot fit',()=>{
 const route=chooseRoute({prompt:'explain',historyTokens:5500,profiles:[big,small],availableModels:new Set(['small','big'])});
 assert.equal(route.model,'nvpair/big');
});
test('unavailable PAIR model is excluded',()=>{
 const route=chooseRoute({prompt:'hello',profiles:[small,big],availableModels:new Set(['big'])});
 assert.equal(route.model,'nvpair/big');
});
test('tools require a model configured as tool-capable',()=>{
 const route=chooseRoute({prompt:'Search the web for news',profiles:[small,{...big,supportsTools:true}],availableModels:new Set(['small','big']),supportsTools:true});
 assert.equal(route.model,'nvpair/big');
});
test('Colab cannot be selected above its configured effective context window',()=>{
 const route=chooseRoute({prompt:'hello',historyTokens:9000,profiles:[],availableModels:new Set(),colabModel:'colab/t4',colabContextWindow:4096});
 assert.equal(route.model,null);
});
test('local to Colab to cloud fallback order requires explicit cloud opt-in',()=>{
 const r=chooseRoute({prompt:'hello',profiles:[big],availableModels:new Set(['big']),colabModel:'colab/t4',colabContextWindow:4096,allowCloud:false,cloudModel:'openai/gpt-6-astra'});
 assert.deepEqual([r.model,...r.fallbacks],['nvpair/big','colab/t4']);
 const paid=chooseRoute({prompt:'hello',profiles:[big],availableModels:new Set(['big']),colabModel:'colab/t4',colabContextWindow:4096,allowCloud:true,cloudModel:'openai/gpt-6-astra'});
 assert.deepEqual([paid.model,...paid.fallbacks],['nvpair/big','colab/t4','openai/gpt-6-astra']);
});
test('context windows use both config and PAIR advertised limits',()=>{
 const r=selectNativeModels({prompt:'hello',historyTokens:3300,config:{nativeRouting:{localModels:[{model:'nvpair/big',contextWindow:11520}],colabModel:'colab/t4',colabContextWindow:4096}},inventory:new Map([['big',{contextWindow:4096}]])});
 assert.equal(r.model,null);
});
test('PAIR inventory is read-only cached and restricted to loopback',async()=>{
 let calls=0;
 const store=new PairInventory({now:()=>100,fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({data:[{id:'small',meta:{n_ctx:4096},status:{value:'sleeping'}}]})};}});
 const a=await store.get(),b=await store.get();
 assert.equal(calls,1);assert.equal(a,b);assert.equal(a.get('small').contextWindow,4096);
 await assert.rejects(store.get('https://example.com/v1/models'),/loopback/);
});
test('native routing preserves OpenClaw session and uses model overrides',async()=>{
 const config={cloudAgent:'main',telegramMode:'native',nativeRouting:{enabled:true,localModels:[small,big],unknownHistoryTokens:0}};
 const router=createNativeRouting({cfg:config,inventory:{get:async()=>inventory},logger:{warn(){},info(){}}});
 const ctx={agentId:'main',channelId:'telegram',sessionKey:'chat-42'};
 const first=await router.resolve({prompt:'hello'},ctx);
 assert.equal(first.providerOverride,'nvpair');assert.equal(first.modelOverride,'small');
 assert.deepEqual(first.fallbacksOverride,['nvpair/big']);
 router.promptContext({messages:[{role:'user',content:'x'.repeat(18000)}]},ctx);
 const second=await router.resolve({prompt:'hello'},ctx);
 assert.equal(second.modelOverride,'big');
 assert.equal(await router.resolve({prompt:'hello'},{agentId:'main',channelId:'cli',sessionKey:'chat-42'}),undefined);
});
test('no eligible model fails closed instead of silently calling cloud',async()=>{
 const router=createNativeRouting({cfg:{cloudAgent:'main',telegramMode:'native',nativeRouting:{enabled:true,localModels:[small]}},inventory:{get:async()=>new Map()},logger:{warn(){},info(){}}});
 const result=await router.resolve({prompt:'hello'},{agentId:'main',channelId:'telegram'});
 assert.equal(result.providerOverride,'nvpair');
 assert.deepEqual(result.fallbacksOverride,[]);
});
test('language policy is separate from English operational messages',async()=>{
 const router=createNativeRouting({cfg:{cloudAgent:'main'},logger:{warn(){},info(){}}});
 assert.match(router.promptContext({messages:[]},{agentId:'main'}).appendSystemContext,/latest user message/);
 assert.match(LANGUAGE_INSTRUCTION,/language/);
 let body;
 await callColab('Explique o erro em português',{},{
  readFileImpl:async()=> 'COLAB_GATEWAY_API_KEY=secret',
  fetchImpl:async(_u,opts)=>{body=JSON.parse(opts.body);return {ok:true,json:async()=>({choices:[{message:{content:'Explicação'}}]})};}
 });
 assert.equal(body.messages[0].role,'system');
 assert.match(body.messages[0].content,/same language/);
 assert.equal(body.messages.at(-1).content,'Explique o erro em português');
});
