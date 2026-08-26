import { diagnoseAwayFavFixture } from './elite-engine.mjs';
import { accraWeek } from '../server/lib/week.mjs';
import { configured, remove, upsert } from '../server/lib/supabase.mjs';

const text=value=>String(value??'').trim();
const num=value=>{const n=Number(value);return Number.isFinite(n)?n:null};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const country=()=>text(process.env.SPORTYBET_COUNTRY||'gh').toLowerCase().replace(/[^a-z]/g,'').slice(0,3)||'gh';

function publicHeaders(){
  return{
    Accept:'application/json, text/plain, */*',
    'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Referer:`https://www.sportybet.com/${country()}/`,
    Origin:'https://www.sportybet.com',
    'Accept-Language':'en-GB,en;q=0.9'
  };
}

async function fetchJson(url,{timeoutMs=20000}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{headers:publicHeaders(),signal:controller.signal});
    const raw=await response.text();
    if(!response.ok)throw new Error(`SportyBet HTTP ${response.status} for ${url}`);
    try{return JSON.parse(raw)}catch{throw new Error(`SportyBet returned unreadable JSON for ${url}`)}
  }catch(error){
    if(error?.name==='AbortError')throw new Error(`SportyBet timed out for ${url}`);
    throw error;
  }finally{clearTimeout(timer)}
}

async function upcomingMarket(marketId){
  const events=[];
  for(let page=1;page<=20;page++){
    const url=`https://www.sportybet.com/api/${country()}/factsCenter/pcUpcomingEvents?sportId=${encodeURIComponent('sr:sport:1')}&marketId=${encodeURIComponent(marketId)}&pageNum=${page}&pageSize=100`;
    const payload=await fetchJson(url);
    const tournaments=payload?.data?.tournaments||[];
    let count=0;
    for(const tournament of tournaments){
      for(const event of tournament.events||[]){
        const category=event?.sport?.category||{};
        events.push({
          ...event,
          league:category?.tournament?.name||tournament?.name||event?.league||'',
          country:category?.name||event?.country||''
        });
        count++;
      }
    }
    if(count<100)break;
    await sleep(150);
  }
  return events;
}

function outcomeYes(event){
  for(const market of event.markets||[]){
    for(const outcome of market.outcomes||[]){
      if(String(outcome?.desc||'').toLowerCase()==='yes')return num(outcome.odds);
    }
  }
  return null;
}

function oneXTwo(event){
  const out={home:null,draw:null,away:null};
  for(const market of event.markets||[]){
    if(String(market.id)!=='1'&&!/1x2/i.test(String(market.name||market.desc||'')))continue;
    for(const outcome of market.outcomes||[]){
      const name=String(outcome.desc||'').toLowerCase();
      const price=num(outcome.odds);
      if(name==='home')out.home=price;
      if(name==='draw')out.draw=price;
      if(name==='away')out.away=price;
    }
  }
  return out;
}

function kickoffIso(event){
  const ms=Number(event?.estimateStartTime||event?.startTime||0);
  if(!Number.isFinite(ms)||ms<=0)return null;
  return new Date(ms).toISOString();
}

function accraDate(iso){
  if(!iso)return null;
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Accra',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));
}

function marketKeyFor(market){
  const id=String(market?.id||'');
  const blob=`${id} ${market?.name||''} ${market?.desc||''} ${market?.title||''}`.toLowerCase();
  if(id==='1'||blob.includes('1x2'))return'match-winner';
  if(id==='29'||/\bgg\/ng\b/.test(blob)||blob.includes('both teams'))return'both-teams-score';
  if(id==='60010'||/goals? in a row/.test(blob)||/score 2 or more/.test(blob)||/2\+ goals in a row/.test(blob))return'goals-streak-2';
  if(id==='19'||blob.includes('home o/u')||blob.includes('home over/under'))return'home-team-goals';
  if(id==='20'||blob.includes('away o/u')||blob.includes('away over/under'))return'away-team-goals';
  if(id==='18'||blob.includes('over/under'))return'total-goals';
  return null;
}

export function sportybetMarketOdds(event){
  const grouped=new Map();
  for(const market of event?.markets||[]){
    const key=marketKeyFor(market);
    if(!key)continue;
    const row=grouped.get(key)||{marketKey:key,market:text(market.name||market.desc||market.title)||key,outcomes:[]};
    for(const outcome of market.outcomes||[]){
      const name=text(outcome.desc||outcome.name);
      const odd=num(outcome.odds);
      if(!name||!odd)continue;
      if(!row.outcomes.some(item=>item.name===name))row.outcomes.push({name,odd});
    }
    grouped.set(key,row);
  }
  return[...grouped.values()];
}

export function fixtureFromSportybet(event){
  const kickoff=kickoffIso(event);
  return{
    fixtureId:text(event.eventId||event.gameId),
    league:text(event.league),
    country:text(event.country),
    kickoff,
    home:{id:event.homeTeamId,name:text(event.homeTeamName),logo:event.homeTeamIcon||null,fixtures:[]},
    away:{id:event.awayTeamId,name:text(event.awayTeamName),logo:event.awayTeamIcon||null,fixtures:[]},
    homeSplit:null,
    awaySplit:null,
    earlySeason:false,
    marketOdds:sportybetMarketOdds(event)
  };
}

function publicMarket(row){
  const market=text(row?.market);
  if(market==='both-teams-score'||market==='BTTS')return'Both Teams To Score';
  if(market==='match-winner'||market==='1X2')return'Match winner';
  if(market==='away-team-goals')return'Away team goals';
  if(market==='home-team-goals')return'Home team goals';
  if(market==='total-goals')return'Total goals';
  return market||'Market';
}

function normalizeRow(pick,predictionDate,generatedAt){
  const home=text(pick.home),away=text(pick.away);
  return{
    id:`stats2pitch-${text(pick.fixtureId)}-${text(pick.market)}-${text(pick.selection)}`,
    source:'stats2pitch',
    source_fixture_id:text(pick.fixtureId)||null,
    prediction_date:predictionDate,
    fixture:home&&away?`${home} vs ${away}`:'Fixture',
    home_team:home||null,
    away_team:away||null,
    home_logo:text(pick.homeLogo)||null,
    away_logo:text(pick.awayLogo)||null,
    league_logo:null,
    league:text(pick.league)||null,
    country:text(pick.country)||null,
    kickoff:pick.kickoff||null,
    market:publicMarket(pick),
    pick:text(pick.displaySelection||pick.pick||pick.selection)||'Selection',
    odds:num(pick.odds),
    classification:'elite_supported',
    label:'Elite',
    elite_score:null,
    engine_rating:null,
    family_count:null,
    families:[],
    contradiction:null,
    reason:null,
    status:'upcoming',
    source_generated_at:generatedAt,
    imported_at:new Date().toISOString()
  };
}

async function mapLimit(items,limit,fn){
  const out=new Array(items.length);
  let index=0;
  async function worker(){
    while(true){
      const current=index++;
      if(current>=items.length)return;
      out[current]=await fn(items[current],current);
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length||1)},worker));
  return out;
}

async function eventDetail(eventId){
  const url=`https://www.sportybet.com/api/${country()}/factsCenter/event?eventId=${encodeURIComponent(eventId)}`;
  const payload=await fetchJson(url,{timeoutMs:25000});
  return payload?.data||null;
}

export async function collectQualifyingFixtures(week=accraWeek()){
  const [streakEvents,matchEvents]=await Promise.all([upcomingMarket('60010'),upcomingMarket('1')]);
  const matchById=new Map(matchEvents.map(event=>[text(event.eventId),event]));
  const dates=new Set(week.dates);
  const candidates=[];
  for(const event of streakEvents){
    const streak=outcomeYes(event);
    if(!streak||streak<1.10||streak>1.49)continue;
    const kickoff=kickoffIso(event);
    const day=accraDate(kickoff);
    if(!day||!dates.has(day))continue;
    const match=matchById.get(text(event.eventId))||event;
    const prices=oneXTwo(match);
    if(!prices.home||!prices.away||!(prices.away<prices.home))continue;
    candidates.push({...event,league:event.league||match.league,country:event.country||match.country,streak,prices,kickoff,prediction_date:day});
  }

  const skipped={streakListed:streakEvents.length,weekWindow:0,awayFav:candidates.length,detailFailed:0,diagnosed:0};
  skipped.weekWindow=streakEvents.filter(event=>{
    const streak=outcomeYes(event);
    const day=accraDate(kickoffIso(event));
    return streak>=1.10&&streak<=1.49&&dates.has(day);
  }).length;

  const details=await mapLimit(candidates,4,async event=>{
    try{
      const detail=await eventDetail(event.eventId);
      await sleep(120);
      if(!detail)return{event,detail:null};
      return{event,detail:{...detail,league:detail.league||event.league,country:((detail.sport||{}).category||{}).name||event.country}};
    }catch{
      skipped.detailFailed++;
      return{event,detail:null};
    }
  });

  const diagnosed=[];
  for(const row of details){
    if(!row?.detail)continue;
    const fixture=fixtureFromSportybet(row.detail);
    const result=diagnoseAwayFavFixture(fixture);
    skipped.diagnosed++;
    diagnosed.push({fixture,result,prediction_date:row.event.prediction_date});
  }
  const picks=diagnosed.map(row=>row.result.pick).filter(Boolean)
    .sort((a,b)=>Date.parse(a.kickoff||0)-Date.parse(b.kickoff||0));
  const skipCounts=diagnosed.filter(row=>!row.result.pick).reduce((map,row)=>{
    const key=row.result.skip||'unknown';
    map[key]=(map[key]||0)+1;
    return map;
  },{});
  return{week,candidates:candidates.length,picks,skipCounts,skipped,diagnosed};
}

async function publish(week,picks,generatedAt){
  if(!configured())throw new Error('Supabase is not configured for the Elite publisher');
  const rows=picks.map(pick=>normalizeRow(pick,accraDate(pick.kickoff)||week.today,generatedAt));
  for(const date of week.dates){
    await remove('sporty_elite_picks',{prediction_date:`eq.${date}`,source:'eq.stats2pitch'});
  }
  if(rows.length)await upsert('sporty_elite_picks',rows,{onConflict:'id'});
  const byDate=rows.reduce((map,row)=>{map[row.prediction_date]=(map[row.prediction_date]||0)+1;return map},{});
  return{count:rows.length,byDate};
}

async function main(){
  const generatedAt=new Date().toISOString();
  const week=accraWeek();
  const collected=await collectQualifyingFixtures(week);
  const published=configured()?await publish(week,collected.picks,generatedAt):{count:collected.picks.length,byDate:{},dryRun:true};
  const summary={
    ok:true,
    week:{monday:week.monday,sunday:week.sunday},
    candidates:collected.candidates,
    published:published.count,
    dryRun:published.dryRun===true,
    skipCounts:collected.skipCounts,
    byDate:published.byDate,
    sample:collected.picks.slice(0,8).map(pick=>({fixture:`${pick.home} vs ${pick.away}`,kickoff:pick.kickoff,market:pick.market,pick:pick.displaySelection,odds:pick.odds}))
  };
  console.log(JSON.stringify(summary));
  if(!published.count){
    console.error('[sportybet-elite] no qualifying Elite picks this week');
    process.exitCode=1;
  }
}

const isMain=process.argv[1]&&String(process.argv[1]).endsWith('generate-sportybet-elite.mjs');
if(isMain)main().catch(error=>{console.error(`[sportybet-elite] ${error.message}`);process.exitCode=1});
