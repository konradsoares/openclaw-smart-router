// Constrained official-document lookups for experimental dual review.
// Not general web search: user/model cannot provide URLs or domains.
const DOCS=Object.freeze([
 {id:'qwen3-4b-2507',url:'https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507/raw/main/README.md',match:/qwen3|qwen|context|128k|256k/i,keys:[/context length.{0,90}/ig,/262,144.{0,100}/ig,/256K.{0,90}/ig]},
 {id:'llama-server',url:'https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/server/README.md',match:/llama\.?cpp|llama-server|ctx.size|n_ctx|batch.size/i,keys:[/--ctx-size.{0,115}/ig,/--batch-size.{0,100}/ig,/llama-server.{0,110}/ig]}
]);
export function eligibleResearchDocs(question, draft='') {
 const input=String(question).slice(0,1100)+' '+String(draft).slice(0,1700);
 return DOCS.filter(d=>d.match.test(input));
}
function safeExtract(raw, patterns){
 const lines=raw.split(/\r?\n/);
 const selected=[];
 for (const line of lines){
  if(selected.length>=8)break;
  if(line.length>600)continue;
  if(patterns.some(pattern=>{pattern.lastIndex=0;return pattern.test(line)})){
   const safe=line.replace(/[\x00-\x1f]/g,' ').trim().slice(0,260);
   if(safe && !selected.includes(safe))selected.push(safe);
  }
 }
 return selected;
}
export async function researchOfficialDocs(question,draft,cfg={}, {fetchImpl=fetch}={}){
 const info={enabled:false,externalResearchPerformed:false,sourcesConsulted:[],limitations:[]};
 if(cfg.dualMode?.research?.enabled!==true)return info;
 info.enabled=true;
 const docs=eligibleResearchDocs(question,draft).slice(0,2);
 if(!docs.length){info.limitations.push('No eligible official documentation for this topic.');return info;}
 for(const item of docs){
  try {
   const response=await fetchImpl(item.url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(7000),headers:{Accept:'text/plain'}});
   if(!response.ok)throw Error('HTTP '+response.status);
   const type=response.headers?.get?.('content-type')||'';
   if(type && !/text\/plain|text\/markdown|application\/octet-stream/i.test(type))throw Error('unexpected content type');
   const length=Number(response.headers?.get?.('content-length')||0);
   if(length>300000)throw Error('document too large');
   const raw=await response.text();
   if(raw.length>300000)throw Error('document too large');
   const excerpts=safeExtract(raw,item.keys);
   if(!excerpts.length)throw Error('no relevant excerpt found');
   info.sourcesConsulted.push({id:item.id,url:item.url,retrieved:true,excerpts});
   info.externalResearchPerformed=true;
  } catch(error){
   info.limitations.push(item.id+' retrieval failed: '+String(error.message).slice(0,90));
  }
 }
 return info;
}
