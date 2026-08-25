(()=>{
  'use strict';

  const state={generated:[],live:[],items:[],filter:'all',search:'',loading:true,liveReady:false};
  const $=selector=>document.querySelector(selector);
  const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node};
  const clear=node=>{if(node)while(node.firstChild)node.removeChild(node.firstChild)};
  const text=value=>String(value??'').trim();
  const number=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:0};
  const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,number(value)));
  const pct=value=>`${number(value).toFixed(number(value)<10?1:0)}%`;
  const day=value=>{const date=value?new Date(value):null;return date&&Number.isFinite(date.getTime())?date.toLocaleString([], {dateStyle:'medium',timeStyle:'short'}):'Date unavailable'};
  const setSection=(selector,visible)=>{const node=$(selector);if(node)node.hidden=!visible};
  const unique=values=>[...new Set(values.filter(Boolean))];
  const slug=value=>text(value).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();

  function classificationClass(value){return value==='elite_strong'?'is-strong':value==='elite_supported'?'is-supported':'is-watch'}
  function normalizeClass(value){return value==='elite_verified'?'elite_strong':value==='trending'?'elite_watch':value||'elite_watch'}
  function rankClass(value){return value==='elite_strong'?3:value==='elite_supported'?2:1}
  function evidenceText(item){
    if(item.reason)return item.reason;
    if(!item.statistics_complete)return'High community repetition; some statistical evidence is still developing.';
    if(item.opposition_level==='Low')return'Independent booking-code consensus and statistical evidence agree with low opposition.';
    return'Community consensus is statistically supported, with some opposing evidence retained in the ranking.';
  }
  function metric(label,value){const node=el('div','elite-metric');node.append(el('span','',label),el('strong','',value));return node}
  function popularityScore(row){const share=number(row.rawShare);const appearances=Math.min(36,number(row.appearances)*7);const sources=Math.min(18,number(row.uniqueSources)*4);return Math.max(1,Math.min(100,Math.round(share*.52+appearances+sources)))}

  function weightedStatistics(row){
    const parts=[];
    const add=(score,weight,available=true,label='')=>{if(available&&Number.isFinite(Number(score)))parts.push({score:clamp(score),weight,label})};
    add(row.statsSupport?.score,28,Boolean(row.statsSupport?.available),'Team statistics');
    add(row.marketFit,20,true,'Market fit');
    add(row.dataCompleteness,18,true,'Data completeness');
    add(100-number(row.oppositionShare),16,true,'Directional agreement');
    add(row.stability?.score,9,Boolean(row.stability?.available),'Odds stability');
    add(row.history?.score,9,Boolean(row.history?.available),'Settled history');
    const weight=parts.reduce((sum,item)=>sum+item.weight,0)||1;
    const score=Math.round(parts.reduce((sum,item)=>sum+item.score*item.weight,0)/weight);
    const direct=Boolean(row.statsSupport?.available);
    const complete=direct||Boolean(row.history?.available&&row.stability?.available&&number(row.dataCompleteness)>=80);
    return{score,complete,parts};
  }

  function deriveLiveItems(tips){
    const rows=Array.isArray(tips)?tips:[];
    return rows.map(row=>{
      if(!row?.boardEligible)return null;
      const popularity=popularityScore(row);
      const stats=weightedStatistics(row);
      const appearances=number(row.appearances);
      const independent=number(row.independent);
      const sources=number(row.uniqueSources);
      const opposition=number(row.oppositionShare);
      const data=number(row.dataCompleteness);
      const validOdds=number(row.averageOdds)>1&&number(row.averageOdds)<1000;
      if(!validOdds||opposition>=45||data<50||appearances<2||independent<2)return null;
      let classification='elite_watch';
      if(popularity>=75&&appearances>=5&&independent>=4&&sources>=4&&stats.score>=72&&stats.complete&&opposition<25)classification='elite_strong';
      else if(popularity>=55&&appearances>=3&&independent>=3&&sources>=3&&stats.score>=62&&opposition<35)classification='elite_supported';
      else if(!(popularity>=35&&stats.score>=50&&opposition<45))return null;
      const label={elite_strong:'Elite Strong',elite_supported:'Elite Supported',elite_watch:'Elite Watch'}[classification];
      const backing=stats.complete?`${stats.score}% statistical backing`:`${stats.score}% available-evidence backing`;
      const reasons=[
        `Appears in ${appearances} verified booking codes with a ${popularity}/100 popularity score.`,
        `${backing}; data completeness ${Math.round(data)}%.`,
        opposition<10?'Very little direct opposition was found.':`${Math.round(opposition)}% opposing share was retained in the ranking.`
      ];
      if(row.statsSupport?.available)reasons.push(`Team-stat support is ${Math.round(number(row.statsSupport.score))}/100.`);
      else reasons.push('Direct team-stat coverage is incomplete, so this pick cannot receive the highest grade from popularity alone.');
      const eliteScore=Math.round(popularity*.52+stats.score*.38+clamp(100-opposition)*.10);
      return{
        id:`live-${slug(row.key||`${row.fixture}-${row.market}-${row.pick}`)}`,
        key:row.key||`${row.fixture}|${row.market}|${row.pick}`,
        fixture:text(row.fixture),market:text(row.market),pick:text(row.pick),league:text(row.league)||null,kickoff:row.kickoff||null,
        classification,label,elite_score:eliteScore,consensus_score:Math.round(popularity/2),statistical_score:Math.round(stats.score/2),statistical_percent:stats.score,
        independent_groups:independent,independent_sources:sources,total_additions:appearances,source_reliability:popularity,
        opposition_level:opposition<10?'Low':opposition<25?'Moderate':'High',opposition_share:opposition,average_odds:number(row.averageOdds)||null,
        trend:classification==='elite_watch'?'Watchlist':'Qualified',statistics_complete:stats.complete,last_verified_at:new Date().toISOString(),reason:reasons.join(' '),
        evidence:{source:'live-most-added',popularity,data_completeness:data,market_fit:number(row.marketFit),stats_support:row.statsSupport?.available?number(row.statsSupport.score):null,history_sample:number(row.history?.sample),stability_observations:number(row.stability?.observations)},
        slip_item:{id:row.key,fixture:row.fixture,market:row.market,pick:row.pick,odds:row.averageOdds,kickoff:row.kickoff,league:row.league,tier:label,popularity,appearances,sources}
      };
    }).filter(Boolean).sort((a,b)=>rankClass(b.classification)-rankClass(a.classification)||b.elite_score-a.elite_score||b.total_additions-a.total_additions);
  }

  function normalizeGenerated(item){
    const classification=normalizeClass(text(item.classification));
    return{...item,classification,label:classification==='elite_strong'?'Elite Strong':classification==='elite_supported'?'Elite Supported':'Elite Watch',key:item.key||`${item.fixture}|${item.market}|${item.pick}`};
  }

  function mergeItems(){
    const map=new Map();
    for(const item of state.live)map.set(text(item.key)||`${slug(item.fixture)}|${slug(item.market)}|${slug(item.pick)}`,item);
    for(const item of state.generated){
      const key=text(item.key)||`${slug(item.fixture)}|${slug(item.market)}|${slug(item.pick)}`;
      const current=map.get(key);
      if(!current||rankClass(item.classification)>rankClass(current.classification)||number(item.elite_score)>number(current.elite_score))map.set(key,item);
    }
    state.items=[...map.values()].sort((a,b)=>rankClass(b.classification)-rankClass(a.classification)||number(b.elite_score)-number(a.elite_score)||number(b.total_additions)-number(a.total_additions));
  }

  function card(item,{compact=false}={}){
    if(compact){
      const article=el('article','elite-card compact');
      const title=el('div','elite-title');title.append(el('span','elite-market',text(item.market)||'Market'),el('h3','',text(item.fixture)||'Fixture unavailable'),el('p','elite-pick',text(item.pick)||'Selection unavailable'));
      const meta=el('div','elite-meta');meta.append(el('span','',day(item.kickoff)),el('span','',item.average_odds?`Ref ${number(item.average_odds).toFixed(2)}`:'Odds TBC'));
      article.append(title,meta);
      const actions=el('div','card-actions elite-actions');
      const slipItem=item.slip_item||{id:item.key||item.id,fixture:item.fixture,market:item.market,pick:item.pick,odds:item.average_odds,kickoff:item.kickoff,league:item.league,tier:'Elite'};
      if(window.SportySlip){const add=el('button','button secondary elite-add-button',window.SportySlip.has?.(slipItem)?'Open slip':'Add to slip');add.type='button';add.addEventListener('click',()=>{if(window.SportySlip.has?.(slipItem))window.SportySlip.open?.();else window.SportySlip.add?.(slipItem,add)});actions.append(add)}
      article.append(actions);return article;
    }
    const article=el('article',`elite-card ${classificationClass(item.classification)}${compact?' compact':''}`);
    const head=el('div','elite-card-head');const badge=el('span','elite-badge',item.label||'Elite Watch');const score=el('div','elite-score');score.append(el('span','','Elite Score'),el('strong','',Math.round(number(item.elite_score))));head.append(badge,score);
    const title=el('div','elite-title');title.append(el('span','elite-market',text(item.market)||'Market'),el('h3','',text(item.fixture)||'Fixture unavailable'),el('p','elite-pick',text(item.pick)||'Selection unavailable'));
    const metrics=el('div','elite-metrics');metrics.append(metric('Independent codes',number(item.independent_groups??item.independent_sources)),metric('Total additions',number(item.total_additions)),metric('Statistical backing',item.statistical_percent!=null?`${Math.round(number(item.statistical_percent))}/100`:`${Math.round(number(item.statistical_score)*2)}/100`),metric('Opposition',item.opposition_level||'—'));
    const proof=el('div','elite-proof');proof.append(el('p','',evidenceText(item)));
    const meta=el('div','elite-meta');meta.append(el('span','',day(item.kickoff)),el('span','',item.average_odds?`Avg odds ${number(item.average_odds).toFixed(2)}`:'Odds unavailable'),el('span','',item.evidence?.source==='live-most-added'?'Live Most Added bridge':item.trend||'Developing'));
    article.append(head,title,metrics,proof,meta);
    const actions=el('div','card-actions elite-actions');
    const details=el('button','button secondary','View evidence');details.type='button';details.addEventListener('click',()=>openEvidence(item));actions.append(details);
    const slipItem=item.slip_item||{id:item.key||item.id,fixture:item.fixture,market:item.market,pick:item.pick,odds:item.average_odds,kickoff:item.kickoff,league:item.league,tier:item.label,popularity:Math.round(number(item.consensus_score)*2),appearances:item.total_additions,sources:item.independent_sources};
    if(window.SportySlip){const add=el('button','button secondary elite-add-button',window.SportySlip.has?.(slipItem)?'Open slip':'Add to slip');add.type='button';add.addEventListener('click',()=>{if(window.SportySlip.has?.(slipItem))window.SportySlip.open?.();else window.SportySlip.add?.(slipItem,add)});actions.append(add)}
    if(window.SportySaved?.button)actions.append(window.SportySaved.button(window.SportySaved.tipItem({fixture:item.fixture,market:item.market,pick:item.pick,tier:item.label,score:item.elite_score,average_odds:item.average_odds,kickoff:item.kickoff,league:item.league,category:'Elite Picks'}),{className:'button secondary save-button'}));
    if(window.SportyShare?.button)actions.append(window.SportyShare.button({type:'tip',fixture:item.fixture,market:item.market,pick:item.pick,tier:item.label,score:item.elite_score,odds:item.average_odds,day:day(item.kickoff)},{className:'button secondary share-button',label:`Share ${text(item.fixture)}`}));
    article.append(actions);return article;
  }

  function openEvidence(item){
    const dialog=$('#eliteEvidenceDialog');if(!dialog)return;$('#eliteEvidenceTitle').textContent=item.fixture||'Elite evidence';$('#eliteEvidencePick').textContent=`${item.market}: ${item.pick}`;
    const grid=$('#eliteEvidenceGrid');clear(grid);grid.append(metric('Consensus score',`${Math.round(number(item.consensus_score)*2)}/100`),metric('Statistical backing',item.statistical_percent!=null?`${Math.round(number(item.statistical_percent))}/100`:`${Math.round(number(item.statistical_score)*2)}/100`),metric('Independent codes',number(item.independent_groups??item.independent_sources)),metric('Popularity',item.evidence?.popularity?`${Math.round(number(item.evidence.popularity))}/100`:pct(item.source_reliability)),metric('Opposition',pct(item.opposition_share)),metric('Data completeness',item.evidence?.data_completeness!=null?`${Math.round(number(item.evidence.data_completeness))}/100`:'Pending'));
    $('#eliteEvidenceReason').textContent=item.reason||evidenceText(item);$('#eliteEvidenceUpdated').textContent=item.last_verified_at?`Last checked ${new Date(item.last_verified_at).toLocaleString()}`:'Verification time unavailable';
    if(typeof dialog.showModal==='function')dialog.showModal();else dialog.hidden=false;
  }

  function filtered(){return state.items.filter(item=>{const classOk=state.filter==='all'||item.classification===state.filter;const haystack=`${item.fixture} ${item.market} ${item.pick} ${item.league}`.toLowerCase();return classOk&&(!state.search||haystack.includes(state.search))})}

  function render(){
    const root=$('#eliteGrid');if(!root)return;clear(root);const rows=filtered();
    const values={strong:state.items.filter(row=>row.classification==='elite_strong').length,supported:state.items.filter(row=>row.classification==='elite_supported').length,watch:state.items.filter(row=>row.classification==='elite_watch').length,total:state.items.length};
    const hasItems=state.items.length>0;
    setSection('#eliteContent',hasItems);setSection('#eliteStatsSection',hasItems);setSection('#eliteLoading',state.loading);if(hasItems)setSection('#eliteLoading',false);setSection('#eliteEmpty',!state.loading&&!hasItems);
    for(const[key,value]of Object.entries(values)){
      const node=$(`[data-elite-stat="${key}"]`);if(node){node.textContent=String(value);const stat=node.closest('.stat-card');if(stat)stat.hidden=value<=0&&key!=='total'}
      const filter=document.querySelector(`[data-elite-filter="elite_${key}"]`);if(filter)filter.hidden=value<=0;
    }
    if(!hasItems)return;
    if(!rows.length){const empty=el('div','empty-state');empty.append(el('h3','','No Elite Picks match this filter'),el('p','','Change the classification or search term to view the available candidates.'));root.append(empty);return}
    rows.forEach(item=>root.append(card(item)));
  }

  function renderHomePreview(){const root=$('#eliteHomeGrid');if(!root)return;clear(root);const rows=state.items.slice(0,3);const section=root.closest('[data-population-section]');if(section)section.hidden=!rows.length;if(!rows.length)return;rows.forEach(item=>root.append(card(item,{compact:true}))) }

  function renderPerformance(data){
    const root=$('#elitePerformanceGrid');if(!root)return;clear(root);const rows=(data?.groups||[]).filter(row=>row.sample_ready===true&&number(row.settled)>=30);const section=$('#elitePerformanceSection');if(section)section.hidden=!rows.length;if(!rows.length)return;
    rows.forEach(row=>{const card=el('article','performance-card elite-performance-card');const top=el('div','card-top');top.append(el('div','card-kicker','Verified Elite sample'),el('strong','',`${number(row.hit_rate).toFixed(1)}% hit rate`));card.append(top,el('h3','',row.label||row.classification));const metrics=el('div','metric-grid');metrics.append(metric('Settled',number(row.settled)),metric('Won',number(row.won)),metric('Lost',number(row.lost)),metric('Minimum sample','30'));card.append(metrics,el('p','card-note','Only verified decisive results are included.'));root.append(card)});
  }

  function applyLiveTips(tips){state.live=deriveLiveItems(tips);state.liveReady=true;mergeItems();state.loading=false;render();renderHomePreview()}

  async function load(){
    state.loading=true;render();
    document.addEventListener('sporty:intelligence-updated',event=>applyLiveTips(event.detail?.tips||[]));
    const existing=window.SportyIntelligence?.getModel?.()?.tips;if(Array.isArray(existing)&&existing.length)applyLiveTips(existing);
    try{
      const feedPromise=window.SportyEliteAvailability?.loadData?window.SportyEliteAvailability.loadData():fetch('/data/elite-picks.json',{cache:'no-cache',headers:{Accept:'application/json'}}).then(response=>{if(!response.ok)throw new Error('Elite feed unavailable');return response.json()});
      const [data,performanceResponse]=await Promise.all([feedPromise,fetch('/data/elite-performance.json',{cache:'no-cache',headers:{Accept:'application/json'}})]);
      const generated=window.SportyEliteAvailability?.usableItems?window.SportyEliteAvailability.usableItems(data):(Array.isArray(data?.items)?data.items:[]);
      state.generated=generated.map(normalizeGenerated);mergeItems();if(performanceResponse.ok)renderPerformance(await performanceResponse.json());
    }catch{state.generated=[];mergeItems()}finally{if(!state.liveReady)state.loading=false;render();renderHomePreview()}
  }

  function bind(){
    document.querySelectorAll('[data-elite-filter]').forEach(button=>button.addEventListener('click',()=>{state.filter=button.dataset.eliteFilter||'all';document.querySelectorAll('[data-elite-filter]').forEach(node=>node.classList.toggle('active',node===button));render()}));
    $('#eliteSearch')?.addEventListener('input',event=>{state.search=String(event.target.value||'').trim().toLowerCase();render()});
    $('#closeEliteEvidence')?.addEventListener('click',()=>$('#eliteEvidenceDialog')?.close?.());
  }

  window.SportyElite={get items(){return state.items},reload:load,deriveLiveItems};
  window.__SPORTY_ELITE_BRIDGE_TEST__={deriveLiveItems,weightedStatistics,popularityScore,normalizeClass};
  document.addEventListener('DOMContentLoaded',()=>{bind();load()});
})();
