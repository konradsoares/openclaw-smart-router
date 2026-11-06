import {PairInventory,estimateTokens,selectNativeModels} from './routing-policy.mjs';

export const LANGUAGE_INSTRUCTION='Answer in the language of the latest user message unless the user explicitly requests a different language. Keep code, commands, API names, and identifiers unchanged. Operational status messages are handled separately in English.';

export function createNativeRouting({cfg={},inventory=new PairInventory(),logger=console}={}){
 const history=new Map();
 function capture(event,ctx){
   if(!ctx?.sessionKey||!Array.isArray(event?.messages))return;
   let sum=0;
   for(const msg of event.messages){
     if(typeof msg?.content==='string')sum+=estimateTokens(msg.content);
     else if(Array.isArray(msg?.content))for(const item of msg.content)if(typeof item?.text==='string')sum+=estimateTokens(item.text);
   }
   history.delete(ctx.sessionKey);
   history.set(ctx.sessionKey,Math.min(sum,250000));
   if(history.size>256)history.delete(history.keys().next().value);
 }
 async function resolve(event,ctx){
   const routes=cfg.nativeRouting||{};
   if(cfg.telegramMode!=='native'||routes.enabled!==true||ctx?.agentId!==(cfg.cloudAgent||'main')||!(ctx?.channelId==='telegram'||(String(ctx?.channelId??'').length>0 && (cfg.allowedTelegramIds||[]).map(String).includes(String(ctx?.channelId)))))return undefined;
   let available;
   try {available=await inventory.get(routes.pairModelsUrl||'http://127.0.0.1:8080/v1/models');}
   catch(err){logger.warn('[smart-router] PAIR inventory unavailable: '+String(err.message).slice(0,120));available=new Map();}
   const decision=selectNativeModels({
     prompt:event?.prompt||'',historyTokens:history.get(ctx?.sessionKey)??routes.unknownHistoryTokens??1024,
     config:cfg,inventory:available
   });
   let model=decision.model;
   if(!model){
     // Fail closed: never leave the default paid model selected by accident.
     const first=routes.localModels?.[0]?.model;
     model=first&&first.startsWith('nvpair/')?first:'nvpair/__no_eligible_model__';
     logger.warn('[smart-router] no eligible model; forcing local-only failure');
   }
   const slash=model.indexOf('/');
   logger.info('[smart-router] native-model-route model='+model+' reason='+decision.reason+' estimatedTokens='+decision.required);
   return {providerOverride:model.slice(0,slash),modelOverride:model.slice(slash+1),fallbacksOverride:decision.fallbacks};
 }
 function promptContext(event,ctx){
   capture(event,ctx);
   if(ctx?.agentId!==(cfg.cloudAgent||'main')&&ctx?.agentId!==(cfg.localAgent||'pair'))return undefined;
   return {appendSystemContext:LANGUAGE_INSTRUCTION};
 }
 return {resolve,promptContext};
}
