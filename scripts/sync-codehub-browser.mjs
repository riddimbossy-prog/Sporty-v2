import { env, number, publicError } from '../server/lib/core.mjs';
import { runBrowserCollector } from '../server/lib/data-service.mjs';

function required(name){
  const value=env(name);
  if(!value)throw new Error(`${name} is required for the external browser collector`);
  return value;
}

required('SUPABASE_URL');
required('SUPABASE_SERVICE_ROLE_KEY');
process.env.SPORTYBET_BROWSER_COLLECTOR_ENABLED='true';
process.env.SPORTYBET_BROWSER_EXECUTION_MODE=process.env.SPORTYBET_BROWSER_EXECUTION_MODE||'github-actions';

const limit=Math.max(1,Math.min(40,number(process.env.SPORTYBET_BROWSER_CODE_LIMIT||'20')||20));
try{
  const result=await runBrowserCollector({limit});
  console.log(JSON.stringify({
    ok:result.ok,
    collector:result.collector,
    count:result.count,
    stored:result.stored,
    slips_with_tips:result.slips_with_tips,
    total_tips:result.total_tips,
    last_success_at:result.status?.last_success_at||null,
  },null,2));
  if(!result.count)process.exitCode=2;
}catch(error){
  console.error(`[collector] ${publicError(error)}`);
  process.exitCode=1;
}
