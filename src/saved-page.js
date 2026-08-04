(()=>{
  'use strict';
  const $=selector=>document.querySelector(selector);
  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  let filter='all';

  function rows(){
    const items=window.SportySaved?.getCached()||[];
    const search=String($('#savedSearch')?.value||'').trim().toLowerCase();
    return items.filter(item=>(filter==='all'||item.item_type===filter)&&(!search||`${item.title} ${item.subtitle} ${JSON.stringify(item.payload)}`.toLowerCase().includes(search)));
  }

  async function copy(value){
    try{await navigator.clipboard.writeText(value);toast('Code copied.')}catch{toast('Copy failed.')}
  }
  function toast(text){const node=$('#toast');if(!node)return;node.textContent=text;node.classList.add('show');setTimeout(()=>node.classList.remove('show'),2200)}

  function card(item){
    const p=item.payload||{};
    const node=document.createElement('article');node.className='saved-card';
    const status=item.item_type==='tip'?(p.tier||'saved tip'):(p.status||'saved code');
    node.innerHTML=`<div class="card-top"><div><span class="card-kicker">${esc(item.item_type)}</span><h3>${esc(item.title)}</h3></div><span class="pill ${item.item_status==='changed'?'pill-alert':''}">${esc(status)}</span></div><p class="saved-subtitle">${esc(item.subtitle||'Saved for later')}</p>${p.last_change_note?`<div class="saved-change-note"><strong>Changed</strong><span>${esc(p.last_change_note)}</span></div>`:''}<div class="metric-grid">${item.item_type==='code'?`<div class="metric"><span>Odds</span><strong>${Number(p.odds)>0?Number(p.odds).toFixed(2):'—'}</strong></div><div class="metric"><span>Selections</span><strong>${Number(p.selections)||'—'}</strong></div>`:`<div class="metric"><span>Tip Strength</span><strong>${Number(p.score)>0?`${Math.round(Number(p.score))}/100`:'—'}</strong></div><div class="metric"><span>Opposition</span><strong>${Number.isFinite(Number(p.opposition_share))?`${Number(p.opposition_share).toFixed(1)}%`:'—'}</strong></div>`}</div>`;
    const actions=document.createElement('div');actions.className='card-actions';
    if(item.item_type==='code'&&p.code){
      const copyButton=document.createElement('button');copyButton.className='button secondary';copyButton.type='button';copyButton.textContent='Copy code';copyButton.addEventListener('click',()=>copy(p.code));
      const loadButton=document.createElement('button');loadButton.className='button primary';loadButton.type='button';loadButton.textContent=window.SportyRegion?.isInternational?.()?'Use internationally':'Load Sporty';loadButton.addEventListener('click',async()=>{window.SportySaved.recordRecentCode(item);if(window.SportyRegion?.isInternational?.()){location.href=`/international.html?code=${encodeURIComponent(p.code)}#internationalCodes`;return}const url=(window.SportyRegion?.getLoadUrl?.()||window.SPORTY_CONFIG?.codeHubLoadUrl||'https://www.sportybet.com/gh/m/code-hub/load-code');if(window.SportyHandoff){await window.SportyHandoff.open(p.code,url);return}try{await navigator.clipboard.writeText(p.code)}catch{}location.href=url});
      actions.append(copyButton,loadButton);
    }
    if(window.SportyShare){const sharePayload=item.item_type==='code'?{type:'code',code:p.code,title:item.title,odds:p.odds,selections:p.selections,category:p.category,day:p.day_label||'Saved code'}:{type:'tip',fixture:item.title,market:p.market,pick:p.pick,tier:p.tier,score:p.score,odds:p.average_odds||p.odds,day:p.day_label||'Saved tip'};actions.append(window.SportyShare.button(sharePayload,{className:'button secondary share-button',label:`Share ${item.title}`}))}
    const remove=document.createElement('button');remove.className='button danger-outline';remove.type='button';remove.textContent='Remove';remove.addEventListener('click',async()=>{remove.disabled=true;try{await window.SportySaved.remove(item)}finally{remove.disabled=false}});actions.append(remove);node.append(actions);return node;
  }

  function render(){
    const all=window.SportySaved?.getCached()||[];
    $('#savedTotal').textContent=String(all.length);
    $('#savedCodes').textContent=String(all.filter(item=>item.item_type==='code').length);
    $('#savedTips').textContent=String(all.filter(item=>item.item_type==='tip').length);
    const root=$('#savedGrid');root.innerHTML='';const filtered=rows();
    if(!filtered.length){root.innerHTML='<div class="empty"><strong>No saved items match this view</strong><span>Save a public code or Smart Board tip and it will appear here.</span></div>';return}
    filtered.forEach(item=>root.append(card(item)));
  }

  document.addEventListener('DOMContentLoaded',async()=>{
    document.querySelectorAll('[data-saved-filter]').forEach(button=>button.addEventListener('click',()=>{
      filter=button.dataset.savedFilter;document.querySelectorAll('[data-saved-filter]').forEach(node=>node.classList.toggle('active',node===button));render();
    }));
    $('#savedSearch')?.addEventListener('input',render);
    await window.SportySaved?.load({force:true});render();
    document.addEventListener('sportysavedchange',render);
  });
})();
