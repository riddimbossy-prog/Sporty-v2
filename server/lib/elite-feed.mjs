import { select, configured } from './supabase.mjs';
import { text, canonical } from './core.mjs';
import { getUpcomingEvents } from './data-service.mjs';

const localDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:text(process.env.APP_TIMEZONE)||'Africa/Accra',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const normalizeDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(text(value))?text(value):localDate();
const numeric=value=>{const n=Number(value);return Number.isFinite(n)?n:null};
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

function publicItem(row){
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
    classification:row.classification,
    label:row.label||'Stats2Pitch Elite',
    elite_score:row.engine_rating||row.elite_score||70,
    consensus_score:0,
    statistical_score:Math.round(Number(row.engine_rating||row.elite_score||70)/2),
    statistical_percent:Number(row.engine_rating||row.elite_score||70),
    independent_groups:0,
    independent_sources:0,
    total_additions:Number(row.family_count||0),
    source_reliability:Number(row.engine_rating||row.elite_score||70),
    opposition_level:String(row.contradiction||'LOW').toUpperCase()==='LOW'?'Low':'Moderate',
    opposition_share:String(row.contradiction||'LOW').toUpperCase()==='LOW'?5:20,
    trend:'Stats2Pitch verified',
    statistics_complete:true,
    last_verified_at:row.source_generated_at||row.imported_at,
    reason:row.reason,
    evidence:{source:'stats2pitch',families:Array.isArray(row.families)?row.families:[],family_count:Number(row.family_count||0),contradiction:row.contradiction},
    slip_item:{id:row.id,fixture,home_team:home||null,away_team:away||null,home_logo:text(row.home_logo)||null,away_logo:text(row.away_logo)||null,market:row.market,pick:row.pick,odds:row.odds,kickoff:row.kickoff,league:row.league,tier:row.label||'Stats2Pitch Elite'}
  };
}

function rankRows(rows){
  return [...rows].sort((a,b)=>{
    const ratingA=numeric(a?.engine_rating)??numeric(a?.elite_score)??0;
    const ratingB=numeric(b?.engine_rating)??numeric(b?.elite_score)??0;
    if(ratingB!==ratingA)return ratingB-ratingA;
    const familiesA=numeric(a?.family_count)??0;
    const familiesB=numeric(b?.family_count)??0;
    if(familiesB!==familiesA)return familiesB-familiesA;
    const kickoffA=Date.parse(a?.kickoff||'')||Number.MAX_SAFE_INTEGER;
    const kickoffB=Date.parse(b?.kickoff||'')||Number.MAX_SAFE_INTEGER;
    return kickoffA-kickoffB;
  });
}

export async function getStats2PitchElite({date,limit=10}={}){
  if(!configured())throw new Error('Elite database reader is not configured on the web service');
  const predictionDate=normalizeDate(date),safeLimit=Math.max(1,Math.min(10,Number(limit)||10));
  const rows=await select('sporty_elite_picks',{
    select:'*',
    source:'eq.stats2pitch',
    prediction_date:`eq.${predictionDate}`,
    limit:'50'
  });
  const current=(Array.isArray(rows)?rows:[]).filter(row=>{
    const status=text(row?.status).toLowerCase();
    return !status||!['settled','finished','cancelled','canceled','postponed','abandoned'].includes(status);
  });
  const enriched=await enrichMatchups(current);
  const items=rankRows(enriched).slice(0,safeLimit).map(publicItem);
  return{source:'stats2pitch',date:predictionDate,count:items.length,max:10,items};
}
