import test from 'node:test';
import assert from 'node:assert/strict';
import {callColab,parseEnvValue,getColabRuntimeStatus} from '../colab.mjs';
import {createHandler,DEFAULTS} from '../index.js';

test('reads configured key',()=>assert.equal(parseEnvValue('X=1\nCOLAB_GATEWAY_API_KEY="abc"\n','COLAB_GATEWAY_API_KEY'),'abc'));
test('sends authenticated OpenAI chat request',async()=>{
 let called;const result=await callColab('hello',{}, {readFileImpl:async()=> 'COLAB_GATEWAY_API_KEY=secret',fetchImpl:async(url,opts)=>{called={url:String(url),opts};return {ok:true,json:async()=>({choices:[{message:{content:'hello back'}}]})}}});
 assert.equal(result.output,'hello back');assert.equal(called.opts.headers.Authorization,'Bearer secret');assert.equal(JSON.parse(called.opts.body).messages[0].role,'system');assert.deepEqual(JSON.parse(called.opts.body).messages.slice(1),[{role:'user',content:'hello'}]);
});
test('rejects remote gateway addresses',async()=>await assert.rejects(callColab('x',{colabGatewayUrl:'https://evil.example/v1/chat/completions'}),/local loopback/));
test('explicit colab command delivers answer',async()=>{
 const sends=[];const api={logger:{warn(){},error(){},info(){}}};
 const handler=createHandler(api,{...DEFAULTS,telegramMode:'prefix',allowedTelegramIds:['42']},{getColabRuntimeStatus:async()=>{throw Error('status unavailable in isolated test')},callColab:async()=>({ok:true,output:'T4 response',finalAgent:'colab'}),dispatch:async()=>{throw Error('unexpected')},sendTelegram:async(...args)=>sends.push(args)});
 await handler({channel:'telegram',content:'!route !colab hello',senderId:'42',messageId:'1'},{channelId:'telegram',conversationId:'42'});
 assert.match(sends[0][1],/Colab selected/);assert.equal(sends.at(-1)[1],'[Colab T4] T4 response');
});
test('colab failure falls back to pair only',async()=>{
 const calls=[], sends=[];const api={logger:{warn(){},error(){},info(){}}};
 const handler=createHandler(api,{...DEFAULTS,telegramMode:'prefix',allowedTelegramIds:['42']},{getColabRuntimeStatus:async()=>{throw Error('status unavailable in isolated test')},callColab:async()=>{throw Error('offline')},dispatch:async(p,c,f)=>{calls.push(f);return {ok:true,output:'PAIR response',finalAgent:'pair'}},sendTelegram:async(...args)=>sends.push(args)});
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

test('runtime status uses authenticated GET without a GPU inference',async()=>{
 const seen=[];
 const status=await getColabRuntimeStatus({},{
  readFileImpl:async()=> 'COLAB_GATEWAY_API_KEY=secret',
  fetchImpl:async(url,opts)=>{seen.push({url:String(url),opts});return {ok:true,json:async()=>({status:'existing',runtime:'runtimes/r-test123'})};}
 });
 assert.deepEqual(status,{status:'existing',runtime:'runtimes/r-test123'});
 assert.equal(seen[0].opts.method,'GET');
 assert.equal(seen[0].opts.headers.Authorization,'Bearer secret');
 assert.ok(seen[0].url.endsWith('/v1/runtime-status'));
 await assert.rejects(getColabRuntimeStatus({colabGatewayUrl:'https://example.com/v1/chat/completions'}),/local loopback/);
});
test('reports reused Colab runtime through Telegram',async()=>{
 const sends=[],states=[{status:'existing',runtime:'runtimes/r-test123'},{status:'existing',runtime:'runtimes/r-test123'}];
 const api={logger:{warn(){},error(){},info(){}}};
 const handler=createHandler(api,{...DEFAULTS,telegramMode:'prefix',allowedTelegramIds:['42']},{
  getColabRuntimeStatus:async()=>states.shift(),callColab:async()=>({ok:true,output:'done',finalAgent:'colab'}),
  dispatch:async()=>{throw Error('unexpected')},sendTelegram:async(_target,text)=>sends.push(text)
 });
 await handler({channel:'telegram',content:'!route !colab hello',senderId:'42',messageId:'r1'},{channelId:'telegram',conversationId:'42'});
 assert.match(sends[0],/existing GPU/);
 assert.ok(sends.some(x=>x.includes('reused runtime')));
 assert.equal(sends.at(-1),'[Colab T4] done');
});
test('reports new runtime after missing previous GPU',async()=>{
 const sends=[],states=[{status:'missing',runtime:'runtimes/r-old'},{status:'existing',runtime:'runtimes/r-new'}];
 const api={logger:{warn(){},error(){},info(){}}};
 const handler=createHandler(api,{...DEFAULTS,telegramMode:'prefix',allowedTelegramIds:['42']},{
  getColabRuntimeStatus:async()=>states.shift(),callColab:async()=>({ok:true,output:'ok',finalAgent:'colab'}),
  dispatch:async()=>{throw Error('unexpected')},sendTelegram:async(_target,text)=>sends.push(text)
 });
 await handler({channel:'telegram',content:'!route !colab hello',senderId:'42',messageId:'r2'},{channelId:'telegram',conversationId:'42'});
 assert.match(sends[0],/new runtime/);
 assert.ok(sends.some(x=>x.includes('new runtime ready')));
 assert.equal(sends.at(-1),'[Colab T4] ok');
});
