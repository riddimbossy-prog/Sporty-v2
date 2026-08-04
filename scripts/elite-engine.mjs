import { createHash } from 'node:crypto';

const text=value=>String(value??'').trim();
const number=value=>{const parsed=Number(String(value??'').replace(/,/g,''));return Number.isFinite(parsed)?parsed:0};
const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,number(value)));
const slug=value=>text(value).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
const canonical=value=>slug(value).replace(/\b(fc|cf|sc|afc|club)\b/g,'').replace(/\s+/g,' ').trim();
const safeDate=value=>{const date=value?new Date(value):null;return date&&Number.isFinite(date.getTime())?date.toISOString():null};
const dayKey=value=>safeDate(value)?.slice(0,10)||'undated';
const mean=values=>{const valid=values.map(number).filter(value=>Number.isFinite(value));return valid.length?valid.reduce((a,b)=>a+b,0)/valid.length:0};
const unique=values=>[...new Set(values.filter(Boolean))];
const round=(value,digits=1)=>Number(number(value).toFixed(digits));

function fixtureTeams(fixture){
  const source=text(fixture).replace(/\s+/g,' ');
  const parts=source.split(/\s+(?:vs\.?|v\.?|—|-|:)\s+/i).map(text).filter(Boolean);
  return{home:parts[0]||source,away:parts[1]||''};
}

function tipKey(tip){return[dayKey(tip.kickoff),canonical(tip.fixture),canonical(tip.market),canonical(tip.pick)].join('|')}
function fixtureKey(tip){return[dayKey(tip.kickoff),canonical(tip.fixture)].join('|')}
function sourceName(item){return text(item.author)||text(item.tipster)||text(item.source_name)||`Code ${text(item.code)}`}
function parseThreshold(value){const match=text(value).replace(',','.').match(/(?:over|under|o|u)?\s*([0-9]+(?:\.[0-9]+)?)/i);return match?number(match[1]):null}

export function marketSignature(tip){
  const market=slug(tip.market);const pick=slug(tip.pick);const combined=`${market} ${pick}`;const threshold=parseThreshold(combined);
  if(/both teams|btts|\bgg\b|\bng\b/.test(combined))return{family:'BTTS',direction:/\bno\b|\bng\b/.test(combined)?'no':'yes',threshold:null};
  if(/double chance|\b1x\b|\bx2\b|\b12\b/.test(combined)){
    const outcomes=/\b1x\b/.test(combined)?['H','D']:/\bx2\b/.test(combined)?['D','A']:['H','A'];return{family:'Double Chance',direction:outcomes.join(''),outcomes,threshold:null};
  }
  if(/draw no bet|\bdnb\b/.test(combined))return{family:'DNB',direction:/away|team 2|\b2\b/.test(pick)?'A':'H',outcomes:/away|team 2|\b2\b/.test(pick)?['A']:['H'],threshold:null};
  if(/team total|team goals|home team|away team/.test(combined)&&/over|under/.test(combined))return{family:'Team Goals',direction:/under/.test(combined)?'under':'over',threshold,team:/away/.test(combined)?'away':/home/.test(combined)?'home':'team'};
  if(/over|under|total goals|goals/.test(combined))return{family:'Goals',direction:/under/.test(combined)?'under':'over',threshold};
  if(/home win|away win|match winner|1x2|full time result|\bdraw\b/.test(combined)){
    const direction=/draw/.test(pick)?'D':/away|team 2|\b2\b/.test(pick)?'A':'H';return{family:'1X2',direction,outcomes:[direction],threshold:null};
  }
  return{family:'Other',direction:canonical(tip.pick),threshold};
}

export function isOpposition(a,b){
  const sa=marketSignature(a),sb=marketSignature(b);const resultFamilies=new Set(['1X2','Double Chance','DNB']);
  if(sa.outcomes&&sb.outcomes&&resultFamilies.has(sa.family)&&resultFamilies.has(sb.family))return sa.outcomes.every(value=>!sb.outcomes.includes(value));
  if(sa.family!==sb.family)return false;
  if(['Goals','Team Goals'].includes(sa.family)){
    if(sa.family==='Team Goals'&&sa.team!==sb.team)return false;
    return sa.direction!==sb.direction&&sa.threshold!==null&&sb.threshold!==null&&Math.abs(sa.threshold-sb.threshold)<0.01;
  }
  if(sa.outcomes&&sb.outcomes)return sa.outcomes.every(value=>!sb.outcomes.includes(value));
  return sa.direction!==sb.direction;
}

function jaccard(a,b){if(!a.size&&!b.size)return 1;let shared=0;for(const value of a)if(b.has(value))shared++;return shared/(a.size+b.size-shared||1)}

function buildSlips(feed){
  const slips=(feed?.items||[]).map(item=>{
    const tips=(item.tips||[]).filter(tip=>text(tip.fixture)&&text(tip.market)&&text(tip.pick));
    return{item,code:text(item.code),source:sourceName(item),sourceKey:slug(sourceName(item)),tips,tipSet:new Set(tips.map(tipKey)),createdAt:safeDate(item.created_at||feed.generated_at)};
  }).filter(slip=>slip.tips.length);
  const clusters=[];
  for(const slip of slips){
    let best=null,bestScore=0;
    for(const cluster of clusters){const score=jaccard(slip.tipSet,cluster.representative.tipSet);if(score>bestScore){best=cluster;bestScore=score}}
    if(best&&bestScore>=0.78&&Math.min(slip.tipSet.size,best.representative.tipSet.size)>=2){best.members.push(slip);slip.clusterId=best.id;slip.similarity=bestScore}
    else{const cluster={id:`cluster-${clusters.length+1}`,representative:slip,members:[slip]};clusters.push(cluster);slip.clusterId=cluster.id;slip.similarity=0}
  }
  return slips;
}

function sourceReliabilityMap(sourceStats){const map=new Map();for(const row of sourceStats?.sources||[])map.set(slug(row.source),number(row.reliability_score));return map}

export function discoverEliteCandidates(feed,{sourceStats={sources:[]},tipHistory={tips:[]},minAppearances=5,minIndependent=3}={}){
  const slips=buildSlips(feed);const grouped=new Map();const fixtureTips=new Map();const reliability=sourceReliabilityMap(sourceStats);const historyMap=new Map((tipHistory?.tips||[]).map(row=>[text(row.key),row]));
  for(const slip of slips){
    for(const tip of slip.tips){
      const key=tipKey(tip);if(!grouped.has(key))grouped.set(key,{key,day:dayKey(tip.kickoff),fixture:text(tip.fixture),market:text(tip.market),pick:text(tip.pick),league:text(tip.league)||null,kickoff:safeDate(tip.kickoff),observations:[]});
      grouped.get(key).observations.push({slip,tip});
      const fk=fixtureKey(tip);if(!fixtureTips.has(fk))fixtureTips.set(fk,[]);fixtureTips.get(fk).push({slip,tip,key});
    }
  }
  const totalIndependent=Math.max(1,new Set(slips.map(slip=>slip.clusterId)).size);const output=[];
  for(const row of grouped.values()){
    const appearances=row.observations.length;const clusters=new Set(row.observations.map(item=>item.slip.clusterId));const sources=new Set(row.observations.map(item=>item.slip.sourceKey));const independent=clusters.size;
    const duplicateRate=appearances?Math.max(0,(appearances-independent)/appearances*100):0;
    const allFixture=fixtureTips.get([row.day,canonical(row.fixture)].join('|'))||[];
    const opposition=allFixture.filter(observation=>observation.key!==row.key&&isOpposition(row,observation.tip));
    const oppositionClusters=new Set(opposition.map(item=>item.slip.clusterId));const oppositionShare=(independent+oppositionClusters.size)?oppositionClusters.size/(independent+oppositionClusters.size)*100:0;
    const sourceScores=[...sources].map(source=>reliability.get(source)).filter(value=>value>0);const reliabilityScore=sourceScores.length?mean(sourceScores):50;
    const history=historyMap.get(row.key);const observations=number(history?.observations);const consensus={
      independent_agreement:18*Math.min(independent/8,1),source_history:12*(reliabilityScore/100),addition_strength:8*Math.min(appearances/12,1),low_opposition:6*(1-Math.min(oppositionShare,100)/100),stability:observations>=3?4:observations>=1?2:1,copy_protection:2*(1-Math.min(duplicateRate,100)/100)
    };
    const consensusScore=round(Object.values(consensus).reduce((sum,value)=>sum+value,0));
    const signature=marketSignature(row);const averageOdds=mean(row.observations.map(item=>item.tip.odds).filter(Boolean));const teams=fixtureTeams(row.fixture);
    const candidate={
      id:createHash('sha256').update(row.key).digest('hex').slice(0,16),...row,home_team:teams.home,away_team:teams.away,signature,appearances,independent_groups:independent,independent_sources:Math.min(independent,sources.size),unique_sources:sources.size,source_names:unique(row.observations.map(item=>item.slip.source)).slice(0,12),codes:unique(row.observations.map(item=>item.slip.code)).slice(0,20),average_odds:averageOdds?round(averageOdds,2):null,opposition_sources:oppositionClusters.size,opposition_share:round(oppositionShare),duplicate_rate:round(duplicateRate),source_reliability:round(reliabilityScore),consensus_components:Object.fromEntries(Object.entries(consensus).map(([key,value])=>[key,round(value)])),consensus_score:consensusScore,history_observations:observations
    };
    if(appearances>=minAppearances&&independent>=minIndependent)output.push(candidate);
  }
  return output.sort((a,b)=>b.consensus_score-a.consensus_score||b.independent_sources-a.independent_sources||b.appearances-a.appearances);
}

function flatten(value,prefix='',output={}){
  if(value==null)return output;
  if(Array.isArray(value)){value.forEach((entry,index)=>flatten(entry,`${prefix}.${index}`,output));return output}
  if(typeof value==='object'){for(const[key,entry]of Object.entries(value))flatten(entry,prefix?`${prefix}.${key}`:key,output);return output}
  output[slug(prefix).replace(/\s+/g,'_')]=value;return output;
}
function numericFrom(flat,patterns){for(const pattern of patterns){for(const[key,value]of Object.entries(flat)){if(pattern.test(key)){const parsed=number(value);if(Number.isFinite(parsed))return parsed}}}return 0}
function stringFrom(flat,patterns){for(const pattern of patterns){for(const[key,value]of Object.entries(flat)){if(pattern.test(key)&&text(value))return text(value)}}return''}
function rate(value,matches){const numeric=number(value);if(numeric>=0&&numeric<=1)return numeric*100;if(matches>0&&numeric>=0&&numeric<=matches)return numeric/matches*100;if(numeric>1&&numeric<=100)return numeric;if(matches>0)return numeric/matches*100;return 0}

function findSides(payload){
  const queue=[payload];const seen=new Set();
  while(queue.length){const current=queue.shift();if(!current||typeof current!=='object'||seen.has(current))continue;seen.add(current);
    const keys=Object.keys(current);const homeKey=keys.find(key=>/^home(?:_team)?$/i.test(key));const awayKey=keys.find(key=>/^away(?:_team)?$/i.test(key));
    if(homeKey&&awayKey&&typeof current[homeKey]==='object'&&typeof current[awayKey]==='object')return{home:current[homeKey],away:current[awayKey],root:current};
    for(const value of Object.values(current))if(value&&typeof value==='object')queue.push(value);
  }
  return{home:payload?.home||{},away:payload?.away||{},root:payload||{}};
}

function normaliseSide(raw){
  const flat=flatten(raw);let matches=numericFrom(flat,[/(^|_)matches(_played)?$/,/(^|_)played$/,/(^|_)mp$/]);
  const wins=numericFrom(flat,[/(^|_)wins?$/,/(^|_)w$/]);const draws=numericFrom(flat,[/(^|_)draws?$/,/(^|_)d$/]);const losses=numericFrom(flat,[/(^|_)loss(?:es)?$/,/(^|_)l$/]);if(!matches)matches=wins+draws+losses;
  let goalsFor=numericFrom(flat,[/goals?_for$/,/(^|_)gf$/,/(^|_)scored$/,/(^|_)goals_scored$/]);let goalsAgainst=numericFrom(flat,[/goals?_against$/,/(^|_)ga$/,/(^|_)conceded$/,/(^|_)goals_conceded$/]);
  if(!goalsFor&&!goalsAgainst){const score=stringFrom(flat,[/(^|_)goals?$/,/(^|_)g$/]);const match=score.match(/(\d+)\s*[:\-]\s*(\d+)/);if(match){goalsFor=number(match[1]);goalsAgainst=number(match[2])}}
  const points=numericFrom(flat,[/(^|_)points?$/,/(^|_)pts$/]);const winRate=rate(numericFrom(flat,[/win_rate$/,/wins?_percentage$/]),matches)||rate(wins,matches);const lossRate=rate(numericFrom(flat,[/loss_rate$/,/losses?_percentage$/]),matches)||rate(losses,matches);
  const over15=rate(numericFrom(flat,[/over_?1_?5/,/o1_?5/]),matches);const over25=rate(numericFrom(flat,[/over_?2_?5/,/o2_?5/]),matches);const under35=rate(numericFrom(flat,[/under_?3_?5/,/u3_?5/]),matches);const btts=rate(numericFrom(flat,[/btts/,/both_teams.*score/,/(^|_)gg$/]),matches);const cleanSheets=rate(numericFrom(flat,[/clean_?sheets?/,/clean_sheet_rate/]),matches);const failToScore=rate(numericFrom(flat,[/fail.*score/,/failed.*score/,/fts/]),matches);
  const htLead=rate(numericFrom(flat,[/half.*lead/,/ht.*lead/]),matches);const htDraw=rate(numericFrom(flat,[/half.*draw/,/ht.*draw/]),matches);const form=stringFrom(flat,[/(^|_)form$/,/(^|_)recent_form$/]);
  return{matches,wins,draws,losses,goals_for:goalsFor,goals_against:goalsAgainst,points,win_rate:round(winRate),loss_rate:round(lossRate),ppg:matches?round(points/matches,2):0,gf_per_match:matches?round(goalsFor/matches,2):0,ga_per_match:matches?round(goalsAgainst/matches,2):0,gd_per_match:matches?round((goalsFor-goalsAgainst)/matches,2):0,over_1_5:round(over15),over_2_5:round(over25),under_3_5:round(under35),btts:round(btts),clean_sheets:round(cleanSheets),fail_to_score:round(failToScore),ht_lead:round(htLead),ht_draw:round(htDraw),form};
}

export function normaliseFixtureStats(payload){const sides=findSides(payload);const home=normaliseSide(sides.home);const away=normaliseSide(sides.away);const root=flatten(sides.root);const competition={average_goals:numericFrom(root,[/competition.*average.*goals/,/league.*average.*goals/,/(^|_)average_goals$/]),home_win_rate:rate(numericFrom(root,[/competition.*home_win/,/league.*home_win/]),100),draw_rate:rate(numericFrom(root,[/competition.*draw_rate/,/league.*draw_rate/]),100),away_win_rate:rate(numericFrom(root,[/competition.*away_win/,/league.*away_win/]),100)};return{home,away,competition,raw_complete:Boolean(home.matches&&away.matches)}}

function averageAvailable(values){const valid=values.filter(value=>number(value)>0);return valid.length?mean(valid):0}
function compareScore(value,neutral=50,scale=25){return clamp(neutral+number(value)*scale)}

export function verifyCandidate(candidate,payload){
  const stats=normaliseFixtureStats(payload);const home=stats.home,away=stats.away;const sig=candidate.signature;let support=0;let contradiction=false;let reasons=[];let components={venue_form:0,market_history:0,attack_defence:0,recent_form:0,competition_adjustment:0,streak_confirmation:0,data_completeness:0};
  const basicComplete=home.matches>=3&&away.matches>=3;const completeness=basicComplete?Math.min(100,((home.matches>0?1:0)+(away.matches>0?1:0)+(home.goals_for>0?1:0)+(away.goals_for>0?1:0)+(home.goals_against>=0?1:0)+(away.goals_against>=0?1:0))/6*100):0;
  components.data_completeness=2*(completeness/100);
  const homeAdv=(home.win_rate+away.loss_rate)/2;const awayAdv=(away.win_rate+home.loss_rate)/2;const ppgGap=home.ppg-away.ppg;const gdGap=home.gd_per_match-away.gd_per_match;
  if(sig.family==='1X2'||sig.family==='Double Chance'||sig.family==='DNB'){
    let direction=sig.direction;if(sig.family==='Double Chance'&&sig.outcomes?.includes('H')&&sig.outcomes?.includes('D'))direction='H';if(sig.family==='Double Chance'&&sig.outcomes?.includes('A')&&sig.outcomes?.includes('D'))direction='A';
    if(direction==='H'){
      components.venue_form=12*(clamp(homeAdv+Math.max(0,ppgGap)*8)/100);components.market_history=12*(averageAvailable([home.win_rate,away.loss_rate])/100);components.attack_defence=10*(clamp(50+gdGap*25)/100);components.recent_form=6*(clamp(50+ppgGap*20)/100);reasons.push(`Home venue profile ${round(homeAdv)}% supporting rate.`);if(homeAdv<40||ppgGap<-0.35){contradiction=true;reasons.push('Venue form contradicts the home direction.')}
    }else if(direction==='A'){
      components.venue_form=12*(clamp(awayAdv+Math.max(0,-ppgGap)*8)/100);components.market_history=12*(averageAvailable([away.win_rate,home.loss_rate])/100);components.attack_defence=10*(clamp(50-gdGap*25)/100);components.recent_form=6*(clamp(50-ppgGap*20)/100);reasons.push(`Away venue profile ${round(awayAdv)}% supporting rate.`);if(awayAdv<40||ppgGap>0.35){contradiction=true;reasons.push('Venue form contradicts the away direction.')}
    }else{
      const drawSupport=clamp(100-Math.abs(ppgGap)*35-Math.abs(gdGap)*25);components.venue_form=12*(drawSupport/100);components.market_history=12*(drawSupport/100);components.attack_defence=10*(drawSupport/100);components.recent_form=6*(drawSupport/100);if(drawSupport<40)contradiction=true;reasons.push(`Table compression score ${round(drawSupport)}.`)
    }
  }else if(sig.family==='Goals'||sig.family==='Team Goals'){
    const threshold=sig.threshold||2.5;let rateSupport=0;
    if(threshold<=1.5)rateSupport=averageAvailable([home.over_1_5,away.over_1_5]);else if(threshold<=2.5)rateSupport=averageAvailable([home.over_2_5,away.over_2_5]);else if(sig.direction==='under')rateSupport=averageAvailable([home.under_3_5,away.under_3_5]);
    const avgGoals=home.gf_per_match+home.ga_per_match+away.gf_per_match+away.ga_per_match;const goalSupport=sig.direction==='under'?clamp(100-(avgGoals/2)*22):clamp((avgGoals/2)*24);
    const teamSupport=sig.team==='home'?clamp((home.gf_per_match+away.ga_per_match)*40):sig.team==='away'?clamp((away.gf_per_match+home.ga_per_match)*40):goalSupport;
    const combined=averageAvailable([rateSupport,teamSupport]);components.venue_form=12*(combined/100);components.market_history=12*(rateSupport/100);components.attack_defence=10*(teamSupport/100);components.recent_form=6*(goalSupport/100);reasons.push(`Venue goal support ${round(combined)}.`);if(combined&&combined<38){contradiction=true;reasons.push('Venue goal history contradicts the selection.')}
  }else if(sig.family==='BTTS'){
    const bttsSupport=averageAvailable([home.btts,away.btts]);const scoringSupport=clamp(100-mean([home.fail_to_score,away.fail_to_score]));const concessionSupport=clamp(100-mean([home.clean_sheets,away.clean_sheets]));const combined=averageAvailable([bttsSupport,scoringSupport,concessionSupport]);const directionSupport=sig.direction==='no'?100-combined:combined;components.venue_form=12*(directionSupport/100);components.market_history=12*((sig.direction==='no'?100-bttsSupport:bttsSupport)/100);components.attack_defence=10*((sig.direction==='no'?100-scoringSupport:scoringSupport)/100);components.recent_form=6*(directionSupport/100);reasons.push(`BTTS statistical support ${round(directionSupport)}.`);if(directionSupport&&directionSupport<38){contradiction=true;reasons.push('Scoring and clean-sheet records contradict the selection.')}
  }else{
    support=0;reasons.push('This market does not yet have a dedicated statistical verifier.');
  }
  const leagueGoals=number(stats.competition.average_goals);components.competition_adjustment=leagueGoals?5*(sig.family==='Goals'&&sig.direction==='over'?clamp(leagueGoals/3*100)/100:sig.family==='Goals'&&sig.direction==='under'?clamp((4-leagueGoals)/3*100)/100:.6):2.5;
  const formText=`${home.form} ${away.form}`.trim();components.streak_confirmation=formText?3:1.5;
  support=Object.values(components).reduce((sum,value)=>sum+value,0);if(!basicComplete)support=Math.min(support,28);
  return{score:round(support),complete:basicComplete,contradiction,components:Object.fromEntries(Object.entries(components).map(([key,value])=>[key,round(value)])),reasons:unique(reasons).slice(0,5),stats:{home,away,competition:stats.competition}};
}

export function classifyElite(candidate,verification){
  const total=round(candidate.consensus_score+verification.score,0);let classification='trending';
  if(!verification.contradiction&&verification.complete&&total>=85&&candidate.consensus_score>=38&&verification.score>=40&&candidate.independent_sources>=5)classification='elite_verified';
  else if(!verification.contradiction&&verification.complete&&total>=75&&candidate.consensus_score>=34&&verification.score>=34&&candidate.independent_sources>=3)classification='elite_supported';
  else if(verification.contradiction)classification='rejected';
  const label={elite_verified:'Elite Verified',elite_supported:'Elite Supported',trending:'Trending',rejected:'Rejected'}[classification];
  return{...candidate,statistical_score:verification.score,statistical_components:verification.components,statistical_complete:verification.complete,statistical_contradiction:verification.contradiction,statistics:verification.stats,elite_score:total,classification,label,reason:verification.reasons.join(' '),verified_at:new Date().toISOString()};
}
