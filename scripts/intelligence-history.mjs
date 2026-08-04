import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const text=value=>String(value??'').trim();
const number=value=>{const parsed=Number(String(value??'').replace(/,/g,''));return Number.isFinite(parsed)?parsed:0};
const slug=value=>text(value).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
const canonical=value=>slug(value).replace(/\b(fc|cf|sc|afc|club)\b/g,'').replace(/\s+/g,' ').trim();
const safeDate=value=>{if(!value)return null;const date=new Date(value);return Number.isFinite(date.getTime())?date.toISOString():null};
const dayKey=value=>{const date=value?new Date(value):null;if(!date||!Number.isFinite(date.getTime()))return'undated';return date.toISOString().slice(0,10)};
const mean=values=>{const valid=values.map(number).filter(value=>value>0);return valid.length?valid.reduce((a,b)=>a+b,0)/valid.length:0};
const resultValue=value=>{const result=slug(value);if(['won','winner','win','settled won'].includes(result))return'won';if(['lost','lose','loss','settled lost','failed'].includes(result))return'lost';if(['void','push','cancelled','canceled','refunded'].includes(result))return'void';return'pending'};
const isVerifiedSettlement=item=>text(item?.settlement?.verification_status).toLowerCase()==='verified';

function categoryForTip(tip){const source=`${text(tip.market)} ${text(tip.pick)}`.toLowerCase();if(/both teams|btts|\bgg\b|\bng\b/.test(source))return'BTTS';if(/over|under|goal|team total|score/.test(source))return'Goals';if(/double chance|\b1x\b|\bx2\b|\b12\b|draw no bet|\bdnb\b/.test(source))return'Double Chance';if(/home win|away win|match winner|1x2|draw/.test(source))return'1X2';if(/corner/.test(source))return'Corners';if(/card/.test(source))return'Cards';return'Other'}
function tipKey(tip){return[dayKey(tip.kickoff),canonical(tip.fixture),canonical(tip.market),canonical(tip.pick)].join('|')}
function oddsBand(odds){const value=number(odds);if(!value)return'Unknown';if(value<=1.50)return'1.01–1.50';if(value<=2.00)return'1.51–2.00';if(value<=3.00)return'2.01–3.00';return'3.01+'}

async function readJson(path,fallback){try{return JSON.parse(await readFile(path,'utf8'))}catch{return fallback}}
async function writeJson(path,value){const temporary=`${path}.tmp`;await mkdir(dirname(path),{recursive:true});await writeFile(temporary,`${JSON.stringify(value,null,2)}\n`,'utf8');await rename(temporary,path)}
function pushUnique(array,value,limit=40){if(value&&!array.includes(value))array.push(value);if(array.length>limit)array.splice(0,array.length-limit)}
function pushObservation(array,value,limit=30){if(number(value)>0)array.push(Number(number(value).toFixed(2)));if(array.length>limit)array.splice(0,array.length-limit)}

export async function updateIntelligenceHistory(feed,options={}){
  const generatedAt=safeDate(feed.generated_at)||new Date().toISOString();
  const historyPath=resolve(options.historyPath||'data/tip-history.json');
  const sourcePath=resolve(options.sourcePath||'data/source-stats.json');
  const performancePath=resolve(options.performancePath||'data/performance-summary.json');
  const history=await readJson(historyPath,{version:3,updated_at:null,tips:[],codes:[]});
  const tipMap=new Map((history.tips||[]).map(row=>[row.key,{...row,verification_status:row.verification_status||(['won','lost','void'].includes(row.result)?'legacy_unverified':'pending')} ]));
  const codeMap=new Map((history.codes||[]).map(row=>[String(row.code||'').toUpperCase(),{...row,verification_status:row.verification_status||(['won','lost','void'].includes(row.result)?'legacy_unverified':'pending')} ]));

  for(const item of feed.items||[]){
    const code=text(item.code).toUpperCase();if(!code)continue;
    const verifiedCode=isVerifiedSettlement(item);
    const explicitCodeResult=resultValue(item.result||item.status);
    const codeResult=verifiedCode?explicitCodeResult:'pending';
    const source=text(item.author)||'Unlabelled source';
    const codeRow=codeMap.get(code)||{code,source,title:text(item.title)||'Code Hub pick',first_seen:generatedAt,last_seen:generatedAt,odds_observations:[],result:'pending',settled_at:null,verification_status:'pending',verification_method:null,evidence_url:null};
    codeRow.source=source;codeRow.title=text(item.title)||codeRow.title;codeRow.last_seen=generatedAt;codeRow.status=text(item.status)||'upcoming';pushObservation(codeRow.odds_observations,item.odds);
    if(codeResult!=='pending'){
      codeRow.result=codeResult;codeRow.settled_at=safeDate(item.settled_at)||safeDate(item.settlement?.verified_at)||generatedAt;codeRow.verification_status='verified';codeRow.verification_method=text(item.settlement?.method)||'source-feed';codeRow.evidence_url=/^https:\/\//i.test(text(item.settlement?.evidence_url||item.source_url))?text(item.settlement?.evidence_url||item.source_url):null;
    }
    codeMap.set(code,codeRow);

    for(const tip of item.tips||[]){
      const key=tipKey(tip);if(!key.replace(/\|/g,''))continue;
      const row=tipMap.get(key)||{key,day:dayKey(tip.kickoff),fixture:text(tip.fixture),market:text(tip.market),pick:text(tip.pick),league:text(tip.league)||null,category:categoryForTip(tip),kickoff:safeDate(tip.kickoff),first_seen:generatedAt,last_seen:generatedAt,observations:0,codes:[],sources:[],odds_observations:[],result:'pending',settled_at:null,verification_status:'pending',verification_method:null};
      row.last_seen=generatedAt;row.observations=number(row.observations)+1;row.league=text(tip.league)||row.league;row.kickoff=safeDate(tip.kickoff)||row.kickoff;pushUnique(row.codes,code);pushUnique(row.sources,source);pushObservation(row.odds_observations,tip.odds);
      const explicitTipResult=resultValue(tip.result);
      const inferred=explicitTipResult!=='pending'?explicitTipResult:(codeResult==='won'?'won':'pending');
      if(inferred!=='pending'){
        row.result=inferred;row.settled_at=safeDate(item.settled_at)||safeDate(item.settlement?.verified_at)||generatedAt;row.verification_status='verified';row.verification_method=explicitTipResult!=='pending'?'source-tip-result':text(item.settlement?.method)||'verified-winning-slip';
      }
      tipMap.set(key,row);
    }
  }

  const tips=[...tipMap.values()].sort((a,b)=>String(b.last_seen).localeCompare(String(a.last_seen))).slice(0,5000);
  const codes=[...codeMap.values()].sort((a,b)=>String(b.last_seen).localeCompare(String(a.last_seen))).slice(0,1200);
  const nextHistory={version:3,updated_at:generatedAt,verification_policy:'Only verified source or manual settlements contribute to public performance.',tips,codes};

  const sourceGroups=new Map();
  for(const row of codes){const source=text(row.source)||'Unlabelled source';if(!sourceGroups.has(source))sourceGroups.set(source,[]);sourceGroups.get(source).push(row)}
  const sources=[];
  for(const [source,rows] of sourceGroups){
    const settled=rows.filter(row=>row.verification_status==='verified'&&['won','lost','void'].includes(row.result));
    const decisive=settled.filter(row=>row.result!=='void');const won=decisive.filter(row=>row.result==='won').length;const lost=decisive.filter(row=>row.result==='lost').length;const hitRate=decisive.length?won/decisive.length*100:0;const averageOdds=mean(decisive.map(row=>mean(row.odds_observations||[])));const sampleScore=Math.min(decisive.length/20,1)*100;const oddsScore=averageOdds?Math.min(100,averageOdds/2.5*100):50;const reliability=decisive.length?hitRate*.70+sampleScore*.20+oddsScore*.10:0;const form=settled.slice().sort((a,b)=>String(b.settled_at||b.last_seen).localeCompare(String(a.settled_at||a.last_seen))).slice(0,10).map(row=>row.result==='won'?'W':row.result==='lost'?'L':'V');sources.push({source,settled_slips:settled.length,won_slips:won,lost_slips:lost,void_slips:settled.length-decisive.length,hit_rate:Number(hitRate.toFixed(1)),average_odds:averageOdds?Number(averageOdds.toFixed(2)):null,reliability_score:Number(reliability.toFixed(1)),current_form:form,last_seen:rows[0]?.last_seen||null});
  }
  sources.sort((a,b)=>b.reliability_score-a.reliability_score||b.settled_slips-a.settled_slips);
  const sourceStats={version:2,updated_at:generatedAt,verification_policy:nextHistory.verification_policy,sources};

  const settledTips=tips.filter(row=>row.verification_status==='verified'&&['won','lost'].includes(row.result));
  const groups=[];const groupMap=new Map();
  function addGroup(type,group,row){if(!group)return;const key=`${type}|${group}`;if(!groupMap.has(key))groupMap.set(key,{type,group,settled:0,won:0,lost:0,odds:[]});const target=groupMap.get(key);target.settled++;if(row.result==='won')target.won++;else target.lost++;target.odds.push(mean(row.odds_observations||[]))}
  for(const row of settledTips){addGroup('Market',row.category,row);addGroup('League',row.league||'Unknown league',row);addGroup('Odds band',oddsBand(mean(row.odds_observations||[])),row)}
  for(const row of groupMap.values()){groups.push({type:row.type,group:row.group,settled:row.settled,won:row.won,lost:row.lost,hit_rate:Number((row.won/row.settled*100).toFixed(1)),average_odds:mean(row.odds)?Number(mean(row.odds).toFixed(2)):null})}
  groups.sort((a,b)=>a.type.localeCompare(b.type)||b.settled-a.settled||a.group.localeCompare(b.group));
  const performance={version:2,updated_at:generatedAt,total_settled:settledTips.length,verified_only:true,verification_policy:nextHistory.verification_policy,groups};

  await Promise.all([writeJson(historyPath,nextHistory),writeJson(sourcePath,sourceStats),writeJson(performancePath,performance)]);
  return{history:nextHistory,sources:sourceStats,performance};
}
