import test from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../dispatch-policy.mjs';
import { parseTelegram, sendTelegram } from '../telegram.mjs';
import { createHandler, DEFAULTS } from '../index.js';
test('short question routes local', () => assert.equal(classify('What is Dublin?', {}).agent, 'pair'));
test('tool intent routes main', () => assert.equal(classify('Search the web for updates', {}).agent, 'main'));
test('forced cloud', () => assert.equal(classify('Hello', {}, 'cloud').agent, 'main'));
test('Telegram event parses channelId and sender', () => {
 const msg = parseTelegram({channel:'telegram',content:'!route hello',senderId:'42',messageId:'9'}, {channelId:'telegram',conversationId:'42'}, {telegramPrefix:'!route'});
 assert.equal(msg.prompt,'hello'); assert.equal(msg.target,'42');
});
test('non-Telegram ignored', () => assert.equal(parseTelegram({channel:'discord',content:'!route hello'}, {}, {telegramPrefix:'!route'}), null));
test('send uses argument vector, no shell', async () => {
 const calls=[]; await sendTelegram('42','Hello', async (cmd,args) => {calls.push({cmd,args}); return {ok:true};});
 assert.equal(calls[0].cmd,'openclaw'); assert.deepEqual(calls[0].args.slice(0,4),['message','send','--channel','telegram']);
});
test('hook only dispatches allowed sender and claims turn', async () => {
 const logs=[]; const api={logger:{info:x=>logs.push(x),warn:x=>logs.push(x),error:x=>logs.push(x)}};
 const sends=[]; const fn=createHandler(api,{...DEFAULTS,telegramMode:'prefix',allowedTelegramIds:['42']},{dispatch:async()=>({ok:true,output:'Dublin',finalAgent:'pair'}),sendTelegram:async(...args)=>sends.push(args)});
 const result=await fn({channel:'telegram',content:'!route hello',senderId:'42',messageId:'9'}, {channelId:'telegram',conversationId:'42'});
 assert.deepEqual(result,{handled:true}); assert.deepEqual(sends,[['42','Dublin']]);
});
test('unknown sender not claimed', async () => {
 const api={logger:{info(){},warn(){},error(){}}};
 const fn=createHandler(api,{...DEFAULTS,telegramMode:'prefix',allowedTelegramIds:['42']},{dispatch:async()=>{throw Error('unexpected')},sendTelegram:async()=>{throw Error('unexpected')}});
 assert.equal(await fn({channel:'telegram',content:'!route hello',senderId:'100',messageId:'2'}, {channelId:'telegram',conversationId:'100'}),undefined);
});
