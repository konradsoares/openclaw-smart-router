import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseRoute,selectNativeModels,PairInventory,estimateTokens,requiredTokens} from './routing-policy.mjs';
import {createNativeRouting,LANGUAGE_INSTRUCTION} from './native-routing.mjs';
import {ColabHistory} from './colab-history.mjs';
import {createHandler,DEFAULTS} from './index.js';
import {callColab,getColabRuntimeStatus} from './colab.mjs';
import {dispatch} from './dispatch.mjs';

const PAIR='nvpair/unsloth/Qwen3-4B-Instruct-2507-GGUF:Q4_K_M';
const COLAB='colab/colab-t4';
const CLOUD='openai/gpt-6-astra';
const base={telegramMode:'native',cloudAgent:'main',allowCloudFallback:false,nativeRouting:{
 enabled:true,localModels:[{model:PAIR,contextWindow:11520,maxOutputTokens:2048,supportsTools:false}],
 colabModel:COLAB,colabContextWindow:16384,colabMaxOutputTokens:1024,
 cloudModel:CLOUD,allowPaidCloud:false,systemTokens:6000,unknownHistoryTokens:0,safetyFraction:0.15
}};
const inv=new Map([[PAIR.slice(7),{contextWindow:11520}]]);
function choose(prompt,{config=base,inventory=inv,historyTokens=0}={}){
 return selectNativeModels({prompt,historyTokens,config,inventory});
}
const fakeLog=()=>({info(){},warn(){},error(){}});
const result=out=>({ok:true,output:out,finalAgent:'colab'});

test('01 PAIR offline: automatic provider selection goes to Colab (mocked 16K); no paid API',async()=>{
 const selection=choose('Explain this service status',{inventory:new Map()});
 assert.equal(selection.model,COLAB);
 assert.deepEqual(selection.fallbacks,[]);
 let warnings=0;
 const router=createNativeRouting({cfg:base,inventory:{get:async()=>{throw Error('ECONNREFUSED')}},logger:{info(){},warn(){warnings++}}});
 const routed=await router.resolve({prompt:'Explain this service status'},{agentId:'main',channelId:'telegram',sessionKey:'chat-11'});
 assert.equal(routed.providerOverride,'colab');
 assert.equal(routed.modelOverride,'colab-t4');
 assert.deepEqual(routed.fallbacksOverride,[]);
 assert.equal(warnings,1);
});
test('02 Colab offline: paid API never called unless explicitly enabled (simulated selection)',()=>{
 const noPaid=choose('Please summarize',{config:{...base,nativeRouting:{...base.nativeRouting,colabContextWindow:4096}},inventory:new Map()});
 assert.equal(noPaid.model,null);assert.deepEqual(noPaid.fallbacks,[]);
 const onlyOneConsent=choose('Please summarize',{config:{...base,allowCloudFallback:true,nativeRouting:{...base.nativeRouting,colabContextWindow:4096}},inventory:new Map()});
 assert.equal(onlyOneConsent.model,null);
 const otherConsent=choose('Please summarize',{config:{...base,nativeRouting:{...base.nativeRouting,allowPaidCloud:true,colabContextWindow:4096}},inventory:new Map()});
 assert.equal(otherConsent.model,null);
 const bothConsent=choose('Please summarize',{config:{...base,allowCloudFallback:true,nativeRouting:{...base.nativeRouting,allowPaidCloud:true,colabContextWindow:4096}},inventory:new Map()});
 assert.equal(bothConsent.model,CLOUD);
});
test('03 Token budgets 2K,4K,8K,12K history: eligibility never exceeds effective context',()=>{
 const expected=[PAIR,COLAB,null,null];
 for(const [i,h] of [2000,4000,8000,12000].entries()){
   const decision=choose('Analyse logs',{historyTokens:h});
   assert.equal(decision.model,expected[i],JSON.stringify({h,decision}));
 }
 const overflow=choose('Analyse logs',{historyTokens:20000});
 assert.equal(overflow.model,null);
 const realColab=choose('Analyse logs',{inventory:new Map(),config:{...base,nativeRouting:{...base.nativeRouting,colabContextWindow:4096}}});
 assert.equal(realColab.model,null);
 // More realistic diagnostic floor: short prompt plus >=6K runtime preface.
 assert.ok(requiredTokens({prompt:'hello',systemTokens:6000,outputTokens:1024,safetyFraction:.15})>4096);
});
test('04 Telegram native hook: no prefix interception, one session route per turn; prefix remains opt-in',async()=>{
 const realDispatch=[];const telegramSends=[];
 const nativeHandler=createHandler({logger:fakeLog()},{...DEFAULTS,telegramMode:'native',allowedTelegramIds:['42']},{
   dispatch:async(...args)=>{realDispatch.push(args);return {ok:true,output:'x',finalAgent:'pair'}},
   sendTelegram:async(...args)=>telegramSends.push(args)
 });
 assert.equal(await nativeHandler({channel:'telegram',content:'Hello',senderId:'42',messageId:'22'},{channelId:'telegram',conversationId:'42'}),undefined);
 assert.equal(telegramSends.length,0);
 const router=createNativeRouting({cfg:base,inventory:{get:async()=>inv},logger:fakeLog()});
 const ctx={agentId:'main',channelId:'telegram',sessionKey:'agent:main:telegram:42'};
 const a=await router.resolve({prompt:'Hello'},ctx);
 const b=await router.resolve({prompt:'How are you?'},ctx);
 assert.equal(a.providerOverride,b.providerOverride);
 assert.equal(a.modelOverride,b.modelOverride);
 assert.equal(await router.resolve({prompt:'Hello'},{agentId:'main',channelId:'cli',sessionKey:ctx.sessionKey}),undefined);
});
test('05 Concurrency and isolation: same chat serialized, separate chats isolated',async()=>{
 const h=new ColabHistory();let unlock;
 const wait=new Promise(resolve=>unlock=resolve);
 const observed=[];
 const first=h.run('chat1','first',async messages=>{observed.push(['first',messages.length]);await wait;return result('ACK')});
 const second=h.run('chat1','second',async messages=>{observed.push(['second',messages.length]);return result('DONE')});
 const separate=h.run('chat2','private',async messages=>{observed.push(['other',messages.length]);return result('OTHER')});
 await Promise.resolve();unlock();
 await Promise.all([first,second,separate]);
 assert.deepEqual(observed.filter(x=>x[0]!=='other'),[['first',1],['second',3]]);
 assert.equal(observed.find(x=>x[0]==='other')[1],1);
 const seen=[];
 const runner=async(_cmd,args)=>{seen.push(args[args.indexOf('--session-id')+1]);return {ok:true,stdout:'ok'}};
 await dispatch('hello',{},'local',runner,{sessionKey:'telegram:42'});
 await dispatch('hello',{},'local',runner,{sessionKey:'telegram:43'});
 assert.notEqual(seen[0],seen[1]);
});
test('06 Languages: all routine Telegram notices English, direct Colab follows latest user language',async()=>{
 const sends=[];const states=[{status:'absent',runtime:null},{status:'existing',runtime:'runtimes/r-123456789'},{status:'existing',runtime:'runtimes/r-123456789'},{status:'existing',runtime:'runtimes/r-123456789'}];
 const api={logger:fakeLog()};
 const handler=createHandler(api,{...DEFAULTS,telegramMode:'prefix',colabProgress:true,allowedTelegramIds:['42']},{
   getColabRuntimeStatus:async()=>states.shift(),
   callColab:async()=>result('SIM'),
   dispatch:async()=>{throw Error('local not expected')},
   sendTelegram:async(_,text)=>{sends.push(text)}
 });
 await handler({channel:'telegram',content:'!route !colab Oi',senderId:'42',messageId:'1'},{channelId:'telegram',conversationId:'42'});
 await handler({channel:'telegram',content:'!route !colab Hello',senderId:'42',messageId:'2'},{channelId:'telegram',conversationId:'42'});
 assert.ok(sends.some(x=>x.includes('Starting a new runtime')));
 assert.ok(sends.some(x=>x.includes('reused runtime')));
 assert.ok(!sends.some(x=>/não há|tempo|novo runtime|reutilizado|indisponível|preparando/.test(x)));
 let outbound;
 await callColab([{role:'user',content:'Responda em português'},{role:'assistant',content:'Sim'},{role:'user',content:'Reply in English'}],{},{
   readFileImpl:async()=> 'COLAB_GATEWAY_API_KEY=secret',
   fetchImpl:async(_u,opts)=>{outbound=JSON.parse(opts.body);return {ok:true,json:async()=>({choices:[{message:{content:'OK'}}]})}}
 });
 assert.equal(outbound.messages[0].role,'system');
 assert.match(outbound.messages[0].content,/most recent user message/);
 assert.equal(outbound.messages.at(-1).content,'Reply in English');
 assert.match(LANGUAGE_INSTRUCTION,/language of the latest user message/);
});
test('07 Rollback guards: native disabled by default, cloud not enabled, and fallback to old prefix path',async()=>{
 const disabled=createNativeRouting({cfg:{...base,telegramMode:'prefix'},inventory:{get:async()=>inv},logger:fakeLog()});
 assert.equal(await disabled.resolve({prompt:'hi'},{agentId:'main',channelId:'telegram'}),undefined);
 const disabled2=createNativeRouting({cfg:{...base,nativeRouting:{...base.nativeRouting,enabled:false}},inventory:{get:async()=>inv},logger:fakeLog()});
 assert.equal(await disabled2.resolve({prompt:'hi'},{agentId:'main',channelId:'telegram'}),undefined);
 const msgs=[];
 const handler=createHandler({logger:fakeLog()},{...DEFAULTS,telegramMode:'prefix',colabProgress:false,allowedTelegramIds:['42']},{
   dispatch:async()=>({ok:true,output:'PAIR ROLLBACK OK',finalAgent:'pair'}),
   sendTelegram:async(_,txt)=>msgs.push(txt)
 });
 await handler({channel:'telegram',content:'!route !pair health',senderId:'42',messageId:'11'},{channelId:'telegram',conversationId:'42'});
 assert.deepEqual(msgs,['PAIR ROLLBACK OK']);
});
test('08 Observability: provider, reason and token estimate logged; PAIR inventory cached without inference',async()=>{
 const logs=[],warns=[];
 let calls=0;
 const cache=new PairInventory({fetchImpl:async(url,opts)=>{calls++;assert.equal(url.pathname,'/v1/models');return {ok:true,json:async()=>({data:[{id:PAIR.slice(7),meta:{n_ctx:11520},status:{value:'sleeping'}}]})}},now:()=>100});
 const a=await cache.get(),b=await cache.get();
 assert.equal(calls,1);assert.equal(a,b);
 const router=createNativeRouting({cfg:base,inventory:{get:async()=>a},logger:{info:x=>logs.push(x),warn:x=>warns.push(x)}});
 const output=await router.resolve({prompt:'status'},{agentId:'main',channelId:'telegram',sessionKey:'id1'});
 assert.equal(output.providerOverride,'nvpair');
 assert.ok(logs.some(x=>/native-model-route model=nvpair\//.test(x)&&/reason=local-fits/.test(x)&&/estimatedTokens=/.test(x)));
 assert.equal(warns.length,0);
});
