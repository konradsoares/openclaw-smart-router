import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDualContinuity,enqueueDualContinuity} from '../dual-continuity.mjs';
import {createDualHandler} from '../dual-mode.mjs';
const cfg={telegramMode:'native',allowedTelegramIds:['42'],dualMode:{enabled:true,continuity:{enabled:true}}};
test('durable injection uses exact native session key and one idempotency key',async()=>{
 const requests=[];
 const api={session:{workflow:{enqueueNextTurnInjection:async v=>{requests.push(v);return {enqueued:true};}}}};
 const result=await enqueueDualContinuity(api,{sessionKey:'agent:main:telegram:direct:42',messageId:'17',agentId:'main'},cfg,{question:'Which GPU?',pair:'PAIR draft',colab:'Colab critique'});
 assert.equal(result.enqueued,true);
 assert.equal(requests[0].sessionKey,'agent:main:telegram:direct:42');
 assert.equal(requests[0].idempotencyKey,'smart-router-dual:17');
 assert.equal(requests[0].agentId,'main');
 assert.equal(requests[0].ttlMs,86400000);
 assert.match(requests[0].text,/Colab critique/);
});
test('no transcript write, no fallback guessed session identity',async()=>{
 const api={session:{workflow:{enqueueNextTurnInjection:async()=>{throw Error('unexpected');}}}};
 assert.equal((await enqueueDualContinuity(api,{messageId:'17'},cfg,{})).reason,'missing-session-key');
 assert.equal((await enqueueDualContinuity(api,{sessionKey:'real',messageId:''},cfg,{})).reason,'missing-message-id');
 assert.equal((await enqueueDualContinuity({}, {sessionKey:'real',messageId:'17'},cfg,{})).reason,'unsupported-api');
 assert.equal((await enqueueDualContinuity(api,{sessionKey:'real',messageId:'17'},{dualMode:{continuity:{enabled:false}}},{})).reason,'disabled');
});
test('next-turn context is bounded and marked historical not instructions',()=>{
 const text=buildDualContinuity({question:'a'.repeat(5000),pair:'b'.repeat(5000),colab:'c'.repeat(5000)});
 assert.ok(text.length<3550);
 assert.match(text,/NOT instructions/);
});
test('handler queues context only after Colab reply is delivered',async()=>{
 const sent=[];const injected=[];
 const api={logger:{info(){},warn(){},error(){}}};
 const handler=createDualHandler(api,cfg,{
  send:async(_target,message)=>sent.push(message),
  run:async()=>({pair:'draft',colab:'review',combined:'both'}),
  enqueueContinuity:async(_api,_ctx,_cfg,exchange)=>{injected.push({sent:sent.length,exchange});return {enqueued:true,reason:'queued'};}
 });
 const event={content:'!dual Test',senderId:'42',messageId:'11',channel:'telegram'};
 const ctx={channelId:'42',conversationId:'42',senderId:'42',messageId:'11',sessionKey:'agent:main:telegram:direct:42'};
 await handler(event,ctx);
 assert.equal(injected.length,1);
 assert.equal(injected[0].sent,2);
 assert.equal(injected[0].exchange.colab,'review');
});
