// Read-only release preflight. Never mutates OpenClaw, Git or systemd state.
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,basename} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const DEFAULT_REPO='konradsoares/openclaw-smart-router';
function run(cmd,args,{cwd}={}){
 try{return execFileSync(cmd,args,{cwd,encoding:'utf8',timeout:15000,stdio:['ignore','pipe','ignore']}).trim();}
 catch{return null;}
}
export function evaluateReleaseState({stage,production,prs,worktreeClean,stagingActive,productionActive}){
 const checks=[
  ['staging-profile-isolated',stage.port===19451],
  ['production-profile-separate',production.port===18789],
  ['staging-experimental-plugin',stage.pluginPaths.includes('openclaw-smart-router-evidence')],
  ['staging-dual-verification',stage.dualEnabled&&stage.researchEnabled&&stage.recoveryEnabled&&stage.continuityEnabled],
  ['staging-gateway-active',stagingActive],
  ['production-gateway-untouched',productionActive],
  ['git-worktree-clean',worktreeClean],
  ['pr4-merged',prs[4]==='MERGED'],
  ['pr5-merged',prs[5]==='MERGED'],
  ['pr6-merged',prs[6]==='MERGED'],
  ['production-native-enabled',production.nativeEnabled],
  ['production-cloud-fallback-disabled',!production.allowCloudFallback]
 ];
 return {ready:checks.every(x=>x[1]),checks:checks.map(([name,pass])=>({name,pass}))};
}
export async function safeProfile(filename){
 try{
  const x=JSON.parse(await readFile(filename,'utf8'));
  const cfg=x.plugins?.entries?.['smart-router']?.config||{};
  return {
   port:x.gateway?.port,
   pluginPaths:(x.plugins?.load?.paths||[]).map(value=>basename(value)),
   nativeEnabled:cfg.nativeRouting?.enabled===true,
   dualEnabled:cfg.dualMode?.enabled===true,
   researchEnabled:cfg.dualMode?.research?.enabled===true,
   recoveryEnabled:cfg.dualMode?.resilience?.enabled===true,
   continuityEnabled:cfg.dualMode?.continuity?.enabled===true,
   allowCloudFallback:cfg.allowCloudFallback===true
  };
 }catch{return {port:null,pluginPaths:[]};}
}
export async function preflight({home=homedir(),cwd=process.cwd()}={}){
 const stage=await safeProfile(join(home,'.openclaw-routerstage/openclaw.json'));
 const production=await safeProfile(join(home,'.openclaw/openclaw.json'));
 const prs={};
 for(const number of [4,5,6]){
  prs[number]=run('gh',['pr','view',String(number),'--repo',DEFAULT_REPO,'--json','state','--jq','.state'],{cwd})||'UNKNOWN';
 }
 const status=run('git',['status','--porcelain'],{cwd});
 const worktreeClean=status!==null&&status.length===0;
 const stagingActive=run('systemctl',['--user','is-active','openclaw-routerstage-telegram.service'])==='active';
 const productionActive=run('systemctl',['--user','is-active','openclaw-gateway.service'])==='active';
 return evaluateReleaseState({stage,production,prs,worktreeClean,stagingActive,productionActive});
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const result=await preflight();
 for(const {name,pass} of result.checks)console.log((pass?'PASS ':'BLOCK ')+name);
 console.log(result.ready?'RELEASE READY (still requires operator approval)':'NO-GO for production');
 if(!result.ready)process.exitCode=2;
}
