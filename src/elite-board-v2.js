(()=>{
  'use strict';

  const state={items:[],filter:'all',search:'',loading:true,error:null,payload:null};
  const $=selector=>document.querySelector(selector);
  const text=value=>String(value??'').trim();
  const num=value=>{const n=Number(value);return Number.isFinite(n)?n:null};
  const esc=value=>text(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const localDate=value=>{if(!value)return'Time TBC';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString([], {weekday:'short',hour:'2-digit',minute:'2-digit'}):'Time TBC'};
  const dateOnly=value=>{if(!value)return'Today';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleDateString([], {year:'numeric',month:'short',day:'numeric'}):text(value)};
  const usableFixture=value=>{const fixture=text(value);return fixture&&!/^(fixture|match)$/i.test(fixture)?fixture:''};
  const safeLogo=value=>/^https?:\/\//i.test(text(value))?text(value):'';
  const initials=value=>text(value).split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]?.toUpperCase()||'').join('')||'?';

  function bucket(item){
    const market=text(item.market).toLowerCase();
    if(market.includes('btts')||market.includes('both teams'))return'btts';
    if(market.includes('draw no bet')||market==='dnb'||market.includes('double chance')||market==='dc'||/^1x$|^x2$|^12$/.test(text(item.pick).toLowerCase()))return'safety';
    if(market.includes('over')||market.includes('under')||/[ou]\s?\d/.test(market))return'goals';
    if(market.includes('1x2')||market.includes('match winner'))return'result';
    return'other';
  }

  function className(item){return text(item.classification)==='elite_strong'?'is-strong':'is-supported'}
  function classLabel(item){return text(item.classification)==='elite_strong'?'Strong':'Supported'}
  function score(item){return Math.round(num(item.elite_score)??num(item.engine_rating)??70)}

  function matchContext(item){
    const fixture=usableFixture(item.fixture);if(fixture)return fixture;
    const slipFixture=usableFixture(item.slip_item?.fixture);if(slipFixture)return slipFixture;
    const home=text(item.home_team),away=text(item.away_team);
    return home&&away?`${home} vs ${away}`:'';
  }

  function marketLabel(item){
    const raw=text(item.market)||'Market';
    const lower=raw.toLowerCase();
    if(lower==='1x2'||lower.includes('match winner'))return'Match winner · 1X2';
    if(lower==='dnb'||lower.includes('draw no bet'))return'Draw No Bet';
    if(lower==='dc'||lower.includes('double chance'))return'Double Chance';
    if(lower==='btts'||lower.includes('both teams'))return'Both Teams To Score';
    return raw;
  }

  function predictionText(item){
    const pick=text(item.pick)||'Selection';
    const type=bucket(item);
    if(type==='result')return /\bwin\b/i.test(pick)?pick:`${pick} to win`;
    if(type==='btts'&&(/\bgg\b/i.test(pick)||/both teams to score/i.test(pick)))return'Both teams to score — Yes';
    if(type==='safety'&&/\bdnb\b/i.test(pick))return pick.replace(/\s*DNB\s*$/i,' — Draw No Bet');
    return pick;
  }

  function agreement(item){
    const value=text(item.evidence?.contradiction||item.contradiction||'LOW').toUpperCase();
    return value==='LOW'?'High agreement':value==='MODERATE'?'Some disagreement':'Review signals';
  }

  function reasonPoints(item){
    const raw=text(item.reason)||'Qualified by the Stats2Pitch daily split-stat and market-safety board.';
    const parts=raw.split(/\s*•\s*/).map(text).filter(Boolean);
    return (parts.length?parts:[raw]).slice(0,5);
  }

  function slipKey(item){
    return text(item.id)||[text(item.kickoff).slice(0,10),matchContext(item).toLowerCase(),text(item.market).toLowerCase(),text(item.pick).toLowerCase()].join('|');
  }

  function slipItem(item){
    if(!item)return null;
    const fixture=matchContext(item)||`${text(item.league)||'Stats2Pitch'} — Elite pick`;
    return{
      id:slipKey(item),fixture,
      home_team:text(item.home_team),away_team:text(item.away_team),
      home_logo:safeLogo(item.home_logo),away_logo:safeLogo(item.away_logo),
      market:marketLabel(item),pick:predictionText(item),
      odds:num(item.average_odds)||0,kickoff:item.kickoff||null,
      league:text(item.league),tier:`Elite ${classLabel(item)}`,
      popularity:score(item),appearances:1,sources:1
    };
  }

  function visibleItems(){
    const q=state.search.toLowerCase();
    return state.items.filter(item=>{
      const type=bucket(item);
      if(state.filter!=='all'&&type!==state.filter)return false;
      if(!q)return true;
      const hay=`${matchContext(item)} ${item.league||''} ${item.market||''} ${item.pick||''} ${predictionText(item)}`.toLowerCase();
      return hay.includes(q);
    });
  }

  function renderStats(){
    const total=state.items.length;
    const strong=state.items.filter(x=>text(x.classification)==='elite_strong').length;
    const supported=Math.max(0,total-strong);
    const avg=total?Math.round(state.items.reduce((sum,x)=>sum+score(x),0)/total):0;
    const values={total,strong,supported,average:avg||'—'};
    for(const[key,value]of Object.entries(values)){const node=$(`[data-elite-v2-stat="${key}"]`);if(node)node.textContent=String(value)}
    const boardDate=$('#eliteV2BoardDate');if(boardDate)boardDate.textContent=state.payload?.date?dateOnly(`${state.payload.date}T12:00:00Z`):'Today';
    const updated=$('#eliteV2Updated');if(updated){const stamp=state.items.map(x=>x.last_verified_at).filter(Boolean).sort().pop();updated.textContent=stamp?`Updated ${new Date(stamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`:'Fresh daily feed'}
  }

  function teamSide(name,logo,side){
    const crest=safeLogo(logo);
    return `<div class="elite-v2-team elite-v2-team-${side}">
      <div class="elite-v2-crest-wrap">
        ${crest?`<img class="elite-v2-crest" data-team-crest src="${esc(crest)}" alt="${esc(name)} crest" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:''}
        <span class="elite-v2-crest-fallback" ${crest?'hidden':''}>${esc(initials(name))}</span>
      </div>
      <strong>${esc(name||'Team')}</strong>
    </div>`;
  }

  function matchupBlock(item){
    const context=matchContext(item),home=text(item.home_team),away=text(item.away_team);
    if(home&&away){
      return `<div class="elite-v2-matchup elite-v2-matchup-with-crests">
        <span>Matchup</span>
        <div class="elite-v2-teams-row">
          ${teamSide(home,item.home_logo,'home')}
          <b class="elite-v2-vs">VS</b>
          ${teamSide(away,item.away_logo,'away')}
        </div>
      </div>`;
    }
    return context?`<div class="elite-v2-matchup"><span>Matchup</span><strong>${esc(context)}</strong></div>`:'';
  }

  function card(item,index){
    const reference=num(item.average_odds);
    const reasons=reasonPoints(item).map(point=>`<li>${esc(point)}</li>`).join('');
    const strong=text(item.classification)==='elite_strong';
    const key=slipKey(item);
    return `<article class="elite-v2-card ${className(item)}" data-market-bucket="${bucket(item)}">
      <div class="elite-v2-card-head">
        <div class="elite-v2-context"><div class="elite-v2-league">${esc(item.league||'Competition')}</div></div>
        <div class="elite-v2-kickoff">${esc(localDate(item.kickoff))}</div>
      </div>

      ${matchupBlock(item)}

      <div class="elite-v2-pick-block">
        <div class="elite-v2-pick-label">Today’s pick</div>
        <div class="elite-v2-main-pick">${esc(predictionText(item))}</div>
        <div class="elite-v2-market-row">
          <div class="elite-v2-market-copy"><span>Market</span><strong>${esc(marketLabel(item))}</strong></div>
          <div class="elite-v2-reference"><span>Reference</span><strong>${reference?reference.toFixed(2):'—'}</strong></div>
        </div>
      </div>

      <div class="elite-v2-meta">
        <span class="elite-v2-tag ${strong?'strong':'supported'}">${classLabel(item)}</span>
        <span class="elite-v2-tag">Engine score ${score(item)}</span>
        <span class="elite-v2-tag agreement">${agreement(item)}</span>
      </div>

      <div class="elite-v2-card-actions">
        <button class="elite-v2-add-slip" type="button" data-elite-slip-add="${esc(key)}" data-slip-add-key="${esc(key)}" aria-pressed="false">
          <span class="elite-v2-add-plus" aria-hidden="true">＋</span><span data-add-label>Add to prediction slip</span>
        </button>
      </div>

      <details class="elite-v2-why">
        <summary>Why this pick</summary>
        <ul class="elite-v2-reasons">${reasons}</ul>
      </details>

      <div class="elite-v2-card-foot"><span>Stats2Pitch verified</span><span>#${String(index+1).padStart(2,'0')}</span></div>
    </article>`;
  }

  function wireCrestFallbacks(root=document){
    root.querySelectorAll?.('img[data-team-crest]').forEach(image=>{
      const fallback=image.parentElement?.querySelector('.elite-v2-crest-fallback');
      image.addEventListener('load',()=>{if(fallback)fallback.hidden=true},{once:true});
      image.addEventListener('error',()=>{image.hidden=true;if(fallback)fallback.hidden=false},{once:true});
    });
  }

  function syncSlipUi(){
    const api=window.SportySlip;
    const launcher=$('#eliteV2OpenSlip');
    const count=api?.count?.()||0;
    const countNode=$('#eliteV2SlipCount');if(countNode)countNode.textContent=String(count);
    if(launcher)launcher.setAttribute('aria-label',count?`Open prediction slip with ${count} selection${count===1?'':'s'}`:'Create prediction slip');
    document.querySelectorAll('[data-elite-slip-add]').forEach(button=>{
      const key=text(button.dataset.eliteSlipAdd);
      const item=state.items.find(row=>slipKey(row)===key);
      const payload=slipItem(item);
      if(payload&&api?.has?.(payload))api?.sync?.(payload);
      const added=Boolean(payload&&api?.has?.(payload));
      button.classList.toggle('is-added',added);
      button.setAttribute('aria-pressed',String(added));
      const label=button.querySelector('[data-add-label]');if(label)label.textContent=added?'In prediction slip':'Add to prediction slip';
      const plus=button.querySelector('.elite-v2-add-plus');if(plus)plus.textContent=added?'✓':'＋';
    });
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
    grid.innerHTML=rows.length?rows.map(card).join(''):`<div class="elite-v2-state"><h2>No picks match this view</h2><p>Change the market filter or search term to see today’s available selections.</p></div>`;
    wireCrestFallbacks(grid);
    const count=$('#eliteV2VisibleCount');if(count)count.textContent=`${rows.length} of ${state.items.length} picks`;
    syncSlipUi();
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
    const refresh=$('#eliteV2Refresh');if(refresh)refresh.addEventListener('click',async()=>{refresh.disabled=true;refresh.textContent='Refreshing…';await fetchFeed({force:true});refresh.disabled=false;refresh.textContent='Refresh picks'});
    const launcher=$('#eliteV2OpenSlip');if(launcher)launcher.addEventListener('click',()=>window.SportySlip?.open?.());
    const grid=$('#eliteV2Grid');if(grid)grid.addEventListener('click',event=>{
      const button=event.target.closest?.('[data-elite-slip-add]');
      if(!button)return;
      const key=text(button.dataset.eliteSlipAdd);
      const item=state.items.find(row=>slipKey(row)===key);
      const payload=slipItem(item);
      if(!payload||!window.SportySlip)return;
      if(window.SportySlip.has(payload)){window.SportySlip.sync?.(payload);window.SportySlip.open()}
      else window.SportySlip.add(payload,button);
      syncSlipUi();
    });
    document.addEventListener('sporty:slip-updated',syncSlipUi);
    document.addEventListener('DOMContentLoaded',()=>setTimeout(syncSlipUi,0),{once:true});
  }

  bind();fetchFeed();
})();
