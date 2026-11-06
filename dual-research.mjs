import {selectOfficialSources} from './dual-source-catalog.mjs';
// Only a fixed catalog of official HTTPS documentation can be consulted.
// User prompts and model output never become request URLs.
export function eligibleResearchDocs(question, draft=''){
 return selectOfficialSources(question,draft);
}
function safeExtract(raw,patterns){
 const chosen=[];
 for(const line of raw.split(/\r?\n/)){
  if(chosen.length>=8)break;
  if(line.length>600)continue;
  if(patterns.some(pattern=>pattern.test(line))){
   const item=line.replace(/[\x00-\x1f]/g,' ').trim().slice(0,260);
   if(item&&!chosen.includes(item))chosen.push(item);
  }
 }
 return chosen;
}
export async function researchOfficialDocs(question,draft,cfg={}, {fetchImpl=fetch}={}){
 const info={enabled:false,externalResearchPerformed:false,sourcesConsulted:[],limitations:[]};
 if(cfg.dualMode?.research?.enabled!==true)return info;
 info.enabled=true;
 const sources=eligibleResearchDocs(question,draft);
 if(!sources.length){info.limitations.push('No eligible official documentation for this topic.');return info;}
 for(const source of sources){
  try{
   const response=await fetchImpl(source.url,{
    method:'GET',redirect:'error',signal:AbortSignal.timeout(7000),
    headers:{Accept:'text/plain'}
   });
   if(!response.ok)throw Error('HTTP '+response.status);
   const type=response.headers?.get?.('content-type')||'';
   if(type&&!/text\/plain|text\/markdown|application\/octet-stream/i.test(type))throw Error('unexpected content type');
   const len=Number(response.headers?.get?.('content-length')||0);
   if(len>400000)throw Error('document too large');
   // Bound actual streamed response bytes, not only declared Content-Length.
   const body=await response.text();
   if(body.length>400000)throw Error('document too large');
   const excerpts=safeExtract(body,source.keys);
   if(!excerpts.length)throw Error('no relevant excerpt found');
   info.sourcesConsulted.push({id:source.id,url:source.url,retrieved:true,excerpts});
   info.externalResearchPerformed=true;
  }catch(error){
   info.limitations.push(source.id+' retrieval failed: '+String(error.message).slice(0,90));
  }
 }
 return info;
}
