// Fixed official-source registry. Never accept destinations from a user or LLM.
// Each entry is a vetted public documentation resource, not a general web search.
export const OFFICIAL_SOURCES=Object.freeze([
 Object.freeze({id:'qwen3-4b-2507',url:'https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507/raw/main/README.md',topic:/\bqwen3[-\s]?4b(?:[-\s]?instruct[-\s]?2507)?\b/i,keys:[/context length.{0,90}/i,/262,144.{0,100}/i,/256K.{0,90}/i]}),
 Object.freeze({id:'llama-server',url:'https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/server/README.md',topic:/\b(?:llama[.-]?(?:cpp|server)|ctx.size|n_ctx|gguf)\b/i,keys:[/--ctx-size.{0,115}/i,/--batch-size.{0,100}/i,/llama-server.{0,110}/i]}),
 Object.freeze({id:'node-fs',url:'https://raw.githubusercontent.com/nodejs/node/main/doc/api/fs.md',topic:/\b(?:node:fs|fs\.promises|nodejs\s+filesystem|node\.js\s+file\s+system)\b/i,keys:[/node:fs\/promises.{0,120}/i,/fs\.promises.{0,100}/i,/asynchronous.{0,100}/i]}),
 Object.freeze({id:'python-asyncio',url:'https://raw.githubusercontent.com/python/cpython/main/Doc/library/asyncio.rst',topic:/\b(?:python\s+asyncio|asyncio\.run|asyncio\s+event\s+loop)\b/i,keys:[/asyncio\.run.{0,120}/i,/event\s+loop.{0,120}/i,/coroutine.{0,120}/i]})
]);
export function selectOfficialSources(question='',draft='',limit=2){
 // The user's question establishes relevance. PAIR cannot introduce its own
 // external destinations or trigger unrelated source selection.
 const query=String(question).slice(0,1100);
 return OFFICIAL_SOURCES.filter(s=>s.topic.test(query)).slice(0,Math.max(0,Math.min(2,limit)));
}
