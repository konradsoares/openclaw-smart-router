import test from 'node:test';
import assert from 'node:assert/strict';
import {callColab,parseEnvValue} from '../colab.mjs';
import {createHandler,DEFAULTS} from '../index.js';

test('reads configured key',()=>assert.equal(parseEnvValue('X=1\nCOLAB_GATEWAY_API_KEY="abc"\n','COLAB_GATEWAY_API_KEY'),'abc'));
test('sends authenticated OpenAI chat request',async()=>{
 let called;const result=await callColab('hello',{}, {readFileImpl:async()=> 'COLAB_GATEWAY_API_KEY=secret',fetchImpl:async(url,opts)=>{called={url:String(url),opts};return {ok:true,json:async()=>({choices:[{message:{content:'hello back'}}]})}}});
 assert.equal(result.output,'hello back');assert.equal(called.opts.headers.Authorization,'Bearer secret');assert.deepEqual(JSON.parse(called.opts.body).messages,[{role:'user',content:'hello'}]);
});
test('rejects remote gateway addresses',async()=>await assert.rejects(callColab('x',{colabGatewayUrl:'https://evil.example/v1/chat/completions'}),/local loopback/));
test('explicit colab command delivers answer',async()=>{
 const sends=[];const api={logger:{warn(){},error(){},info(){}}};
 const handler=createHandler(api,{...DEFAULTS,telegramMode:'prefix',allowedTelegramIds:['42']},{callColab:async()=>({ok:true,output:'T4 response',finalAgent:'colab'}),dispatch:async()=>{throw Error('unexpected')},sendTelegram:async(...args)=>sends.push(args)});
 await handler({channel:'telegram',content:'!route !colab hello',senderId:'42',messageId:'1'},{channelId:'telegram',conversationId:'42'});
 assert.match(sends[0][1],/Colab selected/);assert.equal(sends.at(-1)[1],'[Colab T4] T4 response');
});
test('colab failure falls back to pair only',async()=>{
 const calls=[], sends=[];const api={logger:{warn(){},error(){},info(){}}};
 const handler=createHandler(api,{...DEFAULTS,telegramMode:'prefix',allowedTelegramIds:['42']},{callColab:async()=>{throw Error('offline')},dispatch:async(p,c,f)=>{calls.push(f);return {ok:true,output:'PAIR response',finalAgent:'pair'}},sendTelegram:async(...args)=>sends.push(args)});
 await handler({channel:'telegram',content:'!route !colab hello',senderId:'42',messageId:'2'},{channelId:'telegram',conversationId:'42'});
 assert.deepEqual(calls,['local']);assert.match(sends[0][1],/Colab selected/);assert.match(sends.at(-1)[1],/Local \/ pair/);assert.deepEqual(calls,['local']);
});

test('status messages can be disabled, independent of Colab installation',async()=>{
 const sends=[];const api={logger:{warn(){},error(){},info(){}}};
 const handler=createHandler(api,{...DEFAULTS,telegramMode:'prefix',allowedTelegramIds:['42'],colabProgress:false,colabFallback:'none'}, {callColab:async()=>{throw Error('ENOENT: no gateway.env')}, dispatch:async()=>{throw Error('must not use paid cloud')},sendTelegram:async(...x)=>sends.push(x)});
 await handler({channel:'telegram',content:'!route !colab hello',senderId:'42',messageId:'20'},{channelId:'telegram',conversationId:'42'});
 assert.equal(sends.length,1);assert.match(sends[0][1],/failed|ENOENT/);
});
test('normal local routing does not require Colab installed',async()=>{
 const sends=[];const api={logger:{warn(){},error(){},info(){}}};
 const handler=createHandler(api,{...DEFAULTS,telegramMode:'prefix',allowedTelegramIds:['42']},{dispatch:async()=>({ok:true,output:'pair reply',finalAgent:'pair'}),callColab:async()=>{throw Error('should not call Colab')},sendTelegram:async(...x)=>sends.push(x)});
 await handler({channel:'telegram',content:'!route Hello',senderId:'42',messageId:'21'},{channelId:'telegram',conversationId:'42'});
 assert.deepEqual(sends,[['42','pair reply']]);
});
