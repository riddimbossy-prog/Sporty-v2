(()=>{
  'use strict';
  const state={items:[],filter:'all',search:'',loading:true};
  const $=selector=>document.querySelector(selector);
  const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node};
  const clear=node=>{if(node)while(node.firstChild)node.removeChild(node.firstChild)};
  const text=value=>String(value??'').trim();
  const number=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:0};
  const pct=value=>`${number(value).toFixed(number(value)<10?1:0)}%`;
  const day=value=>{const date=value?new Date(value):null;return date&&Number.isFinite(date.getTime())?date.toLocaleString([], {dateStyle:'medium',timeStyle:'short'}):'Date unavailable'};
  const setSection=(selector,visible)=>{const node=$(selector);if(node)node.hidden=!visible};
  const toast=message=>{const node=$('#toast');if(!node)return;node.textContent=message;node.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),2600)};

  function classificationClass(value){return value==='elite_verified'?'is-verified':value==='elite_supported'?'is-supported':'is-trending'}
  function evidenceText(item){
    if(!item.statistics_complete)return'Statistical verification is still developing.';
    if(item.opposition_level==='Low')return'Independent consensus and venue-adjusted statistics agree with low opposition.';
    return'Independent consensus is statistically supported, with some opposing evidence retained in the score.';
  }
  function metric(label,value){const node=el('div','elite-metric');node.append(el('span','',label),el('strong','',value));return node}

  function card(item,{compact=false}={}){
    const article=el('article',`elite-card ${classificationClass(item.classification)}${compact?' compact':''}`);
    const head=el('div','elite-card-head');const badge=el('span','elite-badge',item.label||'Trending');const score=el('div','elite-score');score.append(el('span','','Elite Score'),el('strong','',Math.round(number(item.elite_score))));head.append(badge,score);
    const title=el('div','elite-title');title.append(el('span','elite-market',text(item.market)||'Market'),el('h3','',text(item.fixture)||'Fixture unavailable'),el('p','elite-pick',text(item.pick)||'Selection unavailable'));
    const metrics=el('div','elite-metrics');metrics.append(metric('Independent groups',number(item.independent_groups??item.independent_sources)),metric('Total additions',number(item.total_additions)),metric('Statistical score',`${Math.round(number(item.statistical_score))}/50`),metric('Opposition',item.opposition_level||'—'));
    const proof=el('div','elite-proof');proof.append(el('p','',evidenceText(item)));
    const meta=el('div','elite-meta');meta.append(el('span','',day(item.kickoff)),el('span','',item.average_odds?`Avg odds ${number(item.average_odds).toFixed(2)}`:'Odds unavailable'),el('span','',item.trend||'Developing'));
    article.append(head,title,metrics,proof,meta);
    const actions=el('div','card-actions elite-actions');
    const details=el('button','button secondary','View evidence');details.type='button';details.addEventListener('click',()=>openEvidence(item));actions.append(details);
    if(window.SportySaved?.button){actions.append(window.SportySaved.button(window.SportySaved.tipItem({fixture:item.fixture,market:item.market,pick:item.pick,tier:item.label,score:item.elite_score,average_odds:item.average_odds,kickoff:item.kickoff,league:item.league,category:'Elite Picks'}),{className:'button secondary save-button'}))}
    if(window.SportyShare?.button){actions.append(window.SportyShare.button({type:'tip',fixture:item.fixture,market:item.market,pick:item.pick,tier:item.label,score:item.elite_score,odds:item.average_odds,day:day(item.kickoff)},{className:'button secondary share-button',label:`Share ${text(item.fixture)}`}))}
    article.append(actions);return article;
  }

  function openEvidence(item){
    const dialog=$('#eliteEvidenceDialog');if(!dialog)return;$('#eliteEvidenceTitle').textContent=item.fixture||'Elite evidence';$('#eliteEvidencePick').textContent=`${item.market}: ${item.pick}`;
    const grid=$('#eliteEvidenceGrid');clear(grid);grid.append(metric('Consensus score',`${Math.round(number(item.consensus_score))}/50`),metric('Statistical score',`${Math.round(number(item.statistical_score))}/50`),metric('Independent groups',number(item.independent_groups??item.independent_sources)),metric('Source reliability',pct(item.source_reliability)),metric('Opposition',pct(item.opposition_share)),metric('Match confidence',item.evidence?.match_confidence?pct(item.evidence.match_confidence):'Pending'));
    $('#eliteEvidenceReason').textContent=item.reason||evidenceText(item);$('#eliteEvidenceUpdated').textContent=item.last_verified_at?`Last checked ${new Date(item.last_verified_at).toLocaleString()}`:'Verification time unavailable';
    if(typeof dialog.showModal==='function')dialog.showModal();else dialog.hidden=false;
  }

  function filtered(){return state.items.filter(item=>{const classOk=state.filter==='all'||item.classification===state.filter;const haystack=`${item.fixture} ${item.market} ${item.pick} ${item.league}`.toLowerCase();return classOk&&(!state.search||haystack.includes(state.search))})}

  function render(){
    const root=$('#eliteGrid');if(!root)return;clear(root);const rows=filtered();
    const values={verified:state.items.filter(row=>row.classification==='elite_verified').length,supported:state.items.filter(row=>row.classification==='elite_supported').length,trending:state.items.filter(row=>row.classification==='trending').length,total:state.items.length};
    const hasItems=state.items.length>0;
    setSection('#eliteContent',hasItems);setSection('#eliteStatsSection',hasItems);setSection('#eliteLoading',state.loading);setSection('#eliteEmpty',!state.loading&&!hasItems);
    for(const[key,value]of Object.entries(values)){
      const node=$(`[data-elite-stat="${key}"]`);
      if(node){node.textContent=String(value);const card=node.closest('.stat-card');if(card)card.hidden=value<=0}
      const filter=document.querySelector(`[data-elite-filter="elite_${key}"]`)||document.querySelector(`[data-elite-filter="${key}"]`);
      if(filter)filter.hidden=value<=0;
    }
    if(!state.items.length)return;
    if(!rows.length){const empty=el('div','empty-state');empty.append(el('h3','','No Elite Picks match this filter'),el('p','','Change the filter to view the available statistically verified candidates.'));root.append(empty);return}
    rows.forEach(item=>root.append(card(item)));
  }

  function renderHomePreview(){
    const root=$('#eliteHomeGrid');if(!root)return;clear(root);const rows=state.items.filter(item=>item.classification!=='trending').slice(0,3);const section=root.closest('[data-population-section]');if(section)section.hidden=!rows.length;if(!rows.length)return;rows.forEach(item=>root.append(card(item,{compact:true})));
  }

  function renderPerformance(data){
    const root=$('#elitePerformanceGrid');if(!root)return;clear(root);const rows=(data?.groups||[]).filter(row=>row.sample_ready===true&&number(row.settled)>=30);const section=$('#elitePerformanceSection');if(section)section.hidden=!rows.length;if(!rows.length)return;
    rows.forEach(row=>{const card=el('article','performance-card elite-performance-card');const top=el('div','card-top');top.append(el('div','card-kicker','Verified Elite sample'),el('strong','',`${number(row.hit_rate).toFixed(1)}% hit rate`));card.append(top,el('h3','',row.label||row.classification));const metrics=el('div','metric-grid');metrics.append(metric('Settled',number(row.settled)),metric('Won',number(row.won)),metric('Lost',number(row.lost)),metric('Minimum sample','30'));card.append(metrics,el('p','card-note','Only verified decisive results are included.'));root.append(card)});
  }

  async function load(){
    state.loading=true;render();
    try{
      const feedPromise=window.SportyEliteAvailability?.loadData?window.SportyEliteAvailability.loadData():fetch('/data/elite-picks.json',{cache:'no-cache',headers:{Accept:'application/json'}}).then(response=>{if(!response.ok)throw new Error('Elite feed unavailable');return response.json()});
      const [data,performanceResponse]=await Promise.all([feedPromise,fetch('/data/elite-performance.json',{cache:'no-cache',headers:{Accept:'application/json'}})]);
      state.items=window.SportyEliteAvailability?.usableItems?window.SportyEliteAvailability.usableItems(data):(Array.isArray(data?.items)?data.items:[]);
      if(performanceResponse.ok)renderPerformance(await performanceResponse.json());
    }catch{state.items=[]}finally{state.loading=false;render();renderHomePreview()}
  }

  function bind(){
    document.querySelectorAll('[data-elite-filter]').forEach(button=>button.addEventListener('click',()=>{state.filter=button.dataset.eliteFilter||'all';document.querySelectorAll('[data-elite-filter]').forEach(node=>node.classList.toggle('active',node===button));render()}));
    $('#eliteSearch')?.addEventListener('input',event=>{state.search=String(event.target.value||'').trim().toLowerCase();render()});
    $('#closeEliteEvidence')?.addEventListener('click',()=>$('#eliteEvidenceDialog')?.close?.());
  }

  window.SportyElite={get items(){return state.items},reload:load};
  document.addEventListener('DOMContentLoaded',()=>{bind();load()});
})();
