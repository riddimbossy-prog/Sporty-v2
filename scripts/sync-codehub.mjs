import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeCodeHubPayload } from './codehub-normalizer.mjs';
import { updateIntelligenceHistory } from './intelligence-history.mjs';
import { updateSettlementLedger } from './results-proof.mjs';
import { getCodeHubCodes } from '../server/lib/data-service.mjs';

function env(name,fallback=''){const value=String(process.env[name]??'').trim();return value||String(fallback??'').trim()}
function enabled(name){return /^(1|true|yes|on)$/i.test(env(name))}
function parseJsonEnv(name,fallback=null){const raw=env(name);if(!raw)return fallback;try{return JSON.parse(raw)}catch{throw new Error(`${name} must contain valid JSON.`)}}
async function readJson(path,fallback){try{return JSON.parse(await readFile(resolve(path),'utf8'))}catch{return fallback}}
async function writeJson(path,value){const full=resolve(path);const temporary=`${full}.tmp`;await mkdir(dirname(full),{recursive:true});await writeFile(temporary,`${JSON.stringify(value,null,2)}\n`,'utf8');await rename(temporary,full)}
function safeError(error){return String(error?.message||error||'Feed update failed').replace(/https?:\/\/\S+/gi,'the configured source').replace(/[A-Za-z0-9_-]{28,}/g,'[redacted]').slice(0,180)}

async function fetchPayload(){
  const started=Date.now();
  const payload=await getCodeHubCodes({force:true,limit:Number(env('CUSTOM_API_MAX_ITEMS','24'))});
  return{payload,latencyMs:Date.now()-started};
}

export function applyManualOverrides(output,overrides){
  const map=new Map((overrides?.overrides||[]).map(row=>[String(row.code||'').trim().toUpperCase(),row]));let hiddenCount=0;let reviewCount=0;let manuallyVerifiedCount=0;
  output.items=(output.items||[]).filter(item=>{
    const row=map.get(String(item.code||'').toUpperCase());if(!row)return true;
    if(row.hidden===true){hiddenCount++;return false}
    const result=String(row.result||'').toLowerCase();
    if(['won','lost','void','pending'].includes(result)){
      if(result==='pending'){
        item.result=null;item.status='upcoming';item.settled_at=null;item.settlement={verification_status:'pending',method:'manual-override',verified_at:null,evidence_url:null};
      }else if(row.verified===true){
        item.result=result;item.status=result;item.settled_at=row.settled_at||new Date().toISOString();item.settlement={verification_status:'verified',method:'manual-verified',verified_at:row.verified_at||row.updated_at||item.settled_at,evidence_url:/^https:\/\//i.test(String(row.evidence_url||''))?String(row.evidence_url):null};manuallyVerifiedCount++;
      }else if(item.settlement?.verification_status!=='verified'){
        item.result=null;item.settled_at=null;item.settlement={verification_status:'needs_review',method:'manual-override',verified_at:null,evidence_url:null};reviewCount++;
      }
    }
    return true;
  });
  output.count=output.items.length;output.slips_with_tips=output.items.filter(item=>Array.isArray(item.tips)&&item.tips.length).length;output.total_tips=output.items.reduce((sum,item)=>sum+(Array.isArray(item.tips)?item.tips.length:0),0);output.status=output.count?'ok':'empty';
  return{output,hiddenCount,reviewCount,manuallyVerifiedCount};
}

function healthState(diagnostics){const quality=Number(diagnostics?.quality_score)||0;if(quality>=70)return'healthy';if(quality>=35)return'degraded';return'poor_quality'}

export async function runSync(){
  const startedAt=new Date();const startedMs=Date.now();const healthPath=env('FEED_HEALTH_PATH','data/feed-health.json');
  const previous=await readJson(healthPath,{version:2,last_successful_at:null,consecutive_failures:0});
  try{
    const{payload,latencyMs}=await fetchPayload();
    let output=normalizeCodeHubPayload(payload,{maxItems:Number(env('CUSTOM_API_MAX_ITEMS','24')),maxAgeHours:Number(env('PUBLIC_CODE_MAX_AGE_HOURS','36'))});
    if(output.count===0)throw new Error('The latest response contained no complete, current public booking codes. The previous published feed was preserved.');
    const diagnostics=output.diagnostics||{rejected:0,rejected_by_reason:{},quality_score:0};
    const overrides=await readJson(env('MANUAL_OVERRIDES_PATH','data/manual-overrides.json'),{version:2,overrides:[]});
    const applied=applyManualOverrides(output,overrides);output=applied.output;
    const publicOutput={...output};delete publicOutput.diagnostics;
    const intelligence=await updateIntelligenceHistory(publicOutput,{historyPath:env('TIP_HISTORY_PATH','data/tip-history.json'),sourcePath:env('SOURCE_STATS_PATH','data/source-stats.json'),performancePath:env('PERFORMANCE_SUMMARY_PATH','data/performance-summary.json')});
    const proof=await updateSettlementLedger(publicOutput,{ledgerPath:env('SETTLEMENT_LEDGER_PATH','data/settlement-ledger.json'),summaryPath:env('RESULTS_SUMMARY_PATH','data/results-summary.json')});
    await writeJson(env('CODEHUB_OUTPUT_PATH','data/codehub-banner.json'),publicOutput);
    const rejected=diagnostics.rejected_by_reason||{};
    const health={
      version:2,state:healthState(diagnostics),source_name:'Public Code Hub',schedule:'Hourly',last_attempt_at:startedAt.toISOString(),last_successful_at:publicOutput.generated_at,last_failure_at:previous.last_failure_at||null,last_error:null,consecutive_failures:0,
      source_latency_ms:latencyMs,run_duration_ms:Date.now()-startedMs,max_public_age_hours:30,
      input_count:diagnostics.input_rows||0,published_count:publicOutput.count,fresh_count:publicOutput.count,mapped_slips:publicOutput.slips_with_tips,mapped_tips:publicOutput.total_tips,
      hidden_count:applied.hiddenCount,settlement_review_count:applied.reviewCount,manual_verified_count:applied.manuallyVerifiedCount,verified_results_count:proof.summary.verified_total,rejected_count:diagnostics.rejected||0,duplicate_count:rejected.duplicate_code||0,expired_count:(rejected.expired||0)+(rejected.expired_match_day||0)+(rejected.stale_content||0),incomplete_count:(rejected.missing_or_invalid_code||0)+(rejected.missing_or_invalid_odds||0)+(rejected.missing_selections||0)+(rejected.invalid_record||0),
      rejected_by_reason:rejected,quality_score:diagnostics.quality_score||0,public_status:publicOutput.count?`${publicOutput.count} current codes`:'No current codes'
    };
    await writeJson(healthPath,health);
    console.log(`Published ${publicOutput.count} current codes, ${publicOutput.total_tips} mapped tips, ${proof.summary.verified_total} verified results and ${intelligence.performance.total_settled} verified settled tips.`);
    return{output:publicOutput,health};
  }catch(error){
    const failure={...previous,version:2,state:'failed',source_name:'Public Code Hub',schedule:'Hourly',last_attempt_at:startedAt.toISOString(),last_failure_at:new Date().toISOString(),last_error:safeError(error),consecutive_failures:(Number(previous.consecutive_failures)||0)+1,run_duration_ms:Date.now()-startedMs,max_public_age_hours:Number(previous.max_public_age_hours)||30,public_status:'Update delayed'};
    await writeJson(healthPath,failure);throw error;
  }
}

const isDirectRun=process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url;
if(isDirectRun)runSync().catch(error=>{console.error(`Feed update failed: ${safeError(error)}`);process.exitCode=1});
