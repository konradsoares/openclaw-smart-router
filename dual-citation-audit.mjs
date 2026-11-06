// General source-attribution audit. This does not judge technical correctness.
// It detects links presented as citations without successful router retrieval.
function normalized(url){
 try{
  const u=new URL(url.replace(/[),.;]+$/g,''));
  if(u.protocol!=='https:')return null;
  u.hash='';
  return u.href.replace(/\/$/,'');
 }catch{return null;}
}
export function auditReviewCitations(answer,research={}){
 const retrieved=new Set(
  (Array.isArray(research.sourcesConsulted)?research.sourcesConsulted:[])
   .filter(s=>s?.retrieved===true&&typeof s.url==='string')
   .map(s=>normalized(s.url)).filter(Boolean)
 );
 const findings=[];
 const seen=new Set();
 const lines=String(answer).split(/\r?\n/).slice(0,120);
 for(const line of lines){
  // Only source-attribution lines and Markdown links labelled as references.
  const attributed=/(?:\b(?:source|sources|reference|references|documentation|docs|fonte|fontes|refer[eê]ncia|documenta[cç][aã]o)\s*:|\[(?:source|fonte|documentation|docs|refer[eê]ncia)(?:\s*\d+)?\]\()/i.test(line);
  if(!attributed)continue;
  for(const match of line.matchAll(/https:\/\/[^\s<>\])]+/g)){
   const url=normalized(match[0]);
   if(!url||retrieved.has(url)||seen.has(url))continue;
   seen.add(url);
   findings.push({
    id:'citation-not-retrieved',severity:'unverified',
    message:'A resposta apresenta uma URL como referência, mas o Smart Router não recuperou esse documento nesta execução. A fonte não pode ser apresentada como verificada: '+url,
    source:null
   });
   if(findings.length>=3)return findings;
  }
 }
 return findings;
}
