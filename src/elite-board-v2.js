(()=>{
  'use strict';

  const state={items:[],filter:'all',search:'',loading:true,error:null,payload:null};
  const $=selector=>document.querySelector(selector);
  const text=value=>String(value??'').trim();
  const num=value=>{const n=Number(value);return Number.isFinite(n)?n:null};
  const esc=value=>text(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const localDate=value=>{if(!value)return'—';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString([], {weekday:'short',hour:'2-digit',minute:'2-digit'}):'—'};
  const dateOnly=value=>{if(!value)return'—';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleDateString([], {year:'numeric',month:'short',day:'numeric'}):text(value)};

  function bucket(item){
    const market=text(item.market).toLowerCase();
    if(market.includes('btts')||market.includes('both teams'))return'btts';
    if(market.includes('draw no bet')||market==='dnb'||market.includes('double chance')||market==='dc'||/^1x$|^x2$|^12$/.test(text(item.pick).toLowerCase()))return'safety';
    if(market.includes('over')||market.includes('under')||/[ou]\s?\d/.test(market))return'goals';
    if(market.includes('1x2')||market.includes('match winner'))return'result';
    return'other';
  }

  function className(item){return text(item.classification)==='elite_strong'?'is-strong':'is-supported'}
  function classLabel(item){return text(item.classification)==='elite_strong'?'Elite Strong':'Elite Supported'}
  function score(item){return Math.round(num(item.elite_score)??num(item.engine_rating)??70)}
  function reason(item){return text(item.reason)||'Qualified by the Stats2Pitch daily safety and split-stat board.'}

  function visibleItems(){
    const q=state.search.toLowerCase();
    return state.items.filter(item=>{
      const type=bucket(item);
      if(state.filter!=='all'&&type!==state.filter)return false;
      if(!q)return true;
      const hay=`${item.fixture||''} ${item.league||''} ${item.market||''} ${item.pick||''}`.toLowerCase();
      return hay.includes(q);
    });
  }

  function renderStats(){
    const total=state.items.length;
    const strong=state.items.filter(x=>text(x.classification)==='elite_strong').length;
    const markets=new Set(state.items.map(bucket)).size;
    const avg=total?Math.round(state.items.reduce((sum,x)=>sum+score(x),0)/total):0;
    const values={total,strong,markets,average:avg||'—'};
    for(const[key,value]of Object.entries(values)){const node=$(`[data-elite-v2-stat="${key}"]`);if(node)node.textContent=String(value)}
    const boardDate=$('#eliteV2BoardDate');if(boardDate)boardDate.textContent=state.payload?.date?dateOnly(`${state.payload.date}T12:00:00Z`):'Today';
    const updated=$('#eliteV2Updated');if(updated){const stamp=state.items.map(x=>x.last_verified_at).filter(Boolean).sort().pop();updated.textContent=stamp?`Updated ${new Date(stamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`:'Fresh daily feed'}
  }

  function card(item,index){
    const odds=num(item.average_odds);
    const contradiction=text(item.evidence?.contradiction||item.contradiction||'LOW').toUpperCase();
    const safeContradiction=contradiction==='HIGH'?'MODERATE':contradiction;
    const league=esc(item.league||'Competition');
    const fixture=esc(item.fixture||'Fixture');
    const market=esc(item.market||'Market');
    const pick=esc(item.pick||'Selection');
    return `<article class="elite-v2-card ${className(item)}" data-market-bucket="${bucket(item)}">
      <div class="elite-v2-card-top">
        <div><div class="elite-v2-league">${league}</div><div class="elite-v2-fixture">${fixture}</div></div>
        <div class="elite-v2-score"><span>Score</span><strong>${score(item)}</strong></div>
      </div>
      <div class="elite-v2-selection">
        <div><div class="elite-v2-market">${market}</div><div class="elite-v2-pick">${pick}</div></div>
        <div class="elite-v2-odds">${odds?odds.toFixed(2):'—'}</div>
      </div>
      <div class="elite-v2-meta">
        <span class="elite-v2-tag">${classLabel(item)}</span>
        <span class="elite-v2-tag ${safeContradiction==='LOW'?'low':''}">${esc(safeContradiction)} contradiction</span>
        <span class="elite-v2-tag">${esc(localDate(item.kickoff))}</span>
      </div>
      <p class="elite-v2-reason">${esc(reason(item))}</p>
      <div class="elite-v2-card-foot"><span>Stats2Pitch verified</span><span>#${String(index+1).padStart(2,'0')}</span></div>
    </article>`;
  }

  function render(){
    const loading=$('#eliteV2Loading'),error=$('#eliteV2Error'),empty=$('#eliteV2Empty'),content=$('#eliteV2Content'),grid=$('#eliteV2Grid');
    if(loading)loading.hidden=!state.loading;
    if(error)error.hidden=!state.error;
    if(empty)empty.hidden=state.loading||Boolean(state.error)||state.items.length>0;
    if(content)content.hidden=state.loading||Boolean(state.error)||state.items.length===0;
    if(state.error){const message=$('#eliteV2ErrorMessage');if(message)message.textContent=state.error}
    renderStats();
    if(!grid)return;
    const rows=visibleItems();
    grid.innerHTML=rows.length?rows.map(card).join(''):`<div class="elite-v2-state"><h2>No picks match this view</h2><p>Change the market filter or search term to see the available Stats2Pitch selections.</p></div>`;
    const count=$('#eliteV2VisibleCount');if(count)count.textContent=`${rows.length} of ${state.items.length} picks`;
  }

  async function fetchFeed({force=false}={}){
    state.loading=true;state.error=null;render();
    try{
      const embedded=window.__SPORTY_ELITE_BOOTSTRAP__;
      let payload=!force&&Array.isArray(embedded?.items)&&embedded.items.length?embedded:null;
      if(!payload){
        const response=await fetch(`/api/elite-picks?limit=10&ts=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/json'}});
        if(!response.ok)throw new Error(`Elite feed returned HTTP ${response.status}`);
        payload=await response.json();
      }
      if(!Array.isArray(payload?.items))throw new Error('Elite feed returned an invalid payload');
      state.payload=payload;
      state.items=payload.items.slice(0,10);
    }catch(error){
      state.items=[];state.error=text(error?.message)||'Unable to load today’s Elite feed.';
    }finally{state.loading=false;render()}
  }

  function bind(){
    document.querySelectorAll('[data-elite-v2-filter]').forEach(button=>button.addEventListener('click',()=>{
      document.querySelectorAll('[data-elite-v2-filter]').forEach(x=>x.classList.remove('is-active'));
      button.classList.add('is-active');state.filter=button.dataset.eliteV2Filter||'all';render();
    }));
    const search=$('#eliteV2Search');if(search)search.addEventListener('input',()=>{state.search=text(search.value);render()});
    const refresh=$('#eliteV2Refresh');if(refresh)refresh.addEventListener('click',async()=>{refresh.disabled=true;refresh.textContent='Refreshing…';await fetchFeed({force:true});refresh.disabled=false;refresh.textContent='Refresh feed'});
  }

  bind();fetchFeed();
})();
