import { env, enabled, text, number, nowIso, safeDate, canonical, readJson, fetchJson, hashKey, publicError } from './core.mjs';
import * as db from './supabase.mjs';
import { collectSportyBetEvents, collectSportyBetCodes, getSportyBetPublicStatus, sportyBetPublicConfigured } from './sportybet-public.mjs';
import { collectSportyBetCodesWithBrowser, getSportyBetBrowserStatus, browserCollectorConfigured } from './sportybet-browser.mjs';

const memory=new Map();
const inflight=new Map();
const usage={day:'',count:0};
const root=process.cwd();
const ttlSeconds=name=>Math.max(30,number(env(name,'900'))||900);
const dayKey=()=>new Date().toISOString().slice(0,10);
const COLLECTOR_STATUS_KEY='sportybet-browser-agent-status-v2151';
const collectorExecutionMode=()=>text(env('SPORTYBET_BROWSER_EXECUTION_MODE','github-actions'))||'github-actions';

async function budgetAvailable(provider,cost=1){
  const cap=Math.max(1,number(env('UPSTREAM_DAILY_REQUEST_BUDGET','100'))||100);
  if(db.configured()){
    const allowed=await db.rpc('reserve_api_request',{p_provider:text(provider)||'upstream',p_cost:cost,p_daily_limit:cap}).catch(()=>null);
    if(typeof allowed==='boolean')return allowed;
  }
  const today=dayKey();if(usage.day!==today){usage.day=today;usage.count=0}
  if(usage.count+cost>cap)return false;usage.count+=cost;return true;
}
function memoryGet(key){const hit=memory.get(key);if(!hit||hit.expiresAt<=Date.now())return null;return hit.value}
function memorySet(key,value,ttl){memory.set(key,{value,expiresAt:Date.now()+ttl*1000});return value}

async function readPersistentCache(key){
  if(!db.configured())return null;
  const rows=await db.select('api_cache',{select:'cache_key,payload,expires_at,updated_at,source',cache_key:`eq.${key}`,limit:'1'}).catch(()=>[]);
  const row=rows?.[0];if(!row||Date.parse(row.expires_at)<=Date.now())return null;return row.payload;
}
async function writePersistentCache(key,payload,ttl,source){
  if(!db.configured())return;
  const expires=new Date(Date.now()+ttl*1000).toISOString();
  await db.upsert('api_cache',{cache_key:key,payload,source,updated_at:nowIso(),expires_at:expires},{onConflict:'cache_key'}).catch(()=>null);
}
async function cached(key,ttl,loader,{source='custom-api',force=false}={}){
  if(!force){const local=memoryGet(key);if(local)return local;const persisted=await readPersistentCache(key);if(persisted)return memorySet(key,persisted,ttl)}
  if(inflight.has(key))return inflight.get(key);
  const work=(async()=>{
    const value=await loader();
    const emptyFeed=Boolean(value&&typeof value==='object'&&number(value.count)===0&&(key.includes('codehub')||key.includes('upcoming')));
    const effectiveTtl=emptyFeed?Math.min(ttl,60):ttl;
    memorySet(key,value,effectiveTtl);
    await writePersistentCache(key,value,effectiveTtl,source);
    return value;
  })().finally(()=>inflight.delete(key));
  inflight.set(key,work);return work;
}

function normalizeCodeRow(row){
  const tips=(row.booking_code_selections||row.selections_detail||row.tips||[]).map(tip=>({
    fixture:text(tip.fixture||`${tip.home_team||''} vs ${tip.away_team||''}`),market:text(tip.market),pick:text(tip.pick||tip.selection),odds:number(tip.odds)||null,league:text(tip.league)||null,kickoff:safeDate(tip.kickoff)?.toISOString()||null,result:text(tip.result)||'unavailable'
  })).filter(tip=>tip.fixture&&tip.market&&tip.pick);
  return{
    id:text(row.id)||hashKey(row.code),code:text(row.code).toUpperCase(),title:text(row.title)||'Public code',odds:number(row.total_odds||row.odds)||null,selections:number(row.selections_count||row.selections)||tips.length,author:text(row.author||row.tipster)||'sporty.codes',tag:text(row.tag||row.category)||'Code Hub',status:text(row.status)||'upcoming',result:row.result||null,created_at:safeDate(row.created_at)?.toISOString()||null,expires_at:safeDate(row.expires_at)?.toISOString()||null,source_url:/^https:\/\//i.test(text(row.source_url))?text(row.source_url):null,tips
  };
}

async function persistCollectedCodes(items){
  if(!db.configured()||!Array.isArray(items)||!items.length)return 0;
  let stored=0;
  for(const item of items){
    const code=text(item.code).toUpperCase();if(!/^[A-Z0-9]{4,20}$/.test(code))continue;
    const tips=Array.isArray(item.tips)?item.tips:[];
    const rows=await db.upsert('booking_codes',{code,title:text(item.title)||'Public SportyBet code',total_odds:number(item.odds)||null,selections_count:number(item.selections)||tips.length,author:text(item.author)||'SportyBet Code Hub',category:text(item.tag)||'Code Hub',status:'published',result:['won','lost','void','pending'].includes(text(item.result).toLowerCase())?text(item.result).toLowerCase():null,published_at:safeDate(item.created_at)?.toISOString()||nowIso(),expires_at:safeDate(item.expires_at)?.toISOString()||null,source_url:/^https:\/\//i.test(text(item.source_url))?text(item.source_url):null},{onConflict:'code',returning:'representation'}).catch(()=>null);
    const id=rows?.[0]?.id;if(!id)continue;
    // Preserve previously expanded selections when a later public-page run finds
    // the code but cannot expand its slip. Replace selections only after a
    // successful expansion produced at least one valid tip.
    if(tips.length){
      const selectionRows=tips.slice(0,100).map((tip,index)=>({booking_code_id:id,position:index+1,fixture:text(tip.fixture),market:text(tip.market),pick:text(tip.pick),odds:number(tip.odds)||null,league:text(tip.league)||null,kickoff:safeDate(tip.kickoff)?.toISOString()||null,result:['won','lost','void','pending'].includes(text(tip.result).toLowerCase())?text(tip.result).toLowerCase():null})).filter(row=>row.fixture&&row.market&&row.pick);
      if(selectionRows.length){
        await db.remove('booking_code_selections',{booking_code_id:`eq.${id}`}).catch(()=>null);
        await db.insert('booking_code_selections',selectionRows,{returning:'minimal'}).catch(()=>null);
      }
    }
    stored++;
  }
  return stored;
}


export async function getSystemStatus(){
  const supabaseConfigured=db.configured();
  let supabaseStatus=supabaseConfigured?'configured_not_verified':'not_configured';
  let migrationReady=false;
  if(supabaseConfigured){
    try{
      await Promise.all([
        db.select('api_cache',{select:'cache_key',limit:'1'}),
        db.select('booking_codes',{select:'id',limit:'1'})
      ]);
      migrationReady=true;
      supabaseStatus='connected';
    }catch{
      supabaseStatus='migration_required_or_unreachable';
    }
  }
  const apiFootballConfigured=Boolean(env('API_FOOTBALL_KEY'));
  const oddsApiConfigured=Boolean(env('ODDS_API_KEY')&&env('ODDS_API_SPORT_KEYS'));
  const sportyStatus=getSportyBetPublicStatus();
  return{
    ready:Boolean(supabaseConfigured&&migrationReady),
    collector:'sportybet-browser-agent',
    configuration:{
      supabase_configured:supabaseConfigured,
      supabase_status:supabaseStatus,
      migration_ready:migrationReady,
      sportybet_public_collector_configured:sportyBetPublicConfigured(),
      sportybet_browser_collector_configured:browserCollectorConfigured()||collectorExecutionMode()==='github-actions',
      sportybet_browser_web_runtime_enabled:browserCollectorConfigured(),
      sportybet_browser_execution_mode:collectorExecutionMode(),
      sportybet_events_last_success_at:sportyStatus.events.last_success_at,
      sportybet_events_last_error:sportyStatus.events.last_error,
      sportybet_codes_last_success_at:sportyStatus.codes.last_success_at,
      sportybet_codes_last_error:sportyStatus.codes.last_error,
      api_football_configured:apiFootballConfigured,
      api_football_optional:true,
      odds_api_configured:oddsApiConfigured,
      odds_api_optional:true,
      daily_upstream_budget:number(env('UPSTREAM_DAILY_REQUEST_BUDGET','30'))||30
    }
  };
}

async function writeCollectorStatus(payload){
  if(!db.configured())return;
  const now=nowIso();
  const expires=new Date(Date.now()+30*86400000).toISOString();
  await db.upsert('api_cache',{cache_key:COLLECTOR_STATUS_KEY,payload,source:'sportybet-browser-agent',updated_at:now,expires_at:expires},{onConflict:'cache_key'}).catch(()=>null);
}

async function readCollectorStatus(){
  if(!db.configured())return null;
  const rows=await db.select('api_cache',{select:'payload,updated_at',cache_key:`eq.${COLLECTOR_STATUS_KEY}`,limit:'1'}).catch(()=>[]);
  const row=rows?.[0];
  if(!row?.payload||typeof row.payload!=='object')return null;
  return{...row.payload,persisted_at:row.updated_at||null};
}

export async function getBrowserCollectorStatus(){
  const local=getSportyBetBrowserStatus();
  const persisted=await readCollectorStatus();
  return{
    ...local,
    ...(persisted||{}),
    running:Boolean(local.running),
    configured:browserCollectorConfigured()||collectorExecutionMode()==='github-actions',
    web_runtime_enabled:browserCollectorConfigured(),
    external_runner:collectorExecutionMode()==='github-actions',
    execution_mode:collectorExecutionMode(),
    public_only:true,
    imports_private_cookies:false,
    uses_account_login:false,
  };
}

export async function getSourceStatus(){
  const status=getSportyBetPublicStatus();
  return{ok:true,generated_at:nowIso(),collector:'sportybet-browser-agent',public_only:true,uses_private_cookies:false,uses_account_access:false,sportybet:status,browser_agent:await getBrowserCollectorStatus(),api_football:{configured:Boolean(env('API_FOOTBALL_KEY')),role:'optional fallback and statistics enrichment'},odds_api:{configured:Boolean(env('ODDS_API_KEY')&&env('ODDS_API_SPORT_KEYS')),role:'optional odds enrichment'}};
}

export async function getCodeHubCodes({limit=24,force=false}={}){
  const safeLimit=Math.max(1,Math.min(100,number(limit)||24));
  return cached(`v2151:codehub:${safeLimit}`,ttlSeconds('CODE_CACHE_TTL_SECONDS'),async()=>{
    let rows=[];let collected=[];let source='none';const errors=[];
    if(db.configured()){
      rows=await db.select('booking_codes',{select:'*,booking_code_selections(*)',status:'eq.published',order:'published_at.desc.nullslast,created_at.desc',limit:String(safeLimit)}).catch(()=>[]);
      if(rows.length)source='supabase-booking-codes';
    }
    if(force||!rows.length){
      if(browserCollectorConfigured()){
        try{
          if(await budgetAvailable('sportybet-browser-codes',1))collected=await collectSportyBetCodesWithBrowser({limit:safeLimit});
          else errors.push('Daily upstream request budget reached');
          if(collected.length)source='sportybet-browser-agent';
        }catch(error){
          const message=publicError(error);errors.push(`browser: ${message}`);console.warn('[custom-api] SportyBet browser refresh failed:',message);
        }
      }
      if(!collected.length){
        try{
          if(await budgetAvailable('sportybet-public-codes',1))collected=await collectSportyBetCodes({limit:safeLimit});
          if(collected.length)source='sportybet-public-direct-fallback';
        }catch(error){
          const message=publicError(error);errors.push(`direct: ${message}`);console.warn('[custom-api] SportyBet direct code refresh failed:',message);
        }
      }
      if(collected.length){
        await persistCollectedCodes(collected);
        if(db.configured())rows=await db.select('booking_codes',{select:'*,booking_code_selections(*)',status:'eq.published',order:'published_at.desc.nullslast,created_at.desc',limit:String(safeLimit)}).catch(()=>[]);
      }
    }
    let items=rows.map(normalizeCodeRow).filter(item=>item.code);
    if(!items.length&&collected.length)items=collected.map(normalizeCodeRow).filter(item=>item.code).slice(0,safeLimit);
    if(!items.length){
      const fallback=await readJson(`${root}/data/codehub-banner.json`,{items:[]});
      items=(fallback.items||[]).map(normalizeCodeRow).filter(item=>item.code).slice(0,safeLimit);
      if(items.length)source='local-fallback';
    }
    return{version:10,source,collector:'sportybet-browser-agent',source_url:'https://www.sportybet.com/gh/m/code-hub/codes',generated_at:nowIso(),status:items.length?'ok':'empty',count:items.length,slips_with_tips:items.filter(item=>item.tips.length).length,total_tips:items.reduce((sum,item)=>sum+item.tips.length,0),errors:errors.slice(0,4),browser_status:await getBrowserCollectorStatus(),items};
  },{source:'booking_codes-v2151',force});
}

export async function runBrowserCollector({limit=20}={}){
  const startedAt=nowIso();
  await writeCollectorStatus({
    ...getSportyBetBrowserStatus(),
    running:true,
    last_started_at:startedAt,
    last_error:null,
    execution_mode:collectorExecutionMode(),
  });
  try{
    const items=await collectSportyBetCodesWithBrowser({limit});
    const stored=await persistCollectedCodes(items);
    memory.clear();
    if(db.configured())await db.remove('api_cache',{cache_key:'like.*codehub*'}).catch(()=>null);
    const local=getSportyBetBrowserStatus();
    const summary={
      ...local,
      running:false,
      execution_mode:collectorExecutionMode(),
      stored_codes:stored,
      last_success_at:items.length?(local.last_success_at||nowIso()):local.last_success_at,
    };
    await writeCollectorStatus(summary);
    return{ok:true,collector:'sportybet-browser-agent',generated_at:nowIso(),count:items.length,stored,slips_with_tips:items.filter(item=>Array.isArray(item.tips)&&item.tips.length).length,total_tips:items.reduce((sum,item)=>sum+(item.tips?.length||0),0),status:summary,items:items.slice(0,Math.min(10,items.length)).map(normalizeCodeRow)};
  }catch(error){
    const local=getSportyBetBrowserStatus();
    await writeCollectorStatus({...local,running:false,last_error:publicError(error),execution_mode:collectorExecutionMode()});
    throw error;
  }
}

export async function getBooking(code){
  const wanted=text(code).toUpperCase();if(!wanted)return null;
  const feed=await getCodeHubCodes({limit:100});return feed.items.find(item=>item.code===wanted)||null;
}

function apiFootballHeaders(){return{'x-apisports-key':env('API_FOOTBALL_KEY'),Accept:'application/json'}}
function fixtureRow(row){
  const fixture=row.fixture||{},league=row.league||{},teams=row.teams||{};
  return{event_id:`api-football:${fixture.id}`,game_id:String(fixture.id||''),provider_fixture_id:String(fixture.id||''),league:text(league.name),country:text(league.country),league_id:league.id||null,home_team:text(teams.home?.name),away_team:text(teams.away?.name),home_team_id:teams.home?.id||null,away_team_id:teams.away?.id||null,start_time:Date.parse(fixture.date)||0,kickoff:safeDate(fixture.date)?.toISOString()||null,match_status:text(fixture.status?.long||fixture.status?.short||'Not start'),oddsHome:null,oddsDraw:null,oddsAway:null,market_id:'1',search_query:`${text(teams.home?.name)} vs ${text(teams.away?.name)}`};
}
async function fetchFootballFixtures(days){
  const key=env('API_FOOTBALL_KEY');if(!key)return[];const output=[];
  for(let offset=0;offset<days;offset++){
    if(!await budgetAvailable('api-football',1))break;
    const date=new Date(Date.now()+offset*86400000).toISOString().slice(0,10);
    const url=new URL('https://v3.football.api-sports.io/fixtures');url.searchParams.set('date',date);url.searchParams.set('timezone','UTC');
    const payload=await fetchJson(url,{headers:apiFootballHeaders()},Number(env('UPSTREAM_TIMEOUT_MS','16000')));output.push(...(payload.response||[]).map(fixtureRow));
  }
  return output.filter(row=>row.event_id&&row.home_team&&row.away_team);
}
function bestH2H(event){
  const prices={home:[],draw:[],away:[]};
  for(const bookmaker of event.bookmakers||[])for(const market of bookmaker.markets||[])if(market.key==='h2h')for(const outcome of market.outcomes||[]){
    const name=canonical(outcome.name);if(name===canonical(event.home_team))prices.home.push(number(outcome.price));else if(name===canonical(event.away_team))prices.away.push(number(outcome.price));else if(name==='draw')prices.draw.push(number(outcome.price));
  }
  const median=values=>{const rows=values.filter(v=>v>1).sort((a,b)=>a-b);return rows.length?rows[Math.floor(rows.length/2)]:null};
  return{home:median(prices.home),draw:median(prices.draw),away:median(prices.away)};
}
async function fetchOdds(){
  const key=env('ODDS_API_KEY');const sports=env('ODDS_API_SPORT_KEYS').split(',').map(text).filter(Boolean).slice(0,12);if(!key||!sports.length)return[];const events=[];
  for(const sport of sports){if(!await budgetAvailable('odds-api',1))break;const url=new URL(`https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/odds/`);url.searchParams.set('apiKey',key);url.searchParams.set('regions',env('ODDS_API_REGIONS','eu,uk'));url.searchParams.set('markets','h2h');url.searchParams.set('oddsFormat','decimal');url.searchParams.set('dateFormat','iso');const payload=await fetchJson(url,{},Number(env('UPSTREAM_TIMEOUT_MS','16000')));events.push(...(Array.isArray(payload)?payload:[]))}
  return events;
}
function mergeOdds(fixtures,oddsRows){
  for(const fixture of fixtures){let best=null,bestScore=0;for(const row of oddsRows){const home=canonical(row.home_team),away=canonical(row.away_team);let score=0;if(home===canonical(fixture.home_team))score+=.5;if(away===canonical(fixture.away_team))score+=.5;const delta=Math.abs(Date.parse(row.commence_time)-fixture.start_time);if(delta<3*3600000)score+=.25;if(score>bestScore){best=row;bestScore=score}}if(best&&bestScore>=.75){const prices=bestH2H(best);fixture.oddsHome=prices.home;fixture.oddsDraw=prices.draw;fixture.oddsAway=prices.away;fixture.odds_source='the-odds-api'}}return fixtures;
}

export async function getUpcomingEvents({force=false,days=3}={}){
  const safeDays=Math.max(1,Math.min(7,number(days)||3));
  return cached(`v2142:upcoming:${safeDays}`,ttlSeconds('EVENT_CACHE_TTL_SECONDS'),async()=>{
    let events=[];let source='none';const errors=[];
    try{
      if(await budgetAvailable('sportybet-public-events',1)){events=await collectSportyBetEvents({days:safeDays});if(events.length)source='sportybet-public-direct'}
    }catch(error){errors.push(`sportybet: ${publicError(error)}`);console.warn('[custom-api] SportyBet event refresh failed:',publicError(error))}
    if(!events.length){
      try{const fixtures=await fetchFootballFixtures(safeDays);if(fixtures.length){events=fixtures;source='api-football-fallback';const odds=await fetchOdds().catch(()=>[]);if(odds.length){events=mergeOdds(events,odds);source='api-football+odds-api-fallback'}}}catch(error){errors.push(`api-football: ${publicError(error)}`);console.warn('[custom-api] fallback event refresh failed:',publicError(error))}
    }
    if(!events.length){const fallback=await readJson(`${root}/sportybet-events.json`,{events:[]});events=(fallback.events||[]).map(row=>({...row,event_id:text(row.event_id||`fallback:${row.game_id}`)}));if(events.length)source='cached-fallback'}
    events=events.sort((a,b)=>number(a.start_time)-number(b.start_time));return{version:3,updated_at:nowIso(),source,collector:'sportybet-public-direct',count:events.length,errors:errors.slice(0,2),events};
  },{source:'events-v2142',force});
}

function summarizeFixtures(rows,teamId){
  let wins=0,draws=0,losses=0,gf=0,ga=0,over15=0,over25=0,under35=0,btts=0,clean=0,fts=0;const form=[];
  for(const row of rows){const teams=row.teams||{},goals=row.goals||{};const isHome=number(teams.home?.id)===number(teamId);const scored=number(isHome?goals.home:goals.away),conceded=number(isHome?goals.away:goals.home);gf+=scored;ga+=conceded;const total=scored+conceded;if(total>1.5)over15++;if(total>2.5)over25++;if(total<3.5)under35++;if(scored>0&&conceded>0)btts++;if(conceded===0)clean++;if(scored===0)fts++;if(scored>conceded){wins++;form.push('W')}else if(scored===conceded){draws++;form.push('D')}else{losses++;form.push('L')}}
  const matches=rows.length,rate=n=>matches?Number((n/matches*100).toFixed(1)):0;return{matches,wins,draws,losses,goals_for:gf,goals_against:ga,points:wins*3+draws,over_1_5:rate(over15),over_2_5:rate(over25),under_3_5:rate(under35),btts:rate(btts),clean_sheets:rate(clean),fail_to_score:rate(fts),form:form.join('')};
}
async function recentFixtures(teamId){if(!await budgetAvailable('api-football',1))throw new Error('Daily upstream budget reached');const url=new URL('https://v3.football.api-sports.io/fixtures');url.searchParams.set('team',String(teamId));url.searchParams.set('last',env('STATS_RECENT_MATCHES','10'));url.searchParams.set('status','FT-AET-PEN');const payload=await fetchJson(url,{headers:apiFootballHeaders()},Number(env('UPSTREAM_TIMEOUT_MS','16000')));return payload.response||[]}

export async function searchMatches(date){const feed=await getUpcomingEvents({days:7});const day=text(date);return{version:1,generated_at:feed.updated_at,matches:feed.events.filter(row=>!day||String(row.kickoff||new Date(number(row.start_time)).toISOString()).slice(0,10)===day)}}
export async function getFixtureStats(eventId,{force=false}={}){
  const wanted=text(eventId);return cached(`stats:${wanted}`,ttlSeconds('STATS_CACHE_TTL_SECONDS'),async()=>{
    const key=env('API_FOOTBALL_KEY');if(!key)throw new Error('API_FOOTBALL_KEY is not configured');const events=(await getUpcomingEvents({days:7})).events;const event=events.find(row=>text(row.event_id)===wanted||text(row.provider_fixture_id)===wanted.replace(/^api-football:/,''));if(!event?.home_team_id||!event?.away_team_id)throw new Error('Fixture mapping is unavailable');const [homeRows,awayRows]=await Promise.all([recentFixtures(event.home_team_id),recentFixtures(event.away_team_id)]);const home=summarizeFixtures(homeRows,event.home_team_id),away=summarizeFixtures(awayRows,event.away_team_id);const avg=(home.goals_for+home.goals_against+away.goals_for+away.goals_against)/Math.max(1,home.matches+away.matches);return{version:1,event_id:event.event_id,generated_at:nowIso(),home,away,competition:{name:event.league,average_goals:Number(avg.toFixed(2))},source:'api-football'};
  },{source:'fixture-stats',force});
}

export async function refreshAll(){const events=await getUpcomingEvents({force:true,days:number(env('EVENT_DAYS_AHEAD','3'))||3});const codes=await getCodeHubCodes({force:true,limit:100});return{ok:true,collector:'sportybet-browser-agent',refreshed_at:nowIso(),events:events.count,event_source:events.source,codes:codes.count,code_source:codes.source,source_status:getSportyBetPublicStatus(),upstream_requests_today:usage.count,daily_budget:number(env('UPSTREAM_DAILY_REQUEST_BUDGET','100'))||100}}

export async function publishCode(payload){
  if(!db.configured())throw new Error('Supabase service connection is not configured');const code=text(payload.code).toUpperCase();if(!/^[A-Z0-9]{4,20}$/.test(code))throw new Error('Code must contain 4–20 letters or numbers');const tips=Array.isArray(payload.tips)?payload.tips:[];const rows=await db.upsert('booking_codes',{code,title:text(payload.title)||'Public code',total_odds:number(payload.odds)||null,selections_count:number(payload.selections)||tips.length,author:text(payload.author)||'sporty.codes',category:text(payload.tag)||'Code Hub',status:'published',published_at:nowIso(),expires_at:safeDate(payload.expires_at)?.toISOString()||null,source_url:/^https:\/\//i.test(text(payload.source_url))?text(payload.source_url):null},{onConflict:'code',returning:'representation'});const id=rows?.[0]?.id;if(id&&tips.length){await db.insert('booking_code_selections',tips.map((tip,index)=>({booking_code_id:id,position:index+1,fixture:text(tip.fixture),market:text(tip.market),pick:text(tip.pick),odds:number(tip.odds)||null,league:text(tip.league)||null,kickoff:safeDate(tip.kickoff)?.toISOString()||null})),{returning:'minimal'})}memory.clear();return normalizeCodeRow({...rows?.[0],booking_code_selections:tips});
}
