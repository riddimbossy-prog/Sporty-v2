import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { discoverEliteCandidates, verifyCandidate, classifyElite } from './elite-engine.mjs';
import { searchMatches, getFixtureStats } from '../server/lib/data-service.mjs';

const text=value=>String(value??'').trim();
const number=value=>{const parsed=Number(String(value??'').replace(/,/g,''));return Number.isFinite(parsed)?parsed:0};
const env=(name,fallback='')=>text(process.env[name]??fallback);
const safeDate=value=>{const date=value?new Date(value):null;return date&&Number.isFinite(date.getTime())?date.toISOString():null};
const slug=value=>text(value).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
const canonical=value=>slug(value).replace(/\b(fc|cf|sc|afc|club)\b/g,'').replace(/\s+/g,' ').trim();
const mean=values=>{const valid=values.map(number).filter(value=>Number.isFinite(value));return valid.length?valid.reduce((a,b)=>a+b,0)/valid.length:0};

async function readJson(path,fallback){try{return JSON.parse(await readFile(resolve(path),'utf8'))}catch{return fallback}}
async function writeJson(path,value){const full=resolve(path);const temporary=`${full}.tmp`;await mkdir(dirname(full),{recursive:true});await writeFile(temporary,`${JSON.stringify(value,null,2)}\n`,'utf8');await rename(temporary,full)}
function safeError(error){return text(error?.message||error||'Elite verification failed').replace(/https?:\/\/\S+/gi,'the configured source').replace(/[A-Za-z0-9_-]{28,}/g,'[redacted]').slice(0,220)}
function nowIso(){return new Date().toISOString()}
function ageHours(value){const stamp=Date.parse(value);return Number.isFinite(stamp)?(Date.now()-stamp)/3600000:Number.POSITIVE_INFINITY}

function credentials(){
  return{configured:Boolean(env('API_FOOTBALL_KEY'))};
}

async function fetchApi(endpoint,params){
  const started=Date.now();
  const payload=endpoint==='search_matches'
    ?await searchMatches(params.date)
    :endpoint==='get_fixture_stats'
      ?await getFixtureStats(params.event_id,{force:false})
      :(()=>{throw new Error(`Unsupported custom API operation: ${endpoint}`)})();
  return{payload,latency_ms:Date.now()-started};
}

function findArray(value,depth=0,seen=new Set()){
  if(value==null||depth>7)return[];if(Array.isArray(value))return value;if(typeof value!=='object'||seen.has(value))return[];seen.add(value);
  for(const key of ['matches','items','results','data','records','rows','events'])if(Array.isArray(value[key]))return value[key];
  for(const nested of Object.values(value)){const found=findArray(nested,depth+1,seen);if(found.length)return found}
  return[];
}
function getAny(row,paths){for(const path of paths){const value=path.split('.').reduce((current,key)=>current==null?undefined:current[key],row);if(value!==undefined&&value!==null&&text(value)!=='')return value}return null}
function eventRecord(row){
  const home=text(getAny(row,['home_team','homeTeam','home.name','home','team_home','teamHome']));
  const away=text(getAny(row,['away_team','awayTeam','away.name','away','team_away','teamAway']));
  const eventId=text(getAny(row,['event_id','eventId','id','match_id','matchId','betexplorer_event_id']));
  const competition=text(getAny(row,['competition.name','competition','league.name','league','tournament']));
  const kickoff=safeDate(getAny(row,['kickoff','date','start_time','startTime','time']));
  return{event_id:eventId,home_team:home,away_team:away,competition,kickoff,raw:row};
}
function similarity(a,b){
  const A=new Set(canonical(a).split(' ').filter(Boolean));const B=new Set(canonical(b).split(' ').filter(Boolean));if(!A.size||!B.size)return 0;let shared=0;for(const token of A)if(B.has(token))shared++;return shared/(A.size+B.size-shared||1);
}
function matchEvent(candidate,rows){
  let best=null,bestScore=0;
  for(const raw of rows){const row=eventRecord(raw);if(!row.event_id)continue;const direct=(similarity(candidate.home_team,row.home_team)+similarity(candidate.away_team,row.away_team))/2;const reverse=(similarity(candidate.home_team,row.away_team)+similarity(candidate.away_team,row.home_team))/2*.6;const score=Math.max(direct,reverse);if(score>bestScore){best=row;bestScore=score}}
  return bestScore>=0.48?{...best,match_confidence:Number((bestScore*100).toFixed(1))}:null;
}

function publicItem(row){
  return{
    id:row.id,fixture:row.fixture,home_team:row.home_team,away_team:row.away_team,league:row.league||row.event?.competition||null,kickoff:row.kickoff,market:row.market,pick:row.pick,average_odds:row.average_odds,
    classification:row.classification,label:row.label,elite_score:row.elite_score,consensus_score:row.consensus_score,statistical_score:row.statistical_score,independent_sources:row.independent_sources,independent_groups:row.independent_groups,total_additions:row.appearances,unique_sources:row.unique_sources,source_reliability:row.source_reliability,opposition_level:row.opposition_share<10?'Low':row.opposition_share<25?'Moderate':'High',opposition_share:row.opposition_share,trend:row.history_observations>=3?'Stable':'Developing',statistics_complete:row.statistical_complete,last_verified_at:row.verified_at,reason:row.reason,
    evidence:{event_id:row.event?.event_id||null,match_confidence:row.event?.match_confidence||null,stats_updated_at:row.stats_updated_at||null},
    safeguards:{not_probability:true,not_guarantee:true,minimum_independent_sources:row.classification==='elite_verified'?5:3}
  };
}

function historyKey(row){return`${row.id}|${row.classification}`}
function resultForCandidate(candidate,tipHistory){const row=(tipHistory?.tips||[]).find(item=>text(item.key)===text(candidate.key));if(row?.verification_status==='verified'&&['won','lost','void'].includes(text(row.result).toLowerCase()))return{text:row.result,settled_at:row.settled_at||row.last_seen};return null}
function updateEliteHistory(previous,current,tipHistory){
  const map=new Map((previous?.records||[]).map(row=>[historyKey(row),row]));
  for(const candidate of current){
    const key=historyKey(candidate);const existing=map.get(key)||{id:candidate.id,classification:candidate.classification,fixture:candidate.fixture,market:candidate.market,pick:candidate.pick,league:candidate.league,kickoff:candidate.kickoff,first_seen:candidate.verified_at,last_seen:candidate.verified_at,elite_score:candidate.elite_score,consensus_score:candidate.consensus_score,statistical_score:candidate.statistical_score,result:'pending',settled_at:null};
    existing.last_seen=candidate.verified_at;existing.elite_score=candidate.elite_score;existing.consensus_score=candidate.consensus_score;existing.statistical_score=candidate.statistical_score;const settled=resultForCandidate(candidate,tipHistory);if(settled){existing.result=settled.text;existing.settled_at=settled.settled_at}map.set(key,existing);
  }
  const records=[...map.values()].sort((a,b)=>String(b.last_seen).localeCompare(String(a.last_seen))).slice(0,3000);return{version:1,updated_at:nowIso(),records};
}
function performanceFromHistory(history){
  const settled=(history?.records||[]).filter(row=>['won','lost','void'].includes(text(row.result).toLowerCase()));const decisive=settled.filter(row=>row.result!=='void');const groups=[];
  for(const classification of ['elite_verified','elite_supported','trending']){const rows=decisive.filter(row=>row.classification===classification);const won=rows.filter(row=>row.result==='won').length;groups.push({classification,label:{elite_verified:'Elite Verified',elite_supported:'Elite Supported',trending:'Trending'}[classification],settled:rows.length,won,lost:rows.length-won,hit_rate:rows.length?Number((won/rows.length*100).toFixed(1)):null,sample_ready:rows.length>=30})}
  return{version:1,updated_at:nowIso(),verified_results_only:true,minimum_public_sample:30,total_settled:settled.length,total_decisive:decisive.length,groups};
}

export async function runEliteSync(){
  const started=Date.now();const generatedAt=nowIso();const paths={feed:env('CODEHUB_OUTPUT_PATH','data/codehub-banner.json'),source:env('SOURCE_STATS_PATH','data/source-stats.json'),tipHistory:env('TIP_HISTORY_PATH','data/tip-history.json'),output:env('ELITE_OUTPUT_PATH','data/elite-picks.json'),cache:env('ELITE_CACHE_PATH','data/elite-cache.json'),health:env('ELITE_HEALTH_PATH','data/elite-feed-health.json'),history:env('ELITE_HISTORY_PATH','data/elite-history.json'),performance:env('ELITE_PERFORMANCE_PATH','data/elite-performance.json')};
  const [feed,sourceStats,tipHistory,cache,previousHealth,previousHistory]=await Promise.all([
    readJson(paths.feed,{items:[]}),readJson(paths.source,{sources:[]}),readJson(paths.tipHistory,{tips:[]}),readJson(paths.cache,{version:1,search:{},fixtures:{}}),readJson(paths.health,{version:1,consecutive_failures:0}),readJson(paths.history,{version:1,records:[]})
  ]);
  const candidates=discoverEliteCandidates(feed,{sourceStats,tipHistory,minAppearances:number(env('ELITE_MIN_ADDITIONS','5'))||5,minIndependent:number(env('ELITE_MIN_INDEPENDENT','3'))||3});
  const creds=credentials();let creditsUsed=0;const budget=Math.max(10,number(env('ELITE_RUN_CREDIT_BUDGET','60'))||60);const cacheHours=Math.max(1,number(env('ELITE_STATS_CACHE_HOURS','8'))||8);const verified=[];const rejected=[];const errors=[];const endpointLatency=[];
  const dates=[...new Set(candidates.map(row=>row.day).filter(day=>day&&day!=='undated'))];
  if(!creds.configured){
    const output={version:1,generated_at:generatedAt,status:'awaiting_api_configuration',count:0,elite_verified:0,elite_supported:0,trending:0,items:[],message:'API-Football is not configured for statistical verification.'};
    const health={version:1,state:'awaiting_configuration',last_attempt_at:generatedAt,last_successful_at:previousHealth.last_successful_at||null,last_error:null,consecutive_failures:0,candidate_count:candidates.length,published_count:0,rejected_count:0,credits_used:0,run_credit_budget:budget,run_duration_ms:Date.now()-started};
    await Promise.all([writeJson(paths.output,output),writeJson(paths.health,health)]);return{output,health};
  }
  try{
    for(const date of dates){
      const cached=cache.search?.[date];if(cached&&ageHours(cached.fetched_at)<6)continue;if(creditsUsed+1>budget)break;
      const response=await fetchApi('search_matches',{date});creditsUsed+=1;endpointLatency.push(response.latency_ms);cache.search??={};cache.search[date]={fetched_at:generatedAt,matches:findArray(response.payload).map(eventRecord).filter(row=>row.event_id).map(({raw,...row})=>row)};
    }
    for(const candidate of candidates){
      const matches=cache.search?.[candidate.day]?.matches||[];const event=matchEvent(candidate,matches);
      if(!event){verified.push(classifyElite(candidate,{score:0,complete:false,contradiction:false,components:{},reasons:['Fixture mapping is still incomplete.'],stats:{}}));continue}
      const cached=cache.fixtures?.[event.event_id];let payload=cached?.payload;let statsUpdatedAt=cached?.fetched_at;
      if(!payload||ageHours(cached?.fetched_at)>=cacheHours){
        if(creditsUsed+10>budget){verified.push(classifyElite(candidate,{score:0,complete:false,contradiction:false,components:{},reasons:['Statistical refresh deferred by the configured credit budget.'],stats:{}}));continue}
        try{const response=await fetchApi('get_fixture_stats',{event_id:event.event_id});creditsUsed+=10;endpointLatency.push(response.latency_ms);payload=response.payload;statsUpdatedAt=generatedAt;cache.fixtures??={};cache.fixtures[event.event_id]={fetched_at:generatedAt,payload}}
        catch(error){errors.push(safeError(error));verified.push(classifyElite(candidate,{score:0,complete:false,contradiction:false,components:{},reasons:['Fixture statistics could not be refreshed.'],stats:{}}));continue}
      }
      const verification=verifyCandidate(candidate,payload);const row=classifyElite(candidate,verification);row.event=event;row.stats_updated_at=statsUpdatedAt;if(row.classification==='rejected')rejected.push(row);else verified.push(row);
    }
    const publishable=verified.filter(row=>['elite_verified','elite_supported','trending'].includes(row.classification)).sort((a,b)=>b.elite_score-a.elite_score||b.independent_sources-a.independent_sources);
    const publicItems=publishable.map(publicItem);const output={version:1,generated_at:generatedAt,status:publicItems.length?'ok':'empty',count:publicItems.length,elite_verified:publicItems.filter(row=>row.classification==='elite_verified').length,elite_supported:publicItems.filter(row=>row.classification==='elite_supported').length,trending:publicItems.filter(row=>row.classification==='trending').length,method:'Independent consensus plus market-specific statistical verification.',score_notice:'Elite Score is a ranking score, not a probability or guarantee.',items:publicItems};
    const history=updateEliteHistory(previousHistory,publishable,tipHistory);const performance=performanceFromHistory(history);
    const health={version:1,state:errors.length?'degraded':'healthy',last_attempt_at:generatedAt,last_successful_at:generatedAt,last_error:errors[0]||null,consecutive_failures:0,candidate_count:candidates.length,published_count:publicItems.length,elite_verified:output.elite_verified,elite_supported:output.elite_supported,trending:output.trending,rejected_count:rejected.length,mapping_pending:publishable.filter(row=>!row.statistical_complete).length,credits_used:creditsUsed,run_credit_budget:budget,average_api_latency_ms:endpointLatency.length?Math.round(mean(endpointLatency)):null,cache_entries:Object.keys(cache.fixtures||{}).length,run_duration_ms:Date.now()-started};
    cache.version=1;cache.updated_at=generatedAt;
    await Promise.all([writeJson(paths.output,output),writeJson(paths.cache,cache),writeJson(paths.health,health),writeJson(paths.history,history),writeJson(paths.performance,performance)]);
    console.log(`Elite sync published ${publicItems.length} item(s), used ${creditsUsed}/${budget} credits and rejected ${rejected.length} contradictory candidate(s).`);return{output,health};
  }catch(error){
    const health={...previousHealth,version:1,state:'failed',last_attempt_at:generatedAt,last_failure_at:generatedAt,last_error:safeError(error),consecutive_failures:(number(previousHealth.consecutive_failures)||0)+1,candidate_count:candidates.length,credits_used:creditsUsed,run_credit_budget:budget,run_duration_ms:Date.now()-started};await writeJson(paths.health,health);throw error;
  }
}

const direct=process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url;
if(direct)runEliteSync().catch(error=>{console.error(safeError(error));process.exitCode=1});
