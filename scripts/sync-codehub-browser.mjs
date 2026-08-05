import { appendFile, writeFile } from 'node:fs/promises';
import { env, number, publicError } from '../server/lib/core.mjs';
import { runBrowserCollector } from '../server/lib/data-service.mjs';

function required(name){
  const value=env(name);
  if(!value)throw new Error(`${name} is required for the external browser collector`);
  return value;
}

async function writeSummary(payload){
  await writeFile('collector-result.json',`${JSON.stringify(payload,null,2)}\n`,'utf8');
  const summary=process.env.GITHUB_STEP_SUMMARY;
  if(!summary)return;
  const rows=[
    '# SportyBet Code Hub collector',
    '',
    `- Outcome: **${payload.outcome}**`,
    `- Verified slips: **${payload.count ?? 0}**`,
    `- Stored slips: **${payload.stored ?? 0}**`,
    `- Slips with tips: **${payload.slips_with_tips ?? 0}**`,
    `- Total tips: **${payload.total_tips ?? 0}**`,
    `- Last success: **${payload.last_success_at || 'none'}**`,
  ];
  if(payload.notice)rows.push(`- Notice: ${payload.notice}`);
  if(payload.error)rows.push(`- Error: ${payload.error}`);
  await appendFile(summary,`${rows.join('\n')}\n`,'utf8');
}

required('SUPABASE_URL');
required('SUPABASE_SERVICE_ROLE_KEY');
process.env.SPORTYBET_BROWSER_COLLECTOR_ENABLED='true';
process.env.SPORTYBET_BROWSER_EXECUTION_MODE=process.env.SPORTYBET_BROWSER_EXECUTION_MODE||'github-actions';

const limit=Math.max(1,Math.min(40,number(process.env.SPORTYBET_BROWSER_CODE_LIMIT||'20')||20));
try{
  const result=await runBrowserCollector({limit});
  if(result.ok===false)throw new Error('Collector returned an unsuccessful result');
  const empty=!result.count;
  const payload={
    ok:true,
    outcome:empty?'empty':'verified',
    collector:result.collector,
    count:result.count,
    stored:result.stored,
    removed_invalid:result.removed_invalid,
    slips_with_tips:result.slips_with_tips,
    total_tips:result.total_tips,
    last_success_at:result.status?.last_success_at||null,
    notice:empty?'Collector completed normally, but SportyBet returned no verifiable public slips with selections. Nothing was published.':null,
    status:result.status||null,
  };
  await writeSummary(payload);
  console.log(JSON.stringify(payload,null,2));
  if(empty){
    console.warn('::warning title=No verified public slips::Collector completed safely and published nothing. Download the diagnostics artifact for the current public load-code response summary.');
  }
}catch(error){
  const message=publicError(error);
  const payload={ok:false,outcome:'error',collector:'sportybet-browser-agent',error:message};
  await writeSummary(payload).catch(()=>null);
  console.error(`[collector] ${message}`);
  process.exitCode=1;
}
