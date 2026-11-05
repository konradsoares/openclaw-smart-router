// Per-conversation history for direct Colab requests. No cross-chat history sharing.
// This is deliberately process-local: a gateway restart clears ephemeral context.
export class ColabHistory {
  constructor({maxTurns=8,maxChars=12000}={}){
    this.maxTurns=maxTurns;
    this.maxChars=maxChars;
    this.history=new Map();
    this.pending=new Map();
  }
  async run(key,prompt,invoke){
    if(typeof key!=='string'||!key)throw Error('Conversation key required');
    const previous=this.pending.get(key)||Promise.resolve();
    const work=previous.catch(()=>{}).then(async()=>{
      const turns=this.history.get(key)||[];
      const messages=[...turns,{role:'user',content:prompt}];
      const answer=await invoke(messages);
      // Do not record failed calls, empty answers, or fallback responses.
      if(answer?.ok && answer.finalAgent==='colab' && typeof answer.output==='string' && answer.output.trim()){
        const next=[...messages,{role:'assistant',content:answer.output}];
        while(next.length>this.maxTurns*2)next.splice(0,2);
        while(next.length>2 && next.reduce((n,m)=>n+m.content.length,0)>this.maxChars)next.splice(0,2);
        this.history.set(key,next);
      }
      return answer;
    });
    const settled=work.then(()=>{},()=>{});
    this.pending.set(key,settled);
    try{return await work;}
    finally{if(this.pending.get(key)===settled)this.pending.delete(key);}
  }
}
