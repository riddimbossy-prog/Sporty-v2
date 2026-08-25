const ENGINE_VERSION='away-fav-streak-v1'
const FINISHED=new Set(['FT','AET','PEN'])
const FORM_SAMPLE=5

export const ENGINE_ID='away-fav-streak-v1'
export const RULES=Object.freeze({
  streakMin:1.10,
  streakMax:1.49,
  streakSweetMin:1.15,
  streakSweetMax:1.35,
  bothO05Max:1.30,
  bothO05Tight:1.22,
  awayO15Max:1.50,
  homeO05Weak:1.60,
  homeO05VeryWeak:1.80,
  awayWinMax:1.55,
  publishedCheap:1.20,
  topN:5,
  bottomN:3,
  minVenueMatches:5,
  similarPpg:0.35,
  similarGf:0.40,
  similarGa:0.40,
  ppgGapBoost:0.80,
  baseScore:60,
  bonusStreakSweet:12,
  bonusTightBtts:10,
  bonusAwayTwoPlus:8,
  bonusPpgGap:6,
  penaltyCheap:8,
  strongAt:78,
  supportedAt:64,
  maxPicks:10,
  streakProxyFactor:1.08
})

const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))
const num=v=>finite(v)?Number(v):null
const round2=v=>Math.round(Number(v)*100)/100
const text=v=>String(v??'').trim()
const norm=s=>text(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9.]+/g,' ').trim()
const done=f=>FINISHED.has(String(f?.fixture?.status?.short||'').toUpperCase())
const atVenue=(f,id,venue)=>venue==='home'?String(f?.teams?.home?.id)===String(id):String(f?.teams?.away?.id)===String(id)

function oddOf(markets,key,names){
  const market=(markets||[]).find(m=>m?.marketKey===key)
  if(!market)return null
  for(const name of names){
    const hit=(market.outcomes||[]).find(o=>norm(o?.name)===norm(name))
    const price=num(hit?.odd)
    if(price)return price
  }
  return null
}

function scanOdd(markets,test){
  for(const market of markets||[]){
    for(const outcome of market.outcomes||[]){
      const price=num(outcome?.odd)
      if(!price)continue
      if(test(norm(market.marketKey),norm(market.market),norm(outcome.name)))return price
    }
  }
  return null
}

function isStreakName(key,market,name){
  const blob=`${key} ${market} ${name}`
  return /goal(?:s)? streak/.test(blob)||/streak 2/.test(blob)||/2 (?:goal )?streak/.test(blob)||/consecutive goals/.test(blob)||key==='goals-streak-2'||key==='goals streak 2'
}

function teamGoalOdd(markets,side,line,teamName){
  const key=side==='home'?'home-team-goals':'away-team-goals'
  const direct=oddOf(markets,key,[`Over ${line}`,`O ${line}`])
  if(direct)return direct
  const wanted=norm(teamName)
  return scanOdd(markets,(marketKey,market,name)=>{
    if(!/over/.test(name)||!name.includes(String(line)))return false
    if(marketKey===key)return true
    if(marketKey!=='team-goals'&&!/team goals/.test(market)&&!/team total/.test(market))return false
    if(side==='home'&&(/home/.test(name)||(wanted&&name.includes(wanted))))return true
    if(side==='away'&&(/away/.test(name)||(wanted&&name.includes(wanted))))return true
    return false
  })
}

export function extractOdds(fixture){
  const markets=fixture?.marketOdds||[]
  const homeName=fixture?.home?.name||''
  const awayName=fixture?.away?.name||''
  const awayO05=teamGoalOdd(markets,'away',0.5,awayName)
  const awayO15=teamGoalOdd(markets,'away',1.5,awayName)
  const homeO05=teamGoalOdd(markets,'home',0.5,homeName)
  const homeO15=teamGoalOdd(markets,'home',1.5,homeName)
  const over15=oddOf(markets,'total-goals',['Over 1.5','O 1.5'])
  const awayWin=oddOf(markets,'match-winner',['Away','2'])
  const bttsYes=oddOf(markets,'both-teams-score',['Yes'])
  let streak=scanOdd(markets,(key,market,name)=>isStreakName(key,market,name)&&/yes/.test(name))
  if(!streak)streak=oddOf(markets,'goals-streak-2',['Yes'])
  let streakSource=streak?'market':null
  if(!streak&&awayO15){
    streak=round2(awayO15*RULES.streakProxyFactor)
    streakSource='proxy-away-o15'
  }
  return{awayO05,awayO15,homeO05,homeO15,over15,awayWin,bttsYes,streak,streakSource}
}

export function venueMetrics(fixtures,teamId,venue){
  const rows=(fixtures||[]).filter(f=>done(f)&&atVenue(f,teamId,venue))
    .sort((a,b)=>Date.parse(b?.fixture?.date||0)-Date.parse(a?.fixture?.date||0))
    .slice(0,FORM_SAMPLE)
  let points=0,gf=0,ga=0,played=0
  for(const row of rows){
    const h=num(row?.goals?.home),a=num(row?.goals?.away)
    if(h===null||a===null)continue
    const own=venue==='home'?h:a,opp=venue==='home'?a:h
    played++
    gf+=own
    ga+=opp
    points+=own>opp?3:own===opp?1:0
  }
  return{
    played,
    ready:played>=RULES.minVenueMatches,
    ppg:played?round2(points/played):null,
    gf:played?round2(gf/played):null,
    ga:played?round2(ga/played):null
  }
}

function tableGate(homeSplit,awaySplit){
  const hp=num(homeSplit?.position),ap=num(awaySplit?.position)
  const hs=num(homeSplit?.size),as=num(awaySplit?.size)
  if(!hp||!ap||!hs||!as)return{ok:false,skip:'table-unverified'}
  if(hp<=RULES.topN&&ap<=RULES.topN)return{ok:false,skip:'both-top-five'}
  if(hp>hs-RULES.bottomN&&ap>as-RULES.bottomN)return{ok:false,skip:'both-bottom-three'}
  return{ok:true,skip:null}
}

function similarForm(home,away){
  if(home.ppg===null||away.ppg===null||home.gf===null||away.gf===null||home.ga===null||away.ga===null)return true
  return Math.abs(away.ppg-home.ppg)<RULES.similarPpg
    &&Math.abs(away.gf-home.gf)<RULES.similarGf
    &&Math.abs(away.ga-home.ga)<RULES.similarGa
}

function scorePick(odds,home,away,route,published){
  let score=RULES.baseScore
  const reasons=[]
  if(odds.streak>=RULES.streakSweetMin&&odds.streak<=RULES.streakSweetMax){
    score+=RULES.bonusStreakSweet
    reasons.push(`Goals Streak 2+ sits in the sweet band at ${odds.streak.toFixed(2)}.`)
  }else{
    reasons.push(`Goals Streak 2+ Yes ${odds.streak.toFixed(2)} is inside the 1.10–1.49 universe.`)
  }
  if(route==='btts'&&odds.awayO05<=RULES.bothO05Tight&&odds.homeO05<=RULES.bothO05Tight){
    score+=RULES.bonusTightBtts
    reasons.push(`Both team-goal Over 0.5 prices are ≤ ${RULES.bothO05Tight.toFixed(2)}, so BTTS is the first-match route.`)
  }
  if(odds.awayO15<RULES.awayO15Max&&odds.homeO05>=RULES.homeO05VeryWeak){
    score+=RULES.bonusAwayTwoPlus
    reasons.push(`Away Over 1.5 ${odds.awayO15.toFixed(2)} against a home Over 0.5 of ${odds.homeO05.toFixed(2)}.`)
  }
  const ppgGap=round2(away.ppg-home.ppg)
  if(ppgGap>=RULES.ppgGapBoost){
    score+=RULES.bonusPpgGap
    reasons.push(`Away venue PPG leads by ${ppgGap.toFixed(2)}.`)
  }
  if(published<RULES.publishedCheap){
    score-=RULES.penaltyCheap
    reasons.push(`Published pick odds ${published.toFixed(2)} are below 1.20.`)
  }
  score=Math.max(0,Math.min(100,score))
  const classification=score>=RULES.strongAt?'elite_strong':score>=RULES.supportedAt?'elite_supported':'drop'
  return{score,classification,reasons}
}

function routePick(odds){
  if(odds.awayO05<RULES.bothO05Max&&odds.homeO05<RULES.bothO05Max){
    if(!odds.bttsYes)return{skip:'btts-odds-missing'}
    return{route:'btts',market:'both-teams-score',selection:'Yes',displaySelection:'BTTS · Yes',odds:odds.bttsYes,family:'BTTS'}
  }
  if(odds.awayO15<RULES.awayO15Max&&odds.homeO05>RULES.homeO05Weak){
    if(odds.awayWin&&odds.awayWin<=RULES.awayWinMax){
      return{route:'away-win',market:'match-winner',selection:'Away',displaySelection:'1X2 · Away',odds:odds.awayWin,family:'1X2'}
    }
    return{route:'away-o15',market:'away-team-goals',selection:'Over 1.5',displaySelection:'Away Team · Over 1.5',odds:odds.awayO15,family:'Team Goals'}
  }
  if(odds.awayO15<RULES.awayO15Max&&odds.homeO05<=RULES.homeO05Weak){
    if(!odds.over15)return{skip:'over15-odds-missing'}
    return{route:'over-15',market:'total-goals',selection:'Over 1.5',displaySelection:'Over 1.5',odds:odds.over15,family:'Goals'}
  }
  return{skip:'no-route'}
}

function packPick(fixture,odds,home,away,routed,rating){
  const families=['Streak 2+','Team Goals',routed.family].filter((value,index,all)=>all.indexOf(value)===index)
  return{
    fixtureId:fixture.fixtureId,
    league:fixture.league,
    country:fixture.country,
    kickoff:fixture.kickoff,
    home:fixture.home?.name,
    away:fixture.away?.name,
    homeLogo:fixture.home?.logo||null,
    awayLogo:fixture.away?.logo||null,
    market:routed.market,
    marketName:routed.displaySelection,
    selection:routed.selection,
    displaySelection:routed.displaySelection,
    pick:routed.displaySelection,
    odds:+Number(routed.odds).toFixed(2),
    engineRating:rating.score,
    elite_score:rating.score,
    classification:rating.classification,
    priorityLabel:rating.classification==='elite_strong'?'ELITE':'SUPPORTED',
    contradiction:'LOW',
    filterFamilies:families,
    families,
    familyCount:families.length,
    shortReason:rating.reasons[0]||'Away-Fav Streak route qualified.',
    reason:rating.reasons.join(' • '),
    reasons:rating.reasons,
    engine:ENGINE_ID,
    engineVersion:ENGINE_VERSION,
    route:routed.route,
    streakSource:odds.streakSource,
    oddsBook:{
      streak:odds.streak,
      awayO05:odds.awayO05,
      awayO15:odds.awayO15,
      homeO05:odds.homeO05,
      homeO15:odds.homeO15,
      awayWin:odds.awayWin,
      bttsYes:odds.bttsYes,
      over15:odds.over15
    },
    homeSplit:fixture.homeSplit||null,
    awaySplit:fixture.awaySplit||null,
    metrics:{home,away},
    earlySeason:fixture.earlySeason===true
  }
}

export function diagnoseAwayFavFixture(fixture){
  const odds=extractOdds(fixture)
  if(!odds.streak||!odds.awayO05||!odds.awayO15||!odds.homeO05){
    return{pick:null,skip:'missing-odds',odds}
  }
  if(odds.streak<RULES.streakMin||odds.streak>RULES.streakMax){
    return{pick:null,skip:'streak-window',odds}
  }
  if(odds.homeO15&&odds.homeO15<odds.awayO15){
    return{pick:null,skip:'fav-is-home',odds}
  }
  const table=tableGate(fixture?.homeSplit,fixture?.awaySplit)
  if(!table.ok)return{pick:null,skip:table.skip,odds}
  const home=venueMetrics(fixture?.home?.fixtures,fixture?.home?.id,'home')
  const away=venueMetrics(fixture?.away?.fixtures,fixture?.away?.id,'away')
  if(fixture?.earlySeason===true||!home.ready||!away.ready){
    return{pick:null,skip:'early-season',odds,home,away}
  }
  if(similarForm(home,away)){
    return{pick:null,skip:'similar-form',odds,home,away}
  }
  const routed=routePick(odds)
  if(routed.skip)return{pick:null,skip:routed.skip,odds,home,away}
  const rating=scorePick(odds,home,away,routed.route,routed.odds)
  if(rating.classification==='drop'){
    return{pick:null,skip:'score-floor',odds,home,away,rating}
  }
  return{pick:packPick(fixture,odds,home,away,routed,rating),skip:null,odds,home,away,rating}
}

export function evaluateAwayFavFixture(fixture){
  return diagnoseAwayFavFixture(fixture).pick
}

export function buildAwayFavBoard(fixtures,meta={}){
  const diagnosed=(fixtures||[]).map(fixture=>({fixture,result:diagnoseAwayFavFixture(fixture)}))
  const qualified=diagnosed.map(row=>row.result.pick).filter(Boolean)
    .sort((a,b)=>b.engineRating-a.engineRating||Date.parse(a.kickoff||0)-Date.parse(b.kickoff||0))
  const best=qualified.slice(0,RULES.maxPicks)
  const skipped=diagnosed.filter(row=>!row.result.pick).reduce((map,row)=>{
    const key=row.result.skip||'unknown'
    map[key]=(map[key]||0)+1
    return map
  },{})
  return{
    meta:{
      ...meta,
      engineVersion:ENGINE_VERSION,
      engine:ENGINE_ID,
      minOdd:RULES.streakMin,
      maxOdd:RULES.streakMax,
      formSample:FORM_SAMPLE,
      qualified:qualified.length,
      bestPicks:best.length,
      skipped
    },
    priority:qualified,
    bestPicks:best,
    availableMarkets:[...new Set(best.map(row=>row.market))].sort()
  }
}

export function discoverEliteCandidates(){return []}
export function verifyCandidate(){return{score:0,complete:false,contradiction:true,components:{},reasons:['Booking-code consensus Elite engine has been replaced by Away-Fav Streak.'],stats:{home:{},away:{},competition:{}}}}
export function classifyElite(candidate={},verification={}){return{...candidate,classification:'rejected',label:'Rejected',elite_score:0,reason:verification?.reasons?.[0]||'Away-Fav Streak replaced the consensus Elite engine.',verified_at:new Date().toISOString()}}
export function normaliseFixtureStats(){return{home:{matches:0,goals_for:0,goals_against:0},away:{matches:0,goals_for:0,goals_against:0},competition:{},raw_complete:false}}
