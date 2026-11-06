import test from 'node:test';
import assert from 'node:assert/strict';
import {sendDualTelegram} from '../dual-mode.mjs';
const token='test-abcdefghijklmnopqrstuvwxyz';
const base={gateway:{port:18789},channels:{telegram:{botToken:token}},plugins:{entries:{'smart-router':{config:{dualMode:{productionEnabled:true}}}}}};
test('production delivery remains blocked without explicit dual permission',async()=>{
 const readFile=async()=>JSON.stringify(base);
 await assert.rejects(sendDualTelegram('42','test','fixture',{readFile}),/explicitly enabled/);
 await assert.rejects(sendDualTelegram('42','test','fixture',{readFile,allowProduction:false}),/explicitly enabled/);
});
test('production config must independently opt in, even when runtime allows',async()=>{
 const readFile=async()=>JSON.stringify({...base,plugins:{entries:{'smart-router':{config:{dualMode:{productionEnabled:false}}}}}});
 await assert.rejects(sendDualTelegram('42','test','fixture',{readFile,allowProduction:true}),/explicitly enabled/);
});
test('explicit production opt-in uses production bot and numeric authorized target',async()=>{
 const out=[];
 const readFile=async()=>JSON.stringify(base);
 await sendDualTelegram('42','synthetic release smoke','fixture',{readFile,allowProduction:true,fetchImpl:async(_url,opts)=>{out.push(JSON.parse(opts.body));return {ok:true};}});
 assert.equal(out.length,1);
 assert.equal(out[0].chat_id,'42');
 await assert.rejects(sendDualTelegram('not-numeric','hello','fixture',{readFile,allowProduction:true}),/Invalid Telegram target/);
});
test('unknown gateway port never eligible for dual delivery',async()=>{
 await assert.rejects(sendDualTelegram('42','test','fixture',{readFile:async()=>JSON.stringify({...base,gateway:{port:7777}}),allowProduction:true}),/explicitly enabled/);
});
