// Live local PAIR + mocked Colab 503->200 recovery smoke.
// Does not contact a real Colab GPU, Telegram, paid API or production Gateway.
import http from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {runDual} from '../dual-mode.mjs';
const dir=await mkdtemp(join(tmpdir(),'dual-503-smoke-'));
const env=join(dir,'gateway.env');
await writeFile(env,'COLAB_GATEWAY_API_KEY=local-test-key\n',{mode:0o600});
let calls=0;
const server=http.createServer(async(req,res)=>{
 if(req.method!=='POST'||req.url!=='/v1/chat/completions'){res.writeHead(404).end();return;}
 for await (const _ of req){}
 calls++;
 res.setHeader('content-type','application/json');
 if(calls===1){res.writeHead(503).end(JSON.stringify({error:{message:'simulated temporary Colab unavailable'}}));return;}
 res.writeHead(200).end(JSON.stringify({choices:[{message:{content:'Simulated Colab review successfully recovered.'}}]}));
});
try{
 server.listen(0,'127.0.0.1');
 await once(server,'listening');
 const port=server.address().port;
 const inventory=await fetch('http://127.0.0.1:8080/v1/models',{signal:AbortSignal.timeout(6000)}).then(r=>r.json());
 const model=inventory?.data?.[0]?.id;
 if(typeof model!=='string'||!model)throw Error('No local PAIR model advertised');
 const cfg={
  nativeRouting:{localModels:[{model:'nvpair/'+model}]},
  dualMode:{pairUrl:'http://127.0.0.1:8080/v1/chat/completions',resilience:{enabled:true,maxRetries:1}},
  colabGatewayUrl:'http://127.0.0.1:'+port+'/v1/chat/completions',
  colabEnvFile:env,colabTimeoutSeconds:8
 };
 let metrics=null;
 const result=await runDual('Responda em uma frase: qual a capital da Franca?',cfg,{onMetrics:m=>{metrics=m;}});
 if(calls!==2||!result.colab.includes('successfully recovered'))throw Error('Recovery did not complete after exactly two Colab requests');
 console.log(JSON.stringify({success:true,realPairAnswerLength:result.pair.length,simulatedColabCalls:calls,colabMs:metrics?.colabMs,totalMs:metrics?.totalMs}));
}finally{
 await new Promise(resolve=>server.close(resolve));
 await rm(dir,{recursive:true,force:true});
}
