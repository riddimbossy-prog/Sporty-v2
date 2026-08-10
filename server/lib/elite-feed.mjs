import { select } from './supabase.mjs';
import { text } from './core.mjs';

const localDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:text(process.env.APP_TIMEZONE)||'Africa/Accra',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const normalizeDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(text(value))?text(value):localDate();

function publicItem(row){
  return{
    id:row.id,
    key:`${row.fixture}|${row.market}|${row.pick}`,
    fixture:row.fixture,
    home_team:row.home_team,
    away_team:row.away_team,
    league:row.league,
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
    slip_item:{id:row.id,fixture:row.fixture,market:row.market,pick:row.pick,odds:row.odds,kickoff:row.kickoff,league:row.league,tier:row.label||'Stats2Pitch Elite'}
  };
}

export async function getStats2PitchElite({date,limit=10}={}){
  const predictionDate=normalizeDate(date),safeLimit=Math.max(1,Math.min(10,Number(limit)||10));
  const rows=await select('sporty_elite_picks',{select:'*',source:'eq.stats2pitch',prediction_date:`eq.${predictionDate}`,status:'eq.upcoming',order:'engine_rating.desc.nullslast,family_count.desc.nullslast,kickoff.asc',limit:String(safeLimit)});
  const items=(Array.isArray(rows)?rows:[]).map(publicItem);
  return{source:'stats2pitch',date:predictionDate,count:items.length,max:10,items};
}
