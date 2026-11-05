import test from 'node:test';
import assert from 'node:assert/strict';
import {ColabHistory} from '../colab-history.mjs';
import {callColab} from '../colab.mjs';
import {createHandler,DEFAULTS} from '../index.js';

const ok=output=>({ok:true,output,finalAgent:'colab'});
test('second Colab call includes previous user and assistant messages',async()=>{
 const memory=new ColabHistory();
 const invocations=[];
 const runner=async messages=>{invocations.push(messages.map(m=>({...m})));return ok(messages.length===1?'ENTENDIDO':'CACTUS-7392');};
 await memory.run('chat42','Lembre-se: CACTUS-7392',runner);
 const answer=await memory.run('chat42','Qual codigo?',runner);
 assert.equal(answer.output,'CACTUS-7392');
 assert.deepEqual(invocations[1],[
  {role:'user',content:'Lembre-se: CACTUS-7392'},
  {role:'assistant',content:'ENTENDIDO'},
  {role:'user',content:'Qual codigo?'}
 ]);
});
test('different chats have independent Colab history',async()=>{
 const history=new ColabHistory();
 await history.run('chat42','private',async()=>ok('ack'));
 const contents=[];
 await history.run('chat43','hello',async m=>{contents.push(m);return ok('new');});
 assert.deepEqual(contents[0],[{role:'user',content:'hello'}]);
});
test('failed Colab calls are never saved to memory',async()=>{
 const history=new ColabHistory();
 await assert.rejects(history.run('a','secret',async()=>{throw Error('offline')}),/offline/);
 await history.run('a','hello',async m=>{assert.deepEqual(m,[{role:'user',content:'hello'}]);return ok('done');});
});
test('bounded history retains complete message pairs',async()=>{
 const history=new ColabHistory({maxTurns:2,maxChars:12000});
 for(let i=0;i<4;i++)await history.run('a','turn-'+i,async()=>ok('answer'));
 assert.deepEqual(history.history.get('a').map(m=>m.content),['turn-2','answer','turn-3','answer']);
});
test('same chat concurrent requests are serialized in order',async()=>{
 const history=new ColabHistory();
 let unlock;
 const first=new Promise(resolve=>unlock=resolve);
 const calls=[];
 const a=history.run('a','first',async messages=>{calls.push(messages.length);await first;return ok('one');});
 const b=history.run('a','second',async messages=>{calls.push(messages.length);return ok('two');});
 await Promise.resolve();
 unlock();
 await Promise.all([a,b]);
 assert.deepEqual(calls,[1,3]);
});
test('Colab OpenAI gateway receives full conversation messages',async()=>{
 const messages=[{role:'user',content:'Lembre-se'},{role:'assistant',content:'ENTENDIDO'},{role:'user',content:'O que foi?'}];
 let payload;
 const result=await callColab(messages,{},{
  readFileImpl:async()=> 'COLAB_GATEWAY_API_KEY=secret',
  fetchImpl:async(_url,opts)=>{payload=JSON.parse(opts.body);return {ok:true,json:async()=>({choices:[{message:{content:'Lembre-se'}}]})};}
 });
 assert.equal(result.ok,true);
 assert.deepEqual(payload.messages,messages);
});
test('Telegram handler retains recent Colab turns across messages',async()=>{
 const sent=[],captured=[];
 const api={logger:{warn(){},error(){},info(){}}};
 const handler=createHandler(api,{...DEFAULTS,telegramMode:'prefix',colabProgress:false,allowedTelegramIds:['42']},{
  getColabRuntimeStatus:async()=>({status:'absent',runtime:null}),
  callColab:async m=>{captured.push(m);return ok(captured.length===1?'ENTENDIDO':'CACTUS-7392');},
  dispatch:async()=>{throw Error('unexpected')},
  sendTelegram:async(_chat,txt)=>sent.push(txt)
 });
 await handler({channel:'telegram',content:'!route !colab Lembre-se: CACTUS-7392',senderId:'42',messageId:'1'},{channelId:'telegram',conversationId:'42'});
 await handler({channel:'telegram',content:'!route !colab Qual codigo?',senderId:'42',messageId:'2'},{channelId:'telegram',conversationId:'42'});
 assert.deepEqual(captured[1],[
  {role:'user',content:'Lembre-se: CACTUS-7392'},
  {role:'assistant',content:'ENTENDIDO'},
  {role:'user',content:'Qual codigo?'}
 ]);
 assert.equal(sent.at(-1),'[Colab T4] CACTUS-7392');
});
