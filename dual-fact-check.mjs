// Deterministic, source-bound facts and narrow contradiction checks.
// This does not interpret arbitrary webpages or certify model-generated claims.
const QWEN_URL='https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507/raw/main/README.md';
const LLAMA_URL='https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/server/README.md';

export function extractDocumentFacts(research={}){
 const facts=[];
 const sources=Array.isArray(research.sourcesConsulted)?research.sourcesConsulted:[];
 for(const source of sources){
  if(source?.retrieved!==true||!Array.isArray(source.excerpts))continue;
  if(source.id==='qwen3-4b-2507'&&source.url===QWEN_URL){
   const line=source.excerpts.find(s=>typeof s==='string'&&/Context Length\s*:\s*\*{0,2}262,144\s+natively/i.test(s));
   if(line)facts.push({id:'qwen3-4b-2507-native-context',model:'Qwen3-4B-Instruct-2507',nativeContextTokens:262144,source:QWEN_URL,evidence:line.slice(0,260)});
  }
  if(source.id==='llama-server'&&source.url===LLAMA_URL){
   const line=source.excerpts.find(s=>typeof s==='string'&&/--ctx-size(?:\s|\b)/.test(s));
   if(line)facts.push({id:'llama-server-ctx-flag',documentedOption:'--ctx-size',source:LLAMA_URL,evidence:line.slice(0,260)});
  }
 }
 return facts;
}

export function assessDualAnswer(text,facts=[]){
 const answer=String(text||'');
 const findings=[];
 const native=facts.find(f=>f.id==='qwen3-4b-2507-native-context'&&f.nativeContextTokens===262144);
 const mentionsModel=/Qwen3[-\s]?4B(?:[-\s]?Instruct[-\s]?2507)?/i.test(answer);
 // Only detect an explicit *maximum/native* claim, not a practical 128K target.
 const lowerClaim=/(?:contexto\s+nativo|limite\s+(?:nativo|m[aá]ximo)|suporta\s+(?:nativamente\s+)?(?:at[eé]\s+)?|native\s+context|maximum\s+context|context\s+length)[^.!?\n]{0,95}?(?:128\s*[kK]|131[.,]?072|32\s*[kK]|32[.,]?768)/i;
 if(native&&mentionsModel&&lowerClaim.test(answer)){
  findings.push({id:'native-context-conflict',severity:'contradiction',message:'A resposta atribui ao Qwen3-4B-Instruct-2507 um limite nativo que contradiz a documentação recuperada: 262.144 tokens (256K). Isso não garante executar 128K em determinado hardware.',source:native.source});
 }
 const cli=facts.find(f=>f.id==='llama-server-ctx-flag');
 if(cli&&/(?:par[aâ]metro|flag|op[cç][aã]o|option|parameter)[^.!?\n]{0,65}--n_ctx/i.test(answer)&&!/(?:--n_ctx[^.!?\n]{0,65}(?:inv[aá]lid[oa]|incorret[oa]|n[aã]o\s+(?:[eé]\s+)?(?:documentad[oa]|suportad[oa])|invalid|wrong|not\s+documented)|(?:inv[aá]lid[oa]|incorret[oa]|invalid|wrong)[^.!?\n]{0,40}--n_ctx)/i.test(answer)){
  findings.push({id:'llama-flag-suspect',severity:'needs-review',message:'A resposta apresenta --n_ctx como opção de CLI; a documentação recuperada identifica --ctx-size. Verifique o comando antes de executar.',source:cli.source});
 }
 // Numeric minimum RAM declarations lack universal support from the fetched docs.
 const ramClaim=/(?:pelo\s+menos|no\s+m[ií]nimo|minimum|at\s+least|exige|requires|requer)[^.!?\n]{0,65}\b(?:16|24)\s*GB\s*(?:de\s+)?(?:RAM|VRAM)|\b(?:16|24)\s*GB\s*(?:de\s+)?(?:RAM|VRAM)[^.!?\n]{0,60}(?:m[ií]nim|necess[aá]ri|required|minimum)/i;
 if(ramClaim.test(answer)){
  findings.push({id:'ram-minimum-unverified',severity:'unsupported',message:'A resposta declara um mínimo de 16/24 GB de RAM/VRAM. Nenhuma das fontes estruturadas comprova um limite universal; seriam necessários cálculo de KV cache, configuração e testes do hardware.',source:null});
 }
 return findings;
}

export function formatFactCheck(findings=[]){
 if(!findings.length)return '';
 return '\n\nSmart Router — checagem de evidências (independente do Colab):\n'+findings.map(f=>'- '+f.message+(f.source?' Fonte: '+f.source:'')).join('\n');
}
