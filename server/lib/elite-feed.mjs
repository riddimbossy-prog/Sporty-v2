import { select, configured } from './supabase.mjs';
import { text, canonical } from './core.mjs';
import { getUpcomingEvents } from './data-service.mjs';
import { accraWeek } from './week.mjs';

const localDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:text(process.env.APP_TIMEZONE)||'Africa/Accra',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const normalizeDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(text(value))?text(value):localDate();
const genericFixture=value=>!text(value)||/^(fixture|match)$/i.test(text(value));
const cleanPickTeam=value=>text(value)
  .replace(/\s+to win$/i,'')
  .replace(/\s+[—-]\s+draw no bet$/i,'')
  .replace(/\s+dnb$/i,'')
  .trim();

function fixtureId(event){
  return text(event?.provider_fixture_id||event?.game_id||event?.event_id).replace(/^api-football:/i,'');
}
function kickoffMs(value){const n=Date.parse(value||'');return Number.isFinite(n)?n:null}
function teamMatches(name,wanted){
  const a=canonical(name),b=canonical(wanted);
  if(!a||!b)return false;
  return a===b||a.includes(b)||b.includes(a);
}
function eventForRow(row,events){
  const sourceId=text(row?.source_fixture_id);
  if(sourceId){
    const exact=events.find(event=>fixtureId(event)===sourceId);
    if(exact)return exact;
  }

  const rowKickoff=kickoffMs(row?.kickoff);
  const rowLeague=canonical(row?.league);
  const pickedTeam=cleanPickTeam(row?.pick);
  const candidates=events.filter(event=>{
    const eventKickoff=kickoffMs(event?.kickoff||event?.start_time);
    if(rowKickoff&&eventKickoff&&Math.abs(rowKickoff-eventKickoff)>3*60*60*1000)return false;
    if(rowLeague&&canonical(event?.league)&&canonical(event?.league)!==rowLeague)return false;
    if(pickedTeam&&!/both teams|\bgg\b|\byes\b|\bno\b|over|under/i.test(pickedTeam)){
      if(!teamMatches(event?.home_team,pickedTeam)&&!teamMatches(event?.away_team,pickedTeam))return false;
    }
    return true;
  });
  return candidates.length===1?candidates[0]:null;
}
function enrichRow(row,event){
  if(!event)return row;
  const home=text(row?.home_team)||text(event?.home_team);
  const away=text(row?.away_team)||text(event?.away_team);
  const fixture=!genericFixture(row?.fixture)?text(row.fixture):(home&&away?`${home} vs ${away}`:text(row?.fixture));
  return{
    ...row,
    fixture:fixture||'Fixture',
    home_team:home||null,
    away_team:away||null,
    home_logo:text(row?.home_logo)||text(event?.home_logo||event?.home_team_logo)||null,
    away_logo:text(row?.away_logo)||text(event?.away_logo||event?.away_team_logo)||null,
    league_logo:text(row?.league_logo)||text(event?.league_logo)||null,
    league:text(row?.league)||text(event?.league)||null,
    country:text(row?.country)||text(event?.country)||null,
    kickoff:row?.kickoff||event?.kickoff||null
  };
}
async function enrichMatchups(rows){
  if(!Array.isArray(rows)||!rows.some(row=>genericFixture(row?.fixture)||!text(row?.home_team)||!text(row?.away_team)))return rows||[];
  try{
    const feed=await getUpcomingEvents({days:7});
    const events=Array.isArray(feed?.events)?feed.events:[];
    if(!events.length)return rows;
    return rows.map(row=>enrichRow(row,eventForRow(row,events)));
  }catch(error){
    console.warn('[elite-feed] matchup enrichment unavailable:',error?.message||error);
    return rows;
  }
}

export function toPublicEliteItem(row){
  const home=text(row.home_team),away=text(row.away_team);
  const fixture=!genericFixture(row.fixture)?text(row.fixture):(home&&away?`${home} vs ${away}`:'Fixture');
  return{
    id:row.id,
    key:`${fixture}|${row.market}|${row.pick}`,
    fixture,
    home_team:home||null,
    away_team:away||null,
    home_logo:text(row.home_logo)||null,
    away_logo:text(row.away_logo)||null,
    league_logo:text(row.league_logo)||null,
    league:row.league,
    country:row.country||null,
    kickoff:row.kickoff,
    market:row.market,
    pick:row.pick,
    average_odds:row.odds,
    last_verified_at:row.source_generated_at||row.imported_at,
    slip_item:{id:row.id,fixture,home_team:home||null,away_team:away||null,home_logo:text(row.home_logo)||null,away_logo:text(row.away_logo)||null,market:row.market,pick:row.pick,odds:row.odds,kickoff:row.kickoff,league:row.league}
  };
}

function rankRows(rows){
  return [...rows].sort((a,b)=>{
    const kickoffA=Date.parse(a?.kickoff||'')||Number.MAX_SAFE_INTEGER;
    const kickoffB=Date.parse(b?.kickoff||'')||Number.MAX_SAFE_INTEGER;
    if(kickoffA!==kickoffB)return kickoffA-kickoffB;
    return text(a?.fixture).localeCompare(text(b?.fixture));
  });
}

function currentRow(row){
  const status=text(row?.status).toLowerCase();
  if(status&&['settled','finished','cancelled','canceled','postponed','abandoned'].includes(status))return false;
  const label=text(row?.label).toLowerCase();
  const engine=text(row?.engine).toLowerCase();
  if(label&&!['elite','away-fav','streak','stats2pitch'].some(token=>label.includes(token)))return false;
  if(engine&&!engine.includes('away-fav')&&engine!=='elite')return false;
  return true;
}

export async function getStats2PitchElite({date}={}){
  if(!configured())throw new Error('Elite database reader is not configured on the web service');
  const week=accraWeek(date?new Date(`${normalizeDate(date)}T12:00:00Z`):new Date());
  const batches=await Promise.all(week.dates.map(predictionDate=>select('sporty_elite_picks',{
    select:'*',
    source:'eq.stats2pitch',
    prediction_date:`eq.${predictionDate}`,
    limit:'200'
  })));
  const current=batches.flat().filter(row=>row&&currentRow(row));
  const enriched=await enrichMatchups(current);
  const items=rankRows(enriched).map(toPublicEliteItem);
  return{source:'stats2pitch',week:{monday:week.monday,sunday:week.sunday},date:week.today,count:items.length,items};
}
