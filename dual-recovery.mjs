// Explicit retry for transient Colab gateway responses. Staging dual only.
// Never switches to a paid provider and never retries permanent errors.
export function isTransientColabError(error){
 const message=String(error?.message||'');
 return /\bColab gateway HTTP (?:502|503|504)\b/.test(message);
}
export async function callColabWithRecovery(messages,cfg={},call, {sleep=(ms)=>new Promise(r=>setTimeout(r,ms)),onRetry=()=>{}}={}){
 const enabled=cfg.dualMode?.resilience?.enabled===true;
 const maxRetries=enabled?Math.min(2,Math.max(0,cfg.dualMode.resilience.maxRetries??1)):0;
 for(let attempt=0; ;attempt++){
  try{return await call(messages,cfg);}
  catch(error){
   if(attempt>=maxRetries||!isTransientColabError(error))throw error;
   const delayMs=1500*(attempt+1);
   onRetry({attempt:attempt+1,delayMs,status:'transient-unavailable'});
   await sleep(delayMs);
  }
 }
}
