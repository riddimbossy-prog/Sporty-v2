(()=>{
  'use strict';

  const text=value=>String(value??'').trim();
  const dateValue=value=>{const d=value instanceof Date?value:new Date(value);return Number.isFinite(d.getTime())?d:null};
  const strip=value=>text(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/\b(fc|cf|sc|afc|club|women|w|u\d{2}|reserves?|reserve|ii|b)\b/g,' ')
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
  const tokens=value=>new Set(strip(value).split(' ').filter(token=>token.length>1));
  const overlap=(a,b)=>{
    const left=tokens(a),right=tokens(b);if(!left.size||!right.size)return 0;
    let shared=0;for(const token of left)if(right.has(token))shared++;
    return shared/Math.max(left.size,right.size);
  };
  function splitFixture(value){
    const raw=text(value).replace(/\s+/g,' ').trim();
    const parts=raw.split(/\s+(?:vs\.?|v\.?|versus|@|—|–|-)+\s+/i).map(text).filter(Boolean);
    return parts.length>=2?[parts[0],parts.slice(1).join(' ')]:[raw,''];
  }
  function normalizeEvent(row={}){
    const home=text(row.home_team||row.homeTeam||row.home||row.teams?.home?.name||row.homeTeamName);
    const away=text(row.away_team||row.awayTeam||row.away||row.teams?.away?.name||row.awayTeamName);
    const fixture=text(row.fixture||row.event||row.match||row.name)||(home&&away?`${home} vs ${away}`:'');
    const kickoff=row.kickoff||row.start_time||row.startTime||row.estimateStartTime||row.eventDate||row.date||null;
    const date=dateValue(typeof kickoff==='number'&&kickoff<1e12?kickoff*1000:kickoff);
    return{
      event_id:text(row.event_id||row.id||row.game_id||row.provider_fixture_id),
      home,away,fixture,
      league:text(row.league||row.competition||row.tournament||row.tournamentName),
      kickoff:date?date.toISOString():null,
      source:text(row.source||row.odds_source||'custom-api')
    };
  }
  function normalizeEvents(payload){
    const rows=Array.isArray(payload)?payload:Array.isArray(payload?.events)?payload.events:Array.isArray(payload?.items)?payload.items:[];
    return rows.map(normalizeEvent).filter(row=>row.fixture&&row.kickoff);
  }
  function eventScore(tip,event){
    const tipFixture=strip(tip.fixture),eventFixture=strip(event.fixture);
    if(!tipFixture||!eventFixture)return 0;
    if(tipFixture===eventFixture)return 1;
    const [tipHome,tipAway]=splitFixture(tip.fixture),[eventHome,eventAway]=[event.home,event.away];
    let score=overlap(tip.fixture,event.fixture)*0.58;
    if(tipHome&&eventHome)score+=overlap(tipHome,eventHome)*0.21;
    if(tipAway&&eventAway)score+=overlap(tipAway,eventAway)*0.21;
    const compactTip=tipFixture.replace(/\s/g,''),compactEvent=eventFixture.replace(/\s/g,'');
    if(compactTip&&compactEvent&&(compactTip.includes(compactEvent)||compactEvent.includes(compactTip)))score=Math.max(score,.91);
    if(tip.league&&event.league)score+=overlap(tip.league,event.league)*.04;
    return Math.min(1,score);
  }
  function plausible(value){
    const d=dateValue(value);if(!d)return false;
    const delta=d.getTime()-Date.now();
    return delta>=-(12*60*60*1000)&&delta<=10*86400000;
  }
  function reconcileTip(raw,events=[]){
    const tip={...raw};
    if(plausible(tip.kickoff))return tip;
    let best=null,bestScore=0;
    for(const event of events){
      if(!plausible(event.kickoff))continue;
      const score=eventScore(tip,event);
      if(score>bestScore){best=event;bestScore=score}
    }
    if(!best||bestScore<.76)return tip;
    return{
      ...tip,
      kickoff:best.kickoff,
      league:tip.league||best.league||null,
      event_id:tip.event_id||best.event_id||null,
      kickoff_source:'custom-api-events',
      kickoff_match_score:Number(bestScore.toFixed(3))
    };
  }

  window.SportyCustomApiMatch={normalizeEvent,normalizeEvents,eventScore,reconcileTip,splitFixture};
})();
