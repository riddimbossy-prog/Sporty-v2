import { remove, upsert, configured } from '../server/lib/supabase.mjs';

const text=value=>String(value??'').trim();
const dateForZone=()=>new Intl.DateTimeFormat('en-CA',{timeZone:text(process.env.APP_TIMEZONE)||'Africa/Accra',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const required=name=>{const value=text(process.env[name]);if(!value)throw new Error(`${name} is required`);return value};

function baseUrl(){
  const raw=required('STATS2PITCH_BASE_URL').replace(/\/+$/,'');
  return raw;
}

function normalize(item,date,generatedAt){
  return{
    id:text(item.id)||`stats2pitch-${text(item.source_fixture_id)}-${text(item.market)}-${text(item.pick)}`,
    source:'stats2pitch',
    source_fixture_id:text(item.source_fixture_id)||null,
    prediction_date:date,
    fixture:text(item.fixture)||'Fixture',
    home_team:text(item.home_team)||null,
    away_team:text(item.away_team)||null,
    league:text(item.league)||null,
    country:text(item.country)||null,
    kickoff:item.kickoff||null,
    market:text(item.market)||'Market',
    pick:text(item.pick)||'Selection',
    odds:Number.isFinite(Number(item.average_odds))?Number(item.average_odds):null,
    classification:['elite_strong','elite_supported'].includes(text(item.classification))?text(item.classification):'elite_supported',
    label:text(item.label)||'Stats2Pitch Elite',
    elite_score:Number.isFinite(Number(item.elite_score))?Number(item.elite_score):null,
    engine_rating:Number.isFinite(Number(item.engine_rating))?Number(item.engine_rating):null,
    family_count:Number.isFinite(Number(item.family_count))?Number(item.family_count):null,
    families:Array.isArray(item.families)?item.families:[],
    contradiction:text(item.contradiction)||'LOW',
    reason:text(item.reason)||'Qualified by Stats2Pitch.',
    status:'upcoming',
    source_generated_at:generatedAt||item.last_verified_at||null,
    imported_at:new Date().toISOString()
  };
}

async function main(){
  if(!configured())throw new Error('Supabase is not configured for the sync job');
  const date=text(process.env.PREDICTION_DATE)||dateForZone();
  const url=new URL(`${baseUrl()}/api/export/elite`);
  url.searchParams.set('date',date);
  url.searchParams.set('limit','10');
  const response=await fetch(url,{headers:{Accept:'application/json',Authorization:`Bearer ${required('STATS2PITCH_ELITE_FEED_TOKEN')}`}});
  const raw=await response.text();
  let payload={};try{payload=raw?JSON.parse(raw):{}}catch{throw new Error('Stats2Pitch returned unreadable JSON')}
  if(!response.ok)throw new Error(`Stats2Pitch Elite export failed: HTTP ${response.status}${payload?.error?` - ${payload.error}`:''}`);
  const rows=(Array.isArray(payload.items)?payload.items:[]).slice(0,10).map(item=>normalize(item,date,payload.generated_at));
  await remove('sporty_elite_picks',{prediction_date:`eq.${date}`,source:'eq.stats2pitch'});
  if(rows.length)await upsert('sporty_elite_picks',rows,{onConflict:'id'});
  console.log(JSON.stringify({ok:true,date,count:rows.length,source:'stats2pitch',generated_at:payload.generated_at||null}));
}

main().catch(error=>{console.error(`[stats2pitch-elite-sync] ${error.message}`);process.exitCode=1});
