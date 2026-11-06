import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateReleaseState} from '../scripts/release-preflight.mjs';
const stage={port:19451,pluginPaths:['openclaw-smart-router-evidence'],dualEnabled:true,researchEnabled:true,recoveryEnabled:true,continuityEnabled:true};
const prod={port:18789,nativeEnabled:true,allowCloudFallback:false};
const ready={stage,production:prod,prs:{4:'MERGED',5:'MERGED',6:'MERGED'},worktreeClean:true,stagingActive:true,productionActive:true};
test('preflight passes only when all nonapproval gates are met',()=>{
 const state=evaluateReleaseState(ready);
 assert.equal(state.ready,true);
 assert.ok(state.checks.every(v=>v.pass));
});
test('unmerged dependency or disabled production native mode fail closed',()=>{
 const a=evaluateReleaseState({...ready,prs:{...ready.prs,5:'OPEN'}});
 assert.equal(a.ready,false);
 assert.equal(a.checks.find(x=>x.name==='pr5-merged').pass,false);
 const b=evaluateReleaseState({...ready,production:{...prod,nativeEnabled:false}});
 assert.equal(b.ready,false);
});
test('missing staging continuity or dirty tree blocks release',()=>{
 const a=evaluateReleaseState({...ready,stage:{...stage,continuityEnabled:false}});
 const b=evaluateReleaseState({...ready,worktreeClean:false});
 assert.equal(a.ready,false);
 assert.equal(b.ready,false);
});
test('production cloud fallback must remain disabled by default',()=>{
 assert.equal(evaluateReleaseState({...ready,production:{...prod,allowCloudFallback:true}}).ready,false);
});

test('profile parser handles plugin path basenames without exposing secrets',async()=>{
 const {safeProfile}=await import('../scripts/release-preflight.mjs');
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'smart-router-preflight-'));
 try{
  const file=join(dir,'openclaw.json');
  await writeFile(file,JSON.stringify({gateway:{port:19451},plugins:{load:{paths:['/tmp/test/openclaw-smart-router-evidence']},entries:{'smart-router':{config:{dualMode:{enabled:true,research:{enabled:true},resilience:{enabled:true},continuity:{enabled:true}}}}}}}));
  const result=await safeProfile(file);
  assert.equal(result.port,19451);
  assert.deepEqual(result.pluginPaths,['openclaw-smart-router-evidence']);
  assert.equal(result.continuityEnabled,true);
 }finally{await rm(dir,{recursive:true,force:true});}
});
