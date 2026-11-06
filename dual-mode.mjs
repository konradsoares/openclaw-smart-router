import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {callColab} from './colab.mjs';

export function splitDualPrompt(input) {
 const text=String(input||'').trim();
 if(!text || text.length>1100)throw Error('Use !dual followed by 1-1100 characters');
 return text;
}

async function callPair(text,cfg,{fetchImpl=fetch}={}) {
 const url=new URL(cfg.dualMode?.pairUrl||'http://127.0.0.1:8080/v1/chat/completions');
 if(url.protocol!=='http:' || !['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.pathname!=='/v1/chat/completions')throw Error('PAIR endpoint must be loopback');
 const model=(cfg.nativeRouting?.localModels?.[0]?.model||'').replace(/^nvpair\//,'');
 if(!model)throw Error('Missing local model');
 const response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(45000),
 body:JSON.stringify({model,stream:false,max_tokens:700,messages:[
  {role:'system',content:'You are the local PAIR analyst. Reply in the language requested by the user. Limit your preliminary response to at most 180 words and finish all sections with complete sentences. Consider trade-offs and exceptions rather than claiming any backend is always superior. Do not claim to have tested hardware, verified metrics, or checked external sources.'},
  {role:'user',content:text}
 ]})});
 if(!response.ok)throw Error('PAIR HTTP '+response.status);
 const data=await response.json();
 const content=data?.choices?.[0]?.message?.content;
 if(typeof content!=='string'||!content.trim())throw Error('PAIR returned empty answer');
 return content.trim();
}

export async function runDual(text,cfg={},deps={}) {
 const question=splitDualPrompt(text);
 const pairCall=deps.callPair||callPair;
 const colabCall=deps.callColab||callColab;
 const local=await pairCall(question,cfg);
 if(deps.onPair)await deps.onPair(local);
 const colabMessages=[
  {role:'user',content:'You are the Colab reviewer. The following assistant message is a *draft* from PAIR, not a verified source. Review it independently for errors, excessive generalizations and missing trade-offs before answering the original question. Explicitly correct important inaccuracies, and offer a practical recommendation with conditions rather than blindly agreeing. Consider hardware/energy cost of local inference, Colab availability and runtime expiry, cloud privacy implications, context/model capability, and cold-start latency when relevant. Do not invent benchmarks or suggest either backend is universally better. Write a COMPLETE answer in the original user-requested language, at most 230 words.'},
  {role:'assistant',content:local.slice(0,1700)},
  {role:'user',content:question}
 ];
 const colab=await colabCall(colabMessages,{...cfg,replyInUserLanguage:true});
 const colabText=typeof colab==='string'?colab:colab?.output;
 if(!colabText?.trim())throw Error('Colab returned empty answer');
 return {pair:local,colab:colabText,combined:'PAIR (local):\n'+local+'\n\nColab T4 (review and synthesis):\n'+colabText};
}

export function parseDual(event,ctx,cfg) {
 if(cfg.telegramMode!=='native'||cfg.dualMode?.enabled!==true||event?.isGroup===true)return null;
 const body=String(event?.content??event?.body??'').trim();
 const match=/^!dual(?:\s+([\s\S]*))?$/i.exec(body);
 if(!match)return null;
 const channel=String(ctx?.channelId??'');
 const sender=String(ctx?.senderId??event?.senderId??'').replace(/^telegram:/i,'');
 const target=String(ctx?.conversationId??sender).replace(/^telegram:/i,'');
 const allowed=(cfg.allowedTelegramIds||[]).map(String);
 if(!/^\d+$/.test(target)||!allowed.includes(target)||!allowed.includes(sender))return null;
 if(channel!=='telegram'&&channel!==target)return null;
 return {target,prompt:match[1]||'',messageId:String(ctx?.messageId??event?.messageId??'')};
}

export async function sendDualTelegram(target,message,configPath=join(homedir(),'.openclaw-routerstage/openclaw.json'),deps={}) {
 if(!/^\d+$/.test(String(target)))throw Error('Invalid Telegram target');
 const config=JSON.parse(await (deps.readFile||readFile)(configPath,'utf8'));
 if(config?.gateway?.port!==19451)throw Error('Only routerstage may send dual mode messages');
 const token=config?.channels?.telegram?.botToken;
 if(typeof token!=='string'||token.length<15)throw Error('Missing staging Telegram bot token');
 const fetchImpl=deps.fetchImpl||fetch;
 const parts=String(message).match(/[\s\S]{1,3700}/g)||[];
 for(const chunk of parts){
  const resp=await fetchImpl('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:target,text:chunk}),signal:AbortSignal.timeout(20000)});
  if(!resp.ok)throw Error('Staging Telegram send HTTP '+resp.status);
 }
}

export function createDualHandler(api,cfg,deps={}) {
 const inflight=new Set();
 return async(event,ctx)=>{
  const data=parseDual(event,ctx,cfg);
  if(!data)return;
  const key=data.target+':'+data.messageId;
  if(inflight.has(key))return {handled:true};
  inflight.add(key);
  const send=deps.send||sendDualTelegram;
  const execute=async()=>{
   try {
    if(!data.prompt.trim()){
     await send(data.target,'Usage: !dual <question>');
    }else{
     await send(data.target,'Running PAIR analysis followed by Colab review (staging only).');
     try {
      let pairWasDelivered=false;
      const onPair=async(local)=>{
       await send(data.target,'PAIR (local) — preliminary analysis:\n'+local);
       pairWasDelivered=true;
      };
      const result=await (deps.run||runDual)(data.prompt,cfg,{onPair});
      if(!pairWasDelivered)await send(data.target,result.combined);
      else await send(data.target,'Colab T4 (review and synthesis):\n'+result.colab);
      api.logger.info('[smart-router] dual-mode completed pair+colab, chat authorized');
     }catch(err){
      api.logger.warn('[smart-router] dual-mode incomplete: '+String(err.message).slice(0,160));
      await send(data.target,'Dual-mode incomplete (no combined answer): '+String(err.message).slice(0,140));
     }
    }
   }catch(err){
    api.logger.error('[smart-router] dual-mode delivery failed: '+String(err.message).slice(0,160));
   }finally{inflight.delete(key);}
  };
  if(cfg.dualMode?.background===true){
   // Do not keep the Telegram before_dispatch admission occupied during GPU provisioning.
   // Work is in-memory only: gateway restart can interrupt a pending job.
   void execute();
   return {handled:true};
  }
  await execute();
  return {handled:true};
 };
}
