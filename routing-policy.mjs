// Only actual tool/action requests require tool-capable models; remembering text does not.

// Estimates are deliberately conservative, not exact tokenizer counts.
export function estimateTokens(text='') {
  const value=String(text);
  if(!value)return 0;
  const bytes=Buffer.byteLength(value,'utf8');
  const ascii=(value.match(/[\x00-\x7f]/g)||[]).length;
  const other=[...value].length-ascii;
  return Math.ceil(ascii/3+other*1.5+Math.max(0,bytes-ascii-other*3)/4);
}

export function requiredTokens({prompt='',historyTokens=0,systemTokens=1600,toolTokens=0,outputTokens=1024,safetyFraction=0.15}={}) {
  const input=estimateTokens(prompt)+Math.max(0,Math.ceil(historyTokens))+Math.max(0,systemTokens)+Math.max(0,toolTokens);
  return Math.ceil(input*(1+Math.max(0,safetyFraction)))+Math.max(1,outputTokens);
}

export function chooseRoute({prompt='',historyTokens=0,profiles=[],availableModels=null,
    systemTokens=1600,toolTokens=0,safetyFraction=0.15,allowCloud=false,cloudModel='',colabModel='',colabContextWindow=4096,colabMaxOutputTokens=1024,supportsTools=false}={}) {
  const toolIntent=supportsTools && /\b(?:search (?:the )?web|browse (?:the )?web|run (?:a )?command|execute (?:a )?command|read (?:a )?file|write (?:a )?file|deploy|install|send (?:an )?email|open (?:a )?url)\b/i.test(String(prompt));
  const actualToolTokens=toolIntent?Math.max(2000,toolTokens):0;
  const usable=profiles.filter(p=>{
    if(!p||typeof p.model!=='string'||!p.model.startsWith('nvpair/'))return false;
    if(availableModels && !availableModels.has(p.model.slice(7)))return false;
    if(toolIntent && p.supportsTools!==true)return false;
    const out=p.maxOutputTokens||1024;
    return Number.isInteger(p.contextWindow)&&p.contextWindow>0 &&
      requiredTokens({prompt,historyTokens,systemTokens,toolTokens:actualToolTokens,outputTokens:out,safetyFraction})<=p.contextWindow;
  }).sort((a,b)=>a.contextWindow-b.contextWindow || a.model.localeCompare(b.model));
  const local=usable.map(p=>p.model);
  const candidates=[...local];
  if(colabModel && requiredTokens({prompt,historyTokens,systemTokens,toolTokens:actualToolTokens,outputTokens:colabMaxOutputTokens,safetyFraction})<=colabContextWindow)candidates.push(colabModel);
  if(allowCloud && cloudModel)candidates.push(cloudModel);
  const unique=[...new Set(candidates)];
  if(!unique.length)return {model:null,fallbacks:[],reason:'no-eligible-model',required:requiredTokens({prompt,historyTokens,systemTokens,toolTokens:actualToolTokens,safetyFraction})};
  return {model:unique[0],fallbacks:unique.slice(1),reason:local.length?'local-fits':unique[0]===colabModel?'colab-fallback':'cloud-opted-in',required:requiredTokens({prompt,historyTokens,systemTokens,toolTokens:actualToolTokens,safetyFraction})};
}

export class PairInventory {
  constructor({fetchImpl=fetch,now=Date.now,ttlMs=15000}={}){
    this.fetchImpl=fetchImpl;this.now=now;this.ttlMs=ttlMs;this.cache=null;this.until=0;
  }
  async get(url='http://127.0.0.1:8080/v1/models'){
    const address=new URL(url);
    if(address.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(address.hostname)||address.pathname!=='/v1/models')
      throw Error('PAIR inventory must use a loopback /v1/models endpoint');
    if(this.cache && this.now()<this.until)return this.cache;
    const response=await this.fetchImpl(address,{signal:AbortSignal.timeout(4000)});
    if(!response.ok)throw Error('PAIR inventory HTTP '+response.status);
    const data=await response.json();
    if(!Array.isArray(data.data))throw Error('PAIR inventory missing models');
    const inventory=new Map();
    for(const m of data.data){
      if(typeof m.id!=='string'||!m.id)continue;
      inventory.set(m.id,{
        contextWindow:Number.isInteger(m.meta?.n_ctx)&&m.meta.n_ctx>0?m.meta.n_ctx:null,
        status:m.status?.value||null
      });
    }
    this.cache=inventory;this.until=this.now()+this.ttlMs;
    return inventory;
  }
}

export function selectNativeModels({prompt,historyTokens=0,config={},inventory=new Map()}={}){
  const routes=config.nativeRouting||{};
  const availableModels=new Set(inventory.keys());
  const profiles=(routes.localModels||[]).map(p=>{
    const advertised=inventory.get(p.model?.slice(7));
    const advertisedContext=advertised?.contextWindow;
    // Both OpenClaw effective window and PAIR context are hard caps.
    const window=Math.min(p.contextWindow||Number.MAX_SAFE_INTEGER,advertisedContext||p.contextWindow||0);
    return {...p,contextWindow:window};
  });
  return chooseRoute({
    prompt,historyTokens,profiles,availableModels,
    systemTokens:routes.systemTokens??1600,
    toolTokens:routes.toolTokens??2000,
    safetyFraction:routes.safetyFraction??0.15,
    colabModel:routes.colabModel||'',
    colabContextWindow:routes.colabContextWindow||4096,
    colabMaxOutputTokens:routes.colabMaxOutputTokens||1024,
    allowCloud:config.allowCloudFallback===true&&routes.allowPaidCloud===true,
    cloudModel:routes.cloudModel||'',
    supportsTools:true
  });
}
