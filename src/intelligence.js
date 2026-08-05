(()=>{
  'use strict';

  const mvp=()=>window.SportyMVP||null;
  const aux={history:{version:1,tips:[],codes:[]},sources:{version:1,sources:[]},performance:{version:1,groups:[]}};
  const ui={day:'today',category:'all',search:'',minAppearances:2,odds:'all'};
  let preferences=null;
  let usePreferences=true;
  try{usePreferences=localStorage.getItem('sporty_use_preferences_v199')!=='false'}catch{}
  let model={tips:[],contradictions:[],slips:[],sourceRows:[],performanceRows:[],stats:{}};

  const $=selector=>document.querySelector(selector);
  const clear=node=>{if(node)while(node.firstChild)node.removeChild(node.firstChild)};
  const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node};
  function populationSection(root){return root?.matches?.('[data-population-section]')?root:root?.closest?.('[data-population-section]')||null}
  function setPopulated(root,hasContent){const section=populationSection(root);if(section)section.hidden=!Boolean(hasContent);return Boolean(hasContent)}
  const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,Number(value)||0));
  const text=value=>String(value??'').trim();
  const number=value=>{const parsed=Number(String(value??'').replace(/,/g,''));return Number.isFinite(parsed)?parsed:0};
  const slug=value=>text(value).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
  const mean=values=>{const valid=values.map(number).filter(value=>value>0);return valid.length?valid.reduce((a,b)=>a+b,0)/valid.length:0};
  const pct=value=>`${number(value)<1?number(value).toFixed(2):number(value).toFixed(1)}%`;
  const dateValue=value=>{if(value===null||value===undefined||text(value)==='')return null;const date=new Date(value);return Number.isFinite(date.getTime())?date:null};
  const dayKey=value=>{const d=dateValue(value);return d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:'undated'};
  const dayLabel=value=>mvp()?.dayLabel?mvp().dayLabel(value):(dateValue(value)?.toLocaleDateString()||'Date unavailable');
  const dayMatches=(value,filter)=>mvp()?.dayFilterMatches?mvp().dayFilterMatches(value,filter):filter==='all';
  const canonical=value=>slug(value).replace(/\b(fc|cf|sc|afc|club)\b/g,'').replace(/\s+/g,' ').trim();
  const now=()=>Date.now();

  function tipKey(tip){return [dayKey(tip.kickoff),canonical(tip.fixture),canonical(tip.market),canonical(tip.pick)].join('|')}
  function fixtureKey(tip){return [dayKey(tip.kickoff),canonical(tip.fixture)].join('|')}
  function sourceName(item){return text(item.author)||text(item.tipster)||text(item.source_name)||'Unlabelled source'}
  function sourceKey(item){const named=sourceName(item);return named==='Unlabelled source'?`slip:${text(item.code)}`:`source:${slug(named)}`}

  function parseThreshold(value){const match=text(value).replace(',','.').match(/(?:over|under|o|u)?\s*([0-9]+(?:\.[0-9]+)?)/i);return match?number(match[1]):null}
  function marketSignature(tip){
    const market=slug(tip.market);const pick=slug(tip.pick);const combined=`${market} ${pick}`;
    const threshold=parseThreshold(combined);
    if(/both teams|btts|\bgg\b|\bng\b/.test(combined))return{family:'BTTS',direction:/\bno\b|\bng\b/.test(combined)?'no':'yes',threshold:null};
    if(/double chance|\b1x\b|\bx2\b|\b12\b/.test(combined)){
      const outcomes=/\b1x\b/.test(combined)?['H','D']:/\bx2\b/.test(combined)?['D','A']:['H','A'];return{family:'Double Chance',direction:outcomes.join(''),outcomes,threshold:null};
    }
    if(/draw no bet|\bdnb\b/.test(combined))return{family:'DNB',direction:/away|team 2|\b2\b/.test(pick)?'A':'H',outcomes:/away|team 2|\b2\b/.test(pick)?['A']:['H'],threshold:null};
    if(/team total|team goals|home team|away team/.test(combined)&&/over|under/.test(combined))return{family:'Team Goals',direction:/under/.test(combined)?'under':'over',threshold,team:/away/.test(combined)?'away':/home/.test(combined)?'home':'team'};
    if(/over|under|total goals|goals/.test(combined))return{family:'Goals',direction:/under/.test(combined)?'under':'over',threshold};
    if(/corner/.test(combined))return{family:'Corners',direction:/under/.test(combined)?'under':/over/.test(combined)?'over':pick,threshold};
    if(/card/.test(combined))return{family:'Cards',direction:/under/.test(combined)?'under':/over/.test(combined)?'over':pick,threshold};
    if(/home win|away win|match winner|1x2|full time result|\bdraw\b/.test(combined)){
      const direction=/draw/.test(pick)?'D':/away|team 2|\b2\b/.test(pick)?'A':'H';return{family:'1X2',direction,outcomes:[direction],threshold:null};
    }
    if(/yes|no/.test(pick))return{family:canonical(tip.market)||'Yes/No',direction:/\bno\b/.test(pick)?'no':'yes',threshold};
    return{family:tip.category||'Other',direction:canonical(tip.pick),threshold};
  }

  function isOpposition(a,b){
    const sa=marketSignature(a),sb=marketSignature(b);
    const resultFamilies=new Set(['1X2','Double Chance','DNB']);
    if(sa.outcomes&&sb.outcomes&&resultFamilies.has(sa.family)&&resultFamilies.has(sb.family))return sa.outcomes.every(value=>!sb.outcomes.includes(value));
    if(sa.family!==sb.family)return false;
    if(['Goals','Team Goals','Corners','Cards'].includes(sa.family)){
      if(sa.family==='Team Goals'&&sa.team!==sb.team)return false;
      return sa.direction!==sb.direction&&sa.threshold!==null&&sb.threshold!==null&&Math.abs(sa.threshold-sb.threshold)<0.01;
    }
    if(sa.outcomes&&sb.outcomes)return sa.outcomes.every(value=>!sb.outcomes.includes(value));
    return sa.direction!==sb.direction;
  }

  function jaccard(setA,setB){if(!setA.size&&!setB.size)return 1;let shared=0;for(const value of setA)if(setB.has(value))shared++;return shared/(setA.size+setB.size-shared)}
  function clusterSlips(slips){
    const clusters=[];
    slips.forEach(slip=>{
      let best=null,bestScore=0;
      for(const cluster of clusters){const score=jaccard(slip.tipSet,cluster.representative.tipSet);if(score>bestScore){best=cluster;bestScore=score}}
      if(best&&bestScore>=0.78&&Math.min(slip.tipSet.size,best.representative.tipSet.size)>=2){best.members.push(slip);slip.clusterId=best.id;slip.similarity=bestScore;}
      else{const cluster={id:`cluster-${clusters.length+1}`,representative:slip,members:[slip]};clusters.push(cluster);slip.clusterId=cluster.id;slip.similarity=0;}
    });
    return clusters;
  }

  function buildSlips(){
    const api=mvp();if(!api)return[];
    const slips=api.displayableCodes().map(item=>{
      const tips=api.normalizedTips(item).map(tip=>({...tip,category:api.categoryForTip(tip)}));
      return{item,code:text(item.code),source:sourceName(item),sourceKey:sourceKey(item),tips,tipSet:new Set(tips.map(tipKey)),createdAt:dateValue(item.created_at||api.state.feed.generated_at)};
    }).filter(slip=>slip.tips.length);
    clusterSlips(slips);return slips;
  }

  function historyMap(){const map=new Map();for(const row of aux.history.tips||[])map.set(text(row.key),row);return map}
  function performanceFor(category){const rows=aux.performance.groups||[];return rows.find(row=>slug(row.group)===slug(category)&&number(row.settled)>=1)||null}
  function sourceStatMap(){const map=new Map();for(const row of aux.sources.sources||[])map.set(slug(row.source),row);return map}

  const marketRules={
    Goals:{minIndependent:2,minSources:2,oddsMin:1.10,oddsMax:3.50,maxOpposition:35},
    BTTS:{minIndependent:3,minSources:3,oddsMin:1.25,oddsMax:2.80,maxOpposition:30},
    '1X2':{minIndependent:3,minSources:3,oddsMin:1.15,oddsMax:3.40,maxOpposition:30},
    'Double Chance':{minIndependent:2,minSources:2,oddsMin:1.05,oddsMax:2.25,maxOpposition:30},
    DNB:{minIndependent:2,minSources:2,oddsMin:1.10,oddsMax:2.60,maxOpposition:30},
    Corners:{minIndependent:3,minSources:3,oddsMin:1.20,oddsMax:3.50,maxOpposition:25},
    Cards:{minIndependent:3,minSources:3,oddsMin:1.20,oddsMax:3.50,maxOpposition:25},
    Other:{minIndependent:3,minSources:2,oddsMin:1.10,oddsMax:4.00,maxOpposition:30}
  };

  function optionalStatsSupport(observations){
    const values=[];
    for(const observation of observations){const raw=observation.tip.support_score??observation.tip.stats_support??observation.tip.team_stats?.support_score;if(Number.isFinite(Number(raw)))values.push(clamp(raw))}
    return values.length?{score:mean(values),available:true}:{score:50,available:false};
  }

  function historicalComponent(row){
    const group=performanceFor(row.category);if(group&&number(group.settled)>=10)return{score:clamp(number(group.hit_rate)),available:true,sample:number(group.settled),hitRate:number(group.hit_rate)};
    return{score:50,available:false,sample:number(group?.settled),hitRate:number(group?.hit_rate)};
  }

  function oddsStability(key,averageOdds){
    const history=historyMap().get(key);const values=(history?.odds_observations||[]).map(number).filter(value=>value>0);
    if(values.length<2)return{score:50,available:false,observations:values.length};
    const avg=mean(values)||averageOdds||1;const range=Math.max(...values)-Math.min(...values);return{score:clamp(100-(range/avg)*180),available:true,observations:values.length,range};
  }

  function completeness(observations){
    const fields=['fixture','market','pick','kickoff','league','odds'];let total=0;
    for(const observation of observations){let count=0;for(const field of fields){const value=observation.tip[field];if(field==='odds'?number(value)>0:text(value)!=='')count++;}total+=count/fields.length*100}
    return observations.length?total/observations.length:0;
  }

  function buildTipIntelligence(slips){
    const dayTotals=new Map();const map=new Map();
    for(const slip of slips){
      const seen=new Set();const days=new Set(slip.tips.map(tip=>dayKey(tip.kickoff)));for(const day of days)dayTotals.set(day,(dayTotals.get(day)||0)+1);
      for(const tip of slip.tips){const key=tipKey(tip);if(seen.has(key))continue;seen.add(key);if(!map.has(key))map.set(key,{key,day:dayKey(tip.kickoff),fixture:tip.fixture,market:tip.market,pick:tip.pick,category:tip.category,kickoff:tip.kickoff,league:tip.league,observations:[]});map.get(key).observations.push({tip,slip});}
    }
    const raw=[...map.values()];const byFixture=new Map();for(const row of raw){const key=[row.day,canonical(row.fixture)].join('|');if(!byFixture.has(key))byFixture.set(key,[]);byFixture.get(key).push(row)}
    const output=[];
    for(const row of raw){
      const appearances=row.observations.length;const clusters=new Set(row.observations.map(item=>item.slip.clusterId));const sources=new Set(row.observations.map(item=>item.slip.sourceKey));const codes=[...new Set(row.observations.map(item=>item.slip.code))];const totalSlips=dayTotals.get(row.day)||slips.length;const independent=clusters.size;const independentShare=totalSlips?independent/totalSlips*100:0;const rawShare=totalSlips?appearances/totalSlips*100:0;const duplicateRate=appearances?Math.max(0,(appearances-independent)/appearances*100):0;const averageOdds=mean(row.observations.map(item=>item.tip.odds));
      let oppositionAppearances=0;const opposite=[];for(const candidate of byFixture.get([row.day,canonical(row.fixture)].join('|'))||[]){if(candidate.key===row.key||!isOpposition(row,candidate))continue;oppositionAppearances+=candidate.observations.length;opposite.push({market:candidate.market,pick:candidate.pick,count:candidate.observations.length,codes:[...new Set(candidate.observations.map(item=>item.slip.code))]});}
      const oppositionShare=(appearances+oppositionAppearances)?oppositionAppearances/(appearances+oppositionAppearances)*100:0;
      const history=historicalComponent(row);const stability=oddsStability(row.key,averageOdds);const stats=optionalStatsSupport(row.observations);const dataScore=completeness(row.observations);const agreementScore=100-oppositionShare;const sourceScore=clamp((Math.min(sources.size,5)/5)*60+(Math.min(independent,5)/5)*40);const consensusScore=clamp(independentShare*1.5);const signature=marketSignature(row);const rule=marketRules[signature.family]||marketRules[row.category]||marketRules.Other;
      let marketFit=100;if(independent<rule.minIndependent)marketFit-=25;if(sources.size<rule.minSources)marketFit-=20;if(oppositionShare>rule.maxOpposition)marketFit-=30;if(averageOdds>0&&(averageOdds<rule.oddsMin||averageOdds>rule.oddsMax))marketFit-=20;marketFit=clamp(marketFit);
      let score=consensusScore*.30+sourceScore*.20+history.score*.15+stability.score*.10+stats.score*.10+agreementScore*.10+dataScore*.05;score+=marketFit>=90?4:marketFit<60?-8:0;score=clamp(score);
      const noPick=[];const risks=[];const why=[];
      if(appearances<2)noPick.push('Only one slip contains this exact tip.');
      if(independent<rule.minIndependent)noPick.push(`Needs at least ${rule.minIndependent} independent slip patterns for this market.`);
      if(sources.size<rule.minSources)noPick.push(`Needs at least ${rule.minSources} distinct sources or slip clusters.`);
      if(oppositionShare>=40)noPick.push('Strong opposing selections were detected on the same fixture.');
      if(duplicateRate>=65)noPick.push('Near-duplicate slips dominate the apparent consensus.');
      if(dataScore<55)noPick.push('Important fields are missing from the scraped selections.');
      const kickoff=dateValue(row.kickoff);if(!kickoff)noPick.push('Kickoff time is unavailable.');else if(kickoff.getTime()<now()-15*60*1000)noPick.push('The event may already have started.');
      if(averageOdds>0&&(averageOdds<rule.oddsMin||averageOdds>rule.oddsMax))noPick.push(`Average selection odds fall outside the ${rule.oddsMin.toFixed(2)}–${rule.oddsMax.toFixed(2)} review window for ${signature.family}.`);
      if(score<50)noPick.push('The combined Tip Strength is below the minimum review level.');
      why.push(`Appears in ${appearances} of ${totalSlips} slips for ${dayLabel(row.kickoff)}.`);
      why.push(`${independent} independent slip pattern${independent===1?'':'s'} after duplicate checks.`);
      if(sources.size>1)why.push(`${sources.size} distinct source identities support the same fixture, market and selection.`);
      if(oppositionShare<20)why.push('Little direct opposition was found in the scraped slips.');
      if(history.available)why.push(`${row.category} history is ${history.hitRate.toFixed(1)}% from ${history.sample} settled tips.`);
      if(stability.available&&stability.score>=70)why.push(`Selection odds have been relatively stable across ${stability.observations} observations.`);
      if(duplicateRate>30)risks.push(`${duplicateRate.toFixed(0)}% of appearances may come from near-duplicate slips.`);
      if(oppositionShare>0)risks.push(`${oppositionAppearances} opposing appearance${oppositionAppearances===1?'':'s'} detected (${oppositionShare.toFixed(0)}% opposition share).`);
      if(!history.available)risks.push('There is not yet enough settled history for this market category.');
      if(!stability.available)risks.push('Odds stability cannot be measured from fewer than two observations.');
      if(!stats.available)risks.push('Home/away team-stat support was not supplied by the current feed.');
      if(dataScore<85)risks.push(`Data completeness is ${dataScore.toFixed(0)}%.`);
      const blocked=noPick.length>0;let tier='Avoid';if(!blocked&&score>=80&&independent>=3&&sources.size>=3&&oppositionShare<20)tier='Strong';else if(!blocked&&score>=65)tier='Supported';else if(!blocked&&score>=50)tier='Watch';
      output.push({...row,signature,rule,appearances,totalSlips,rawShare,independent,independentShare,uniqueSources:sources.size,codes,duplicateRate,averageOdds,oppositionAppearances,oppositionShare,opposite,history,stability,statsSupport:stats,dataCompleteness:dataScore,marketAgreement:agreementScore,marketFit,score,tier,decision:tier==='Avoid'?'NO PICK':'REVIEW',noPick:[...new Set(noPick)],why:[...new Set(why)],risks:[...new Set(risks)]});
    }
    return output.filter(row=>row.appearances>=2).sort((a,b)=>{const ad=dateValue(a.kickoff)?.getTime()||Number.MAX_SAFE_INTEGER;const bd=dateValue(b.kickoff)?.getTime()||Number.MAX_SAFE_INTEGER;return ad-bd||b.score-a.score||b.independent-a.independent});
  }

  function buildContradictions(tips){
    const groups=new Map();for(const tip of tips){const key=fixtureKey(tip);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(tip)}
    const rows=[];for(const group of groups.values()){const seen=new Set();for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){const a=group[i],b=group[j];if(!isOpposition(a,b))continue;const key=[a.key,b.key].sort().join('::');if(seen.has(key))continue;seen.add(key);const total=a.appearances+b.appearances;rows.push({fixture:a.fixture,kickoff:a.kickoff,category:a.category,a,b,total,severity:total>=6?'High':total>=4?'Medium':'Low'});}}
    return rows.sort((a,b)=>(({High:3,Medium:2,Low:1}[b.severity]||0)-({High:3,Medium:2,Low:1}[a.severity]||0))||b.total-a.total);
  }

  function buildCurrentSources(slips){
    const current=new Map();for(const slip of slips){if(!current.has(slip.sourceKey))current.set(slip.sourceKey,{source:slip.source,active_slips:0,active_tips:0,codes:[]});const row=current.get(slip.sourceKey);row.active_slips++;row.active_tips+=slip.tips.length;row.codes.push(slip.code)}
    const historical=sourceStatMap();return [...current.values()].map(row=>({...row,...historical.get(slug(row.source)),source:row.source,active_slips:row.active_slips,active_tips:row.active_tips,codes:row.codes})).sort((a,b)=>number(b.reliability_score)-number(a.reliability_score)||b.active_slips-a.active_slips);
  }

  function rebuild(){
    const slips=buildSlips();const tips=buildTipIntelligence(slips);const contradictions=buildContradictions(tips);const sourceRows=buildCurrentSources(slips);const performanceRows=aux.performance.groups||[];model={slips,tips,contradictions,sourceRows,performanceRows,stats:{strong:tips.filter(row=>row.tier==='Strong').length,supported:tips.filter(row=>row.tier==='Supported').length,watch:tips.filter(row=>row.tier==='Watch').length,avoid:tips.filter(row=>row.tier==='Avoid').length,conflicts:contradictions.length,independentSlips:new Set(slips.map(row=>row.clusterId)).size,rawSlips:slips.length}};renderAll();window.SportySaved?.reconcileTips(tips);document.dispatchEvent(new CustomEvent('sporty:intelligence-updated',{detail:{tips}}));
  }

  function empty(title,copy){const node=el('div','empty');node.append(el('strong','',title),el('span','',copy));return node}
  function metric(label,value){const node=el('div','metric');node.append(el('span','',label),el('strong','',value));return node}
  function badgeForTier(tier){return `tier-badge tier-${tier.toLowerCase()}`}

  function kickoffTime(value){const d=dateValue(value);return d?d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'Time unavailable'}
  function popularityScore(row){const share=number(row.rawShare);const appearances=Math.min(36,number(row.appearances)*7);const sources=Math.min(18,number(row.uniqueSources)*4);return Math.max(1,Math.min(100,Math.round(share*.52+appearances+sources)))}

  function intelligenceCard(row,{compact=false}={}){
    const card=el('article',`intelligence-card tier-card-${row.tier.toLowerCase()}`);const top=el('div','intelligence-top');const title=el('div');const tags=el('div','pill-row');tags.append(el('span',badgeForTier(row.tier),row.tier),el('span','pill',row.category),el('span','pill day-pill',dayLabel(row.kickoff)));title.append(tags,el('h3','',row.fixture));const score=el('div','strength-score');score.append(el('strong','',Math.round(row.score)),el('span','','/100'));top.append(title,score);card.append(top,el('div','tip-pick',`${row.market}: ${row.pick}`));
    const metrics=el('div','metric-grid');metrics.append(metric('Independent agreement',`${row.independent} of ${row.totalSlips} slips`),metric('Distinct sources',row.uniqueSources),metric('Opposition',pct(row.oppositionShare)),metric('Average odds',row.averageOdds?row.averageOdds.toFixed(2):'—'));card.append(metrics);
    const decision=el('div',`decision-strip ${row.tier==='Avoid'?'decision-avoid':'decision-review'}`);decision.append(el('strong','',row.tier==='Avoid'?'NO PICK':'REVIEW'),el('span','',row.tier==='Avoid'?(row.noPick[0]||'Signals did not pass the safeguards.'):'Passed the current safeguards; still not a guarantee.'));card.append(decision);
    if(!compact){const details=el('details','why-panel');const summary=el('summary','','Why this rating');details.append(summary);const body=el('div','why-grid');const positive=el('div','why-column');positive.append(el('h4','','Supporting evidence'));const ul=el('ul');row.why.forEach(item=>ul.append(el('li','',item)));positive.append(ul);const risk=el('div','why-column');risk.append(el('h4','','What could go wrong'));const riskList=el('ul');(row.risks.length?row.risks:['No additional risk notes were generated.']).forEach(item=>riskList.append(el('li','',item)));risk.append(riskList);body.append(positive,risk);if(row.noPick.length){const blocked=el('div','no-pick-list');blocked.append(el('h4','','No-pick safeguards'));const list=el('ul');row.noPick.forEach(item=>list.append(el('li','',item)));blocked.append(list);body.append(blocked)}details.append(body);card.append(details);}
    const actions=el('div','card-actions intelligence-actions');if(window.SportySaved){actions.append(window.SportySaved.button(window.SportySaved.tipItem(row),{className:'button secondary save-button'}))}if(window.SportyShare){actions.append(window.SportyShare.button({type:'tip',fixture:row.fixture,market:row.market,pick:row.pick,tier:row.tier,score:row.score,odds:row.averageOdds,day:dayLabel(row.kickoff)},{className:'button secondary share-button',label:`Share ${text(row.fixture)}`}))}if(actions.childElementCount)card.append(actions)
    return card;
  }


  function popularTipCard(row,rank){
    const card=el('article','popular-tip-card');
    const rankNode=el('div','popular-tip-rank',String(rank));
    const main=el('div','popular-tip-main');
    const tags=el('div','pill-row');
    tags.append(el('span',badgeForTier(row.tier),row.tier),el('span','pill',row.category),el('span','pill day-pill',dayLabel(row.kickoff)));
    main.append(tags,el('h3','',row.fixture),el('span','popular-tip-pick',`${row.market}: ${row.pick}`));
    const meta=el('div','popular-tip-meta');
    const popularity=popularityScore(row);
    const rows=[['Popularity',`${popularity}/100`],['Seen in',`${row.appearances} slips`],['Avg. odds',row.averageOdds?row.averageOdds.toFixed(2):'—']];
    rows.forEach(([label,value])=>{const node=el('span','',label);node.append(el('b','',value));meta.append(node)});
    const button=el('button','popular-add-button');button.type='button';
    const slipItem={id:row.key,fixture:row.fixture,market:row.market,pick:row.pick,odds:row.averageOdds,kickoff:row.kickoff,league:row.league,tier:row.tier,popularity,appearances:row.appearances,sources:row.uniqueSources};
    button.dataset.slipAddKey=row.key;button.setAttribute('aria-label',`Add ${row.fixture} to prediction slip`);button.setAttribute('aria-pressed',String(Boolean(window.SportySlip?.has(slipItem))));
    button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span data-add-label>Add</span>';
    if(window.SportySlip?.has(slipItem)){button.classList.add('is-added');const label=button.querySelector('[data-add-label]');if(label)label.textContent='Added'}
    button.addEventListener('click',()=>{if(window.SportySlip?.has(slipItem)){window.SportySlip.open();return}window.SportySlip?.add(slipItem,button)});
    card.append(rankNode,main,meta,button);return card;
  }

  function contradictionCard(row){const card=el('article',`contradiction-card severity-${row.severity.toLowerCase()}`);const top=el('div','card-top');top.append(el('div','card-kicker',`${row.severity} conflict`),el('span','pill day-pill',dayLabel(row.kickoff)));card.append(top,el('h3','',row.fixture));const sides=el('div','conflict-sides');for(const side of [row.a,row.b]){const node=el('div','conflict-side');node.append(el('strong','',`${side.market}: ${side.pick}`),el('span','',`${side.appearances} slip appearance${side.appearances===1?'':'s'}`));sides.append(node)}card.append(sides,el('p','card-note','Opposing directions were found for the same fixture and market family. The engine downgrades both sides.'));return card}

  function renderStats(){
    const today=model.tips.filter(row=>row.tier!=='Avoid'&&dayMatches(row.kickoff,'today'));
    const values={tips:today.length,fixtures:new Set(today.map(row=>canonical(row.fixture))).size,slips:model.stats.rawSlips||0,'my-slip':window.SportySlip?.count?.()||0};
    for(const [key,value] of Object.entries(values))document.querySelectorAll(`[data-popular-stat="${key}"]`).forEach(node=>node.textContent=String(value||0));
    const section=$('#intelligenceStatsSection');if(section)section.hidden=model.tips.length===0;
  }

  function filteredTips(){return model.tips.filter(row=>{
    if(row.tier==='Avoid')return false;
    const search=ui.search.toLowerCase();
    const haystack=`${row.fixture} ${row.market} ${row.pick} ${row.category} ${row.league}`.toLowerCase();
    const oddsOk=ui.odds==='all'||(ui.odds==='low'&&row.averageOdds>0&&row.averageOdds<=1.60)||(ui.odds==='mid'&&row.averageOdds>1.60&&row.averageOdds<=2.50)||(ui.odds==='high'&&row.averageOdds>2.50);
    let personalOk=true;
    if(usePreferences&&preferences){
      const markets=preferences.favorite_markets||[],leagues=preferences.favorite_leagues||[];
      const marketOk=!markets.length||markets.some(value=>slug(value)===slug(row.category)||slug(row.market).includes(slug(value)));
      const leagueOk=!leagues.length||leagues.some(value=>slug(row.league).includes(slug(value)));
      const scoreOk=number(row.score)>=number(preferences.min_tip_strength||0);
      const oppositionOk=number(row.oppositionShare)<=number(preferences.max_opposition??100);
      const sourceOk=row.uniqueSources>=number(preferences.min_sources||1);
      const oddsMin=number(preferences.odds_min||1),oddsMax=number(preferences.odds_max||9999);
      const personalOdds=!row.averageOdds||(row.averageOdds>=oddsMin&&row.averageOdds<=oddsMax);
      const dayOk=!preferences.preferred_day||preferences.preferred_day==='all'||dayMatches(row.kickoff,preferences.preferred_day);
      personalOk=marketOk&&leagueOk&&scoreOk&&oppositionOk&&sourceOk&&personalOdds&&dayOk;
    }
    return(!search||haystack.includes(search))&&(ui.category==='all'||row.category===ui.category)&&row.appearances>=ui.minAppearances&&oddsOk&&dayMatches(row.kickoff,ui.day)&&personalOk;
  })}

  function renderSmartBoard(){
    const root=$('#smartBoard');if(!root)return;clear(root);
    const hasModel=model.tips.length>0;setPopulated(root,hasModel);
    const explainer=$('#smartBoardExplainer');if(explainer)explainer.hidden=!hasModel;
    updatePreferenceState();renderStats();if(!hasModel)return;
    const rows=filteredTips().sort((a,b)=>b.appearances-a.appearances||b.rawShare-a.rawShare||b.uniqueSources-a.uniqueSources||b.score-a.score);
    const count=$('#popularBoardCount');if(count)count.textContent=rows.length?`${rows.length} popular tip${rows.length===1?'':'s'}`:'No matching tips';
    const boardDay=$('#popularBoardDay');if(boardDay)boardDay.textContent=ui.day==='today'?'Today':ui.day==='tomorrow'?'Tomorrow':ui.day==='week'?'Next 7 days':ui.day==='undated'?'Date unavailable':'All available';
    if(!rows.length){
      const undated=model.tips.filter(row=>!dateValue(row.kickoff)).length;
      const datedToday=model.tips.filter(row=>dayMatches(row.kickoff,'today')).length;
      const copy=ui.day==='today'&&undated
        ? `${undated} repeated tip${undated===1?' is':'s are'} waiting for a verified kickoff date. Deploy the latest collector patch and run the Code Hub workflow once; undated tips are not labelled as Today.`
        : ui.day==='today'&&datedToday
          ? `${datedToday} repeated tip${datedToday===1?' was':'s were'} found for today but did not pass the conflict, source-diversity or data-quality gates.`
          : 'Try another match day or reduce the minimum appearances. Only repeated, non-conflicting tips are shown.';
      root.append(empty(ui.day==='today'?'No date-confirmed popular tips yet':'No popular tips match this view',copy));return
    }
    rows.forEach((row,index)=>root.append(popularTipCard(row,index+1)));
  }

  function renderPreviews(){const strongRoot=$('#strongTipsPreview');if(strongRoot){clear(strongRoot);const rows=model.tips.filter(row=>row.tier==='Strong'||row.tier==='Supported').slice(0,4);setPopulated(strongRoot,rows.length>0);if(rows.length)rows.forEach(row=>strongRoot.append(intelligenceCard(row,{compact:true})))}const conflictRoot=$('#contradictionPreview');if(conflictRoot){clear(conflictRoot);const rows=model.contradictions.slice(0,3);setPopulated(conflictRoot,rows.length>0);if(rows.length)rows.forEach(row=>conflictRoot.append(contradictionCard(row)))}}

  function renderContradictions(){const root=$('#contradictionGrid');if(!root)return;clear(root);setPopulated(root,model.contradictions.length>0);if(!model.contradictions.length)return;model.contradictions.forEach(row=>root.append(contradictionCard(row)))}

  function renderSources(){const root=$('#sourceGrid');if(!root)return;clear(root);setPopulated(root,model.sourceRows.length>0);if(!model.sourceRows.length)return;for(const row of model.sourceRows){const card=el('article','source-card');const top=el('div','card-top');top.append(el('div','card-kicker',number(row.settled_slips)>=5?'Tracked source':'Current feed'),el('strong','source-score',number(row.reliability_score)?`${Math.round(number(row.reliability_score))}/100`:'New'));card.append(top,el('h3','',row.source));const metrics=el('div','metric-grid');metrics.append(metric('Active slips',row.active_slips),metric('Active tips',row.active_tips),metric('Settled slips',number(row.settled_slips)||0),metric('Slip win rate',number(row.hit_rate)?pct(row.hit_rate):'Not enough data'));card.append(metrics);const form=Array.isArray(row.current_form)?row.current_form.join(' · '):text(row.current_form)||'Awaiting settled results';card.append(el('p','card-note',`Recent form: ${form}`));root.append(card)}}

  function renderPerformance(){const root=$('#performanceGrid');if(!root)return;clear(root);setPopulated(root,model.performanceRows.length>0);const explainer=$('#performanceExplainer');if(explainer)explainer.hidden=!model.performanceRows.length;if(!model.performanceRows.length)return;for(const row of model.performanceRows){const card=el('article','performance-card');const top=el('div','card-top');top.append(el('div','card-kicker',row.type||'Market category'),el('strong','',number(row.settled)>=10?`${pct(row.hit_rate)} hit rate`:'Small sample'));card.append(top,el('h3','',row.group));const metrics=el('div','metric-grid');metrics.append(metric('Settled tips',number(row.settled)),metric('Won',number(row.won)),metric('Lost',number(row.lost)),metric('Average odds',number(row.average_odds)?number(row.average_odds).toFixed(2):'—'));card.append(metrics);if(number(row.settled)<10)card.append(el('p','card-note','This sample is too small to influence Tip Strength strongly.'));root.append(card)}}

  function renderAll(){renderStats();renderPreviews();renderSmartBoard();renderContradictions();renderSources();renderPerformance()}

  async function fetchJson(path,fallback){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),6500);try{const response=await fetch(path,{cache:'no-cache',signal:controller.signal,headers:{Accept:'application/json'}});if(!response.ok)return fallback;return await response.json()}catch{return fallback}finally{clearTimeout(timer)}}
  async function loadAux(){const [history,sources,performance]=await Promise.all([fetchJson('/data/tip-history.json',aux.history),fetchJson('/data/source-stats.json',aux.sources),fetchJson('/data/performance-summary.json',aux.performance)]);aux.history=history||aux.history;aux.sources=sources||aux.sources;aux.performance=performance||aux.performance;rebuild()}

  function fillCategoryFilter(){const select=$('#intelCategory');if(!select)return;const current=ui.category;clear(select);const all=el('option','','All markets');all.value='all';select.append(all);[...new Set(model.tips.map(row=>row.category))].sort().forEach(category=>{const option=el('option','',category);option.value=category;select.append(option)});select.value=[...select.options].some(option=>option.value===current)?current:'all';ui.category=select.value}
  function bind(){
    $('#intelSearch')?.addEventListener('input',event=>{ui.search=event.target.value;renderSmartBoard()});
    $('#intelDay')?.addEventListener('change',event=>{ui.day=event.target.value;renderSmartBoard()});
    $('#intelCategory')?.addEventListener('change',event=>{ui.category=event.target.value;renderSmartBoard()});
    $('#intelPopularity')?.addEventListener('change',event=>{ui.minAppearances=number(event.target.value)||2;renderSmartBoard()});
    $('#intelOdds')?.addEventListener('change',event=>{ui.odds=event.target.value;renderSmartBoard()});
    $('#usePreferences')?.addEventListener('change',event=>{usePreferences=event.target.checked;try{localStorage.setItem('sporty_use_preferences_v199',String(usePreferences))}catch{}updatePreferenceState();renderSmartBoard()});
    document.addEventListener('sporty:slip-updated',renderSmartBoard);
  }

  function updatePreferenceState(){const box=$('#personalFilterState');if(!box)return;const signedIn=Boolean(window.SportyAuth?.session?.user);box.hidden=!signedIn||!model.tips.length;const check=$('#usePreferences');if(check)check.checked=usePreferences;const label=$('#personalFilterCopy');if(label)label.textContent=preferences?'Using your saved account filters.':'No saved account filters yet.'}

  async function loadPreferences(){const auth=window.SportyAuth;if(!auth)return;await auth.ready;if(!auth.session?.user||!auth.client){preferences=null;updatePreferenceState();return}const {data,error}=await auth.client.from('user_preferences').select('favorite_markets,favorite_leagues,min_tip_strength,max_opposition,min_sources,odds_min,odds_max,preferred_day').eq('user_id',auth.session.user.id).maybeSingle();if(!error)preferences=data||null;updatePreferenceState();renderSmartBoard()}
  

  function rebuildAndFilters(){rebuild();fillCategoryFilter();renderSmartBoard()}
  async function init(){bind();await Promise.all([loadAux(),loadPreferences()]);if(mvp()?.state?.feed?.items?.length)rebuildAndFilters();document.addEventListener('sporty:feed-updated',rebuildAndFilters);document.addEventListener('sportyauthchange',loadPreferences)}

  window.SportyIntelligence={buildSlips,buildTipIntelligence,buildContradictions,marketSignature,isOpposition,jaccard,getModel:()=>model,rebuild};
  document.addEventListener('DOMContentLoaded',init);
})();
