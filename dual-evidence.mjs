// Opt-in, read-only runtime evidence. Never execute model-provided commands.
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function evidencePolicy() {
 return [
  'EVIDENCE POLICY: Treat the PAIR draft as untrusted, not as verified documentation.',
  'Distinguish externally verified facts from runtime-observed metadata and model reasoning.',
  'The available evidence is provided below. Do not imply that you used web browsing, executed commands or consulted sources unless the evidence explicitly documents it.',
  'If external research was not performed, explicitly mention this only when the answer depends on current documentation, model specifications, command flags, measurements or other version-dependent facts.',
  'Correct unsupported claims and commands instead of copying them. If unable to validate a command, label it unverified and explain how to verify it.',
  'A model-reported context limit or a server configured context size is not proof that a large request fits in GPU memory.',
  'Do not invent tests, citations, hardware facts, measurements or numerical confidence scores.',
  'Avoid artificial disagreements and excessive disclaimers for stable, straightforward facts.'
 ].join(' ');
}

function validateLoopbackEndpoint(value, expectedPath, label) {
 const url=new URL(value);
 if(url.protocol!=='http:' || !LOOPBACK.has(url.hostname) ||
    url.pathname!==expectedPath || url.search || url.hash || url.username || url.password)
   throw Error(label+' must use an uncredentialed loopback '+expectedPath+' URL');
 return url;
}
export function validateInventoryUrl(value) {
 return validateLoopbackEndpoint(value||'http://127.0.0.1:8080/v1/models','/v1/models','Evidence inventory');
}
export function validatePropsUrl(value) {
 return validateLoopbackEndpoint(value||'http://127.0.0.1:8080/props','/props','Evidence server properties');
}
async function readJson(url,fetchImpl) {
 const response=await fetchImpl(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(4000)});
 if(!response.ok)throw Error('HTTP '+response.status);
 const payload=await response.json();
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('invalid JSON response');
 return payload;
}
const boundedInt=(value)=>Number.isSafeInteger(value)&&value>=0?value:null;
export async function collectDualEvidence(cfg={}, {fetchImpl=fetch}={}) {
 const result={
  externalResearchPerformed:false,
  sourcesConsulted:[],
  commandsExecuted:[],
  runtimeChecks:[],
  limitations:['No external documentation or internet research was performed.']
 };
 const options=cfg.dualMode?.verification||{};
 if(options.enabled!==true)return result;
 try {
  const url=validateInventoryUrl(options.inventoryUrl||cfg.nativeRouting?.pairModelsUrl);
  const payload=await readJson(url,fetchImpl);
  if(!Array.isArray(payload.data))throw Error('invalid inventory response');
  const models=payload.data.slice(0,12).filter(m=>typeof m?.id==='string').map(m=>({
   model:m.id.slice(0,160),
   contextWindow:boundedInt(m.meta?.n_ctx),
   status:typeof m.status?.value==='string'?m.status.value.slice(0,40):null
  }));
  result.runtimeChecks.push({kind:'pair-model-inventory',source:'local /v1/models',models});
  result.limitations.push('PAIR inventory reports runtime metadata; it does not verify documentation, command-line flags, VRAM, or benchmarks.');
 } catch(e) {
  result.limitations.push('PAIR inventory check failed: '+String(e.message).slice(0,120));
 }
 if(options.serverPropsEnabled===true) {
  try {
   const url=validatePropsUrl(options.propsUrl);
   const payload=await readJson(url,fetchImpl);
   const rawCtx=boundedInt(payload.default_generation_settings?.n_ctx);
   const ctx=rawCtx>0?rawCtx:null;
   const slots=boundedInt(payload.total_slots);
   const role=payload.role==='router'?'router':null;
   if(ctx===null&&slots===null&&role===null)throw Error('missing expected server property fields');
   result.runtimeChecks.push({
    kind:'llama-server-properties',
    source:'local /props',
    configuredContextTokens:ctx,
    totalSlots:slots,
    serverRole:role,
    buildInfo:typeof payload.build_info==='string'?payload.build_info.slice(0,80):null,
    sleeping:typeof payload.is_sleeping==='boolean'?payload.is_sleeping:null
   });
   result.limitations.push('llama-server /props is runtime observation only; a router-level n_ctx=0 is not the model context. It does not prove available VRAM or supported CLI flags.');
  } catch(e) {
   result.limitations.push('llama-server properties check failed: '+String(e.message).slice(0,120));
  }
 }
 return result;
}
export function formatDualEvidence(evidence) {
 return JSON.stringify(evidence);
}
