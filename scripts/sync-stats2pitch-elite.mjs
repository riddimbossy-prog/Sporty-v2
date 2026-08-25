import { remove, upsert, configured } from '../server/lib/supabase.mjs';
import { accraWeek } from '../server/lib/week.mjs';

const text=value=>String(value??'').trim();
const required=name=>{const value=text(process.env[name]);if(!value)throw new Error(`${name} is required`);return value};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function baseUrl(){
  return required('STATS2PITCH_BASE_URL').replace(/\/+$/,'');
}

function authHeaders(){
  return{Accept:'application/json',Authorization:`Bearer ${required('STATS2PITCH_ELITE_FEED_TOKEN')}`};
}

async function requestStats2Pitch(path,{method='GET'}={}){
  const response=await fetch(`${baseUrl()}${path}`,{method,headers:authHeaders()});
  const raw=await response.text();
  let payload={};
  try{payload=raw?JSON.parse(raw):{}}catch{throw new Error(`Stats2Pitch returned unreadable JSON from ${path}`)}
  return{response,payload};
}

async function fetchElite(date){
  const params=new URLSearchParams({date});
  return requestStats2Pitch(`/api/export/elite?${params.toString()}`);
}

async function ensureDailySnapshot(date){
  const params=new URLSearchParams({date});
  const started=await requestStats2Pitch(`/api/export/elite/refresh?${params.toString()}`,{method:'POST'});
  if(started.response.status===200&&started.payload?.status==='ready')return started.payload;
  if(!started.response.ok)throw new Error(`Stats2Pitch Elite refresh could not start: HTTP ${started.response.status}${started.payload?.error?` - ${started.payload.error}`:''}`);

  const maxPolls=Math.max(12,Math.min(90,Number(process.env.STATS2PITCH_REFRESH_MAX_POLLS||75)||75));
  const pollMs=Math.max(5000,Math.min(30000,Number(process.env.STATS2PITCH_REFRESH_POLL_MS||10000)||10000));
  for(let attempt=0;attempt<maxPolls;attempt++){
    await sleep(pollMs);
    const status=await requestStats2Pitch(`/api/export/elite/refresh-status?${params.toString()}`);
    if(!status.response.ok)throw new Error(`Stats2Pitch Elite refresh status failed: HTTP ${status.response.status}${status.payload?.error?` - ${status.payload.error}`:''}`);
    if(status.payload?.status==='complete')return status.payload;
    if(status.payload?.status==='failed')throw new Error(`Stats2Pitch Elite refresh failed${status.payload?.error?`: ${status.payload.error}`:''}`);
  }
  throw new Error(`Stats2Pitch Elite refresh timed out before the ${date} board was ready`);
}

function normalize(item,date,generatedAt){
  const home=text(item.home_team||item.home);
  const away=text(item.away_team||item.away);
  const directFixture=text(item.fixture||item.match);
  const fixture=directFixture&&!/^(fixture|match)$/i.test(directFixture)
    ?directFixture
    :(home&&away?`${home} vs ${away}`:'Fixture');
  return{
    id:text(item.id)||`stats2pitch-${text(item.source_fixture_id||item.fixtureId||item.fixture_id)}-${text(item.market)}-${text(item.pick||item.selection)}`,
    source:'stats2pitch',
    source_fixture_id:text(item.source_fixture_id||item.fixtureId||item.fixture_id)||null,
    prediction_date:date,
    fixture,
    home_team:home||null,
    away_team:away||null,
    home_logo:text(item.home_logo||item.homeLogo||item.home?.logo)||null,
    away_logo:text(item.away_logo||item.awayLogo||item.away?.logo)||null,
    league_logo:text(item.league_logo||item.leagueLogo)||null,
    league:text(item.league)||null,
    country:text(item.country)||null,
    kickoff:item.kickoff||null,
    market:text(item.market)||'Market',
    pick:text(item.pick||item.selection)||'Selection',
    odds:Number.isFinite(Number(item.average_odds??item.odds))?Number(item.average_odds??item.odds):null,
    classification:'elite_supported',
    label:'Elite',
    elite_score:null,
    engine_rating:null,
    family_count:null,
    families:[],
    contradiction:null,
    reason:null,
    status:'upcoming',
    source_generated_at:generatedAt||item.last_verified_at||null,
    imported_at:new Date().toISOString()
  };
}

async function syncDate(date){
  let {response,payload}=await fetchElite(date);
  const missingSnapshot=response.ok&&!payload?.generated_at;
  const staleSnapshot=response.status===409;
  if(missingSnapshot||staleSnapshot){
    console.log(JSON.stringify({ok:true,date,phase:'refresh-required',reason:missingSnapshot?'missing-snapshot':'stale-snapshot'}));
    await ensureDailySnapshot(date);
    ({response,payload}=await fetchElite(date));
  }

  if(!response.ok)throw new Error(`Stats2Pitch Elite export failed: HTTP ${response.status}${payload?.error?` - ${payload.error}`:''}`);
  if(!payload?.generated_at)throw new Error(`Stats2Pitch did not produce a persisted board for ${date}`);

  const rows=(Array.isArray(payload.items)?payload.items:[]).map(item=>normalize(item,date,payload.generated_at));
  await remove('sporty_elite_picks',{prediction_date:`eq.${date}`,source:'eq.stats2pitch'});
  if(rows.length)await upsert('sporty_elite_picks',rows,{onConflict:'id'});
  return{
    ok:true,date,count:rows.length,source:'stats2pitch',generated_at:payload.generated_at,
    refreshed:missingSnapshot||staleSnapshot,
    matchups:rows.filter(row=>row.home_team&&row.away_team).length,
    crests:rows.filter(row=>row.home_logo&&row.away_logo).length
  };
}

async function main(){
  if(!configured())throw new Error('Supabase is not configured for the sync job');
  const anchor=text(process.env.PREDICTION_DATE);
  const week=accraWeek(anchor?new Date(`${anchor}T12:00:00Z`):new Date());
  const days=[];
  for(const date of week.dates){
    try{
      const result=await syncDate(date);
      days.push(result);
      console.log(JSON.stringify(result));
    }catch(error){
      const failed={ok:false,date,error:error.message};
      days.push(failed);
      console.error(`[stats2pitch-elite-sync] ${date}: ${error.message}`);
    }
  }
  const okDays=days.filter(row=>row.ok);
  console.log(JSON.stringify({ok:okDays.length>0,week:{monday:week.monday,sunday:week.sunday},days:days.length,imported:okDays.reduce((sum,row)=>sum+Number(row.count||0),0),failures:days.filter(row=>!row.ok).length}));
  if(!okDays.length)throw new Error('No Elite days imported for this week');
}

main().catch(error=>{console.error(`[stats2pitch-elite-sync] ${error.message}`);process.exitCode=1});
