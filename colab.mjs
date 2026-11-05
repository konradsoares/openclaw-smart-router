import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';

export function parseEnvValue(content, key) {
  const line = content.split(/\r?\n/).find(x => x.trim().startsWith(`${key}=`));
  if (!line) return '';
  let value = line.trim().slice(key.length + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  return value;
}
export async function getColabRuntimeStatus(cfg={}, {fetchImpl=fetch,readFileImpl=readFile}={}) {
  const url=new URL(cfg.colabGatewayUrl || 'http://127.0.0.1:18080/v1/chat/completions');
  if(url.protocol!=='http:' || !['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.pathname!=='/v1/chat/completions') throw Error('Colab gateway must use the local loopback endpoint');
  url.pathname='/v1/runtime-status';
  const envPath=cfg.colabEnvFile || join(homedir(),'.config/openclaw-colab/gateway.env');
  const apiKey=parseEnvValue(await readFileImpl(envPath,'utf8'),'COLAB_GATEWAY_API_KEY');
  if(!apiKey)throw Error('Missing COLAB_GATEWAY_API_KEY in gateway.env');
  const response=await fetchImpl(url,{method:'GET',headers:{Authorization:'Bearer '+apiKey},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('Runtime status HTTP '+response.status);
  const data=await response.json();
  if(!['existing','starting','missing','absent'].includes(data?.status))throw Error('Invalid runtime status');
  if(data.runtime!==null && data.runtime!==undefined && !/^runtimes\/[a-z0-9][a-z0-9-]{0,62}$/.test(data.runtime))throw Error('Invalid runtime id');
  return {status:data.status,runtime:data.runtime||null};
}
export async function callColab(prompt, cfg = {}, {fetchImpl=fetch, readFileImpl=readFile}={}) {
  const url = new URL(cfg.colabGatewayUrl || 'http://127.0.0.1:18080/v1/chat/completions');
  if (url.protocol !== 'http:' || !['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.pathname !== '/v1/chat/completions') throw Error('Colab gateway must use the local loopback endpoint');
  const envPath = cfg.colabEnvFile || join(homedir(), '.config/openclaw-colab/gateway.env');
  const apiKey = parseEnvValue(await readFileImpl(envPath, 'utf8'), 'COLAB_GATEWAY_API_KEY');
  if (!apiKey) throw Error('Missing COLAB_GATEWAY_API_KEY in gateway.env');
  const messages=Array.isArray(prompt)?prompt:[{role:'user',content:prompt}];
  if(!messages.length || messages.length>32 || messages.some(m=>!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>12000))
    throw Error('Invalid Colab conversation messages');
  // System instructions are request-scoped, not retained as Telegram user turns.
  const framedMessages = cfg.replyInUserLanguage === false ? messages : [
    {role:'system',content:'Reply in the same language as the most recent user message, unless the user explicitly requests another language. Do not switch languages based on system notifications, quoted text, or earlier messages. Keep technical commands and identifiers unchanged.'},
    ...messages
  ];
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {'Authorization': `Bearer ${apiKey}`, 'Content-Type':'application/json'},
    body: JSON.stringify({model: 'colab-t4', stream: false, messages:framedMessages}),
    signal: AbortSignal.timeout((cfg.colabTimeoutSeconds || 300) * 1000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(`Colab gateway HTTP ${response.status}: ${String(data.error?.message || 'request failed').slice(0,150)}`);
  const output = data.choices?.[0]?.message?.content;
  if (typeof output !== 'string' || !output.trim()) throw Error('Colab gateway returned no text');
  return {ok:true,output:output.trim(),finalAgent:'colab'};
}
