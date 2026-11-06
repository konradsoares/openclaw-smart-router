// Read-only, opt-in evidence collection. Never execute LLM-supplied commands.
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function evidencePolicy() {
 return [
  'EVIDENCE POLICY: Treat the PAIR draft as untrusted, not as verified documentation.',
  'Distinguish externally verified facts from runtime-observed metadata and model reasoning.',
  'The available evidence is provided below. Do not imply that you used web browsing, executed commands or consulted sources unless the evidence explicitly documents it.',
  'If external research was not performed, explicitly mention this only when the answer depends on current documentation, model specifications, command flags, measurements or other version-dependent facts.',
  'Correct unsupported claims and commands instead of copying them. If unable to validate a command, label it unverified and explain how to verify it.',
  'Do not invent tests, citations, hardware facts, measurements or numerical confidence scores.',
  'Avoid artificial disagreements and excessive disclaimers for stable, straightforward facts.'
 ].join(' ');
}

export function validateInventoryUrl(value) {
 const url = new URL(value || 'http://127.0.0.1:8080/v1/models');
 if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname) ||
     url.pathname !== '/v1/models' || url.search || url.hash || url.username || url.password)
   throw Error('Evidence inventory must use an uncredentialed loopback /v1/models URL');
 return url;
}

export async function collectDualEvidence(cfg={}, {fetchImpl=fetch}={}) {
 const result={
  externalResearchPerformed:false,
  sourcesConsulted:[],
  commandsExecuted:[],
  runtimeChecks:[],
  limitations:['No external documentation or internet research was performed.']
 };
 if(cfg.dualMode?.verification?.enabled !== true) return result;
 try {
  const url=validateInventoryUrl(cfg.dualMode.verification.inventoryUrl ||
      cfg.nativeRouting?.pairModelsUrl);
  const response=await fetchImpl(url,{method:'GET',signal:AbortSignal.timeout(4000)});
  if(!response.ok)throw Error('inventory HTTP '+response.status);
  const payload=await response.json();
  if(!Array.isArray(payload?.data))throw Error('invalid inventory response');
  const models=payload.data.slice(0,12).filter(m=>typeof m?.id==='string').map(m=>({
   model:m.id.slice(0,160),
   contextWindow:Number.isInteger(m.meta?.n_ctx)?m.meta.n_ctx:null,
   status:typeof m.status?.value==='string'?m.status.value.slice(0,40):null
  }));
  result.runtimeChecks.push({kind:'pair-model-inventory',source:'local /v1/models',models});
  result.limitations.push('PAIR inventory reports runtime metadata; it does not verify documentation, command-line flags, VRAM, or benchmarks.');
 } catch(e) {
  result.limitations.push('PAIR inventory check failed: '+String(e.message).slice(0,120));
 }
 return result;
}

export function formatDualEvidence(evidence) {
 return JSON.stringify(evidence);
}
