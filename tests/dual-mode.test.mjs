import test from 'node:test';
import assert from 'node:assert/strict';
import {splitDualPrompt,runDual,parseDual,createDualHandler,sendDualTelegram} from '../dual-mode.mjs';

const cfg={telegramMode:'native',allowedTelegramIds:['42'],dualMode:{enabled:true},nativeRouting:{localModels:[{model:'nvpair/mini',contextWindow:11520}]}};
const event={content:'!dual Explique o valor de GPUs',senderId:'42',messageId:'7',channel:'telegram'};
const ctx={channelId:'42',conversationId:'42',senderId:'42',messageId:'7'};
test('!dual command is opt-in, authorized, and never intercepts ordinary Telegram',()=>{
 assert.equal(parseDual(event,ctx,cfg).prompt,'Explique o valor de GPUs');
 assert.equal(parseDual({...event,content:'hello'},ctx,cfg),null);
 assert.equal(parseDual(event,ctx,{...cfg,dualMode:{enabled:false}}),null);
 assert.equal(parseDual(event,{...ctx,senderId:'99'},cfg),null);
 assert.equal(parseDual(event,{...ctx,channelId:'discord'},cfg),null);
 assert.equal(parseDual({...event,isGroup:true},ctx,cfg),null);
 assert.throws(()=>splitDualPrompt('x'.repeat(1101)),/1100/);
});
test('dual sends original question to PAIR, then PAIR analysis to Colab for synthesis',async()=>{
 const steps=[];
 const result=await runDual('O que é GPU?',cfg,{callPair:async(text)=>{steps.push(['pair',text]);return 'Resposta local';},callColab:async(text)=>{steps.push(['colab',text]);return {output:'Síntese no Colab'};}});
 assert.deepEqual(steps.map(x=>x[0]),['pair','colab']);
 assert.equal(steps[1][1][1].content,'Resposta local');
 assert.equal(steps[1][1].at(-1).content,'O que é GPU?');
 assert.match(result.combined,/Resposta local/);
 assert.match(result.combined,/Síntese no Colab/);
});
test('authorized dual command sends status and combined result and claims turn',async()=>{
 const sent=[];
 const api={logger:{info(){},warn(){},error(){}}};
 const handler=createDualHandler(api,cfg,{send:async(_target,message)=>sent.push(message),run:async()=>({combined:'PAIR: A; Colab: B'})});
 assert.deepEqual(await handler(event,ctx),{handled:true});
 assert.equal(sent.length,2);
 assert.match(sent[1],/PAIR: A/);
 assert.equal(await handler({...event,content:'hello'},ctx),undefined);
});
test('PAIR failure reports it explicitly rather than fabricating combined answer',async()=>{
 const sent=[];
 const api={logger:{info(){},warn(){},error(){}}};
 const handler=createDualHandler(api,cfg,{send:async(_target,message)=>sent.push(message),run:async()=>{throw Error('PAIR HTTP 503');}});
 assert.deepEqual(await handler(event,ctx),{handled:true});
 assert.match(sent.at(-1),/PAIR HTTP 503/);
});
test('staging sender can only send with isolated gateway profile',async()=>{
 await assert.rejects(sendDualTelegram('42','hello','fake.json',{readFile:async()=>JSON.stringify({gateway:{port:18789},channels:{telegram:{botToken:'test-abcdefghijklmnopqrstuvwxyz'}}})}),/routerstage/);
 const sent=[];
 await sendDualTelegram('42','hello','fake.json',{readFile:async()=>JSON.stringify({gateway:{port:19451},channels:{telegram:{botToken:'test-abcdefghijklmnopqrstuvwxyz'}}}),fetchImpl:async(url,options)=>{sent.push([url,JSON.parse(options.body)]);return {ok:true};}});
 assert.equal(sent[0][1].chat_id,'42');
});

test('dual sends PAIR answer before waiting for Colab, then Colab review as separate turn',async()=>{
 const sent=[];let reviewStarted=false;
 const api={logger:{info(){},warn(){},error(){}}};
 const handler=createDualHandler(api,cfg,{send:async(_target,message)=>sent.push(message),run:async(text,config,{onPair})=>{
   await onPair('O PAIR analisou');
   assert.equal(sent.length,2);
   reviewStarted=true;
   return {pair:'O PAIR analisou',colab:'O Colab revisou',combined:'both'};
 }});
 assert.deepEqual(await handler(event,ctx),{handled:true});
 assert.equal(reviewStarted,true);
 assert.equal(sent.length,3);
 assert.match(sent[1],/O PAIR analisou/);
 assert.match(sent[2],/O Colab revisou/);
 assert.doesNotMatch(sent[2],/both/);
});
test('dual retains PAIR answer when Colab times out',async()=>{
 const sent=[];
 const api={logger:{info(){},warn(){},error(){}}};
 const handler=createDualHandler(api,cfg,{send:async(_target,message)=>sent.push(message),run:async(text,config,{onPair})=>{
   await onPair('PAIR completed');
   throw Error('Colab timed out');
 }});
 assert.deepEqual(await handler(event,ctx),{handled:true});
 assert.equal(sent.length,3);
 assert.match(sent[1],/PAIR completed/);
 assert.match(sent[2],/incomplete/);
 assert.match(sent[2],/Colab timed out/);
});

test('background dual acknowledges Telegram before long Colab review completes',async()=>{
 const sent=[];let release;
 const pending=new Promise(resolve=>{release=resolve;});
 let started;
 const active=new Promise(resolve=>{started=resolve;});
 const api={logger:{info(){},warn(){},error(){}}};
 const handler=createDualHandler(api,{...cfg,dualMode:{enabled:true,background:true}},
  {send:async(_target,msg)=>sent.push(msg),run:async(_q,_cfg,{onPair})=>{
    await onPair('PAIR available now');
    started();
    await pending;
    return {colab:'Colab reviewed',combined:'combined'};
  }});
 const handled=await handler(event,ctx);
 assert.deepEqual(handled,{handled:true});
 await active;
 assert.match(sent[1],/PAIR available now/);
 assert.equal(sent.length,2);
 release();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(sent.length,3);
 assert.match(sent[2],/Colab reviewed/);
});
