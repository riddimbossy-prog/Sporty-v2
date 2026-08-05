(()=>{
  'use strict';

  const STORAGE_KEY='sporty_prediction_slip_v2160';
  const POSITION_KEY='sporty_prediction_slip_fab_position_v2160';
  const MAX_SELECTIONS=20;
  const state={items:[],practicePoints:10,open:false};
  let shell=null,fab=null,list=null,countNode=null,totalNode=null,pointsNode=null,returnNode=null,saveStateNode=null;

  const text=value=>String(value??'').replace(/\s+/g,' ').trim();
  const number=value=>{const n=Number(String(value??'').replace(/,/g,''));return Number.isFinite(n)?n:0};
  const safeOdds=value=>{const n=number(value);return n>1&&n<=1000?n:0};
  const matchCount=(value,pattern)=>(text(value).match(pattern)||[]).length;
  function isAtomicItem(item={}){
    if(window.SportyMVP?.isAtomicTip)return window.SportyMVP.isAtomicTip(item);
    const fixture=text(item.fixture),market=text(item.market),pick=text(item.pick);
    if(!fixture||!market||!pick||fixture.length>180||market.length>90||pick.length>120)return false;
    if(matchCount(fixture,/\b(?:vs?|versus)\b|\s[-–—]\s/gi)>1)return false;
    if(matchCount(fixture,/\b(?:over\/under|double chance|draw no bet|match winner|both teams to score|team total|1x2)\b/gi)>1)return false;
    return true;
  }
  const keyFor=item=>text(item.id)||[text(item.kickoff).slice(0,10),text(item.fixture).toLowerCase(),text(item.market).toLowerCase(),text(item.pick).toLowerCase()].join('|');
  const combinedOdds=()=>state.items.reduce((total,item)=>total*(safeOdds(item.odds)||1),1);
  const projectedPoints=()=>state.practicePoints*combinedOdds();
  const dayLabel=value=>window.SportyMVP?.dayLabel?.(value)||'Date unavailable';

  function toast(message){
    const node=document.getElementById('toast');
    if(!node)return;
    node.textContent=message;node.classList.add('show');
    clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),2500);
  }

  function normalize(item={}){
    const fixture=text(item.fixture),market=text(item.market),pick=text(item.pick),odds=safeOdds(item.odds);
    if(!isAtomicItem({fixture,market,pick}))return null;
    return{
      id:keyFor(item),fixture,market,pick,odds,
      kickoff:item.kickoff||null,league:text(item.league),tier:text(item.tier)||'Popular',
      popularity:Math.max(0,Math.min(100,Math.round(number(item.popularity)))),
      appearances:Math.max(0,Math.floor(number(item.appearances))),
      sources:Math.max(0,Math.floor(number(item.sources)))
    };
  }

  function load(){
    try{
      const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
      const original=Array.isArray(raw.items)?raw.items:[];
      state.items=original.map(normalize).filter(Boolean).slice(0,MAX_SELECTIONS);
      const points=number(raw.practicePoints);state.practicePoints=points>=0&&points<=100000?points:10;
      if(state.items.length!==original.length)persist();
    }catch{state.items=[];state.practicePoints=10}
  }

  function persist(){
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,items:state.items,practicePoints:state.practicePoints,updatedAt:new Date().toISOString()}));return true}catch{return false}
  }

  function selectionRow(item){
    const row=document.createElement('article');row.className='prediction-slip-item';row.dataset.slipKey=item.id;
    const copy=document.createElement('div');copy.className='prediction-slip-item-copy';
    const tags=document.createElement('div');tags.className='pill-row';
    const day=document.createElement('span');day.className='pill day-pill';day.textContent=dayLabel(item.kickoff);
    const tier=document.createElement('span');tier.className='pill';tier.textContent=item.tier;
    tags.append(day,tier);
    const title=document.createElement('strong');title.textContent=item.fixture;
    const pick=document.createElement('span');pick.textContent=`${item.market}: ${item.pick}`;
    copy.append(tags,title,pick);
    const side=document.createElement('div');side.className='prediction-slip-item-side';
    const odds=document.createElement('b');odds.textContent=item.odds?item.odds.toFixed(2):'—';
    const remove=document.createElement('button');remove.type='button';remove.className='prediction-slip-remove';remove.setAttribute('aria-label',`Remove ${item.fixture}`);remove.textContent='×';remove.addEventListener('click',()=>removeItem(item.id));
    side.append(odds,remove);row.append(copy,side);return row;
  }

  function render(){
    if(!shell)return;
    list.textContent='';
    if(!state.items.length){
      const empty=document.createElement('div');empty.className='prediction-slip-empty';
      const icon=document.createElement('span');icon.textContent='＋';
      const strong=document.createElement('strong');strong.textContent='Your prediction slip is empty';
      const copy=document.createElement('p');copy.textContent='Tap the round + button beside a popular tip to add it here.';
      empty.append(icon,strong,copy);list.append(empty);
    }else state.items.forEach(item=>list.append(selectionRow(item)));
    const total=combinedOdds();
    countNode.textContent=String(state.items.length);
    countNode.hidden=state.items.length===0;
    totalNode.textContent=state.items.length?total.toFixed(2):'1.00';
    if(pointsNode&&document.activeElement!==pointsNode)pointsNode.value=String(state.practicePoints||0);
    returnNode.textContent=state.items.length?projectedPoints().toFixed(2):'0.00';
    const summary=document.querySelector('[data-slip-summary-count]');if(summary)summary.textContent=`${state.items.length} selection${state.items.length===1?'':'s'}`;
    document.querySelectorAll('[data-popular-stat="my-slip"]').forEach(node=>node.textContent=String(state.items.length));
    document.querySelectorAll('[data-slip-add-key]').forEach(button=>{
      const active=state.items.some(item=>item.id===button.dataset.slipAddKey);
      button.classList.toggle('is-added',active);button.setAttribute('aria-pressed',String(active));
      const label=button.querySelector('[data-add-label]');if(label)label.textContent=active?'Added':'Add';
    });
  }

  function open(){state.open=true;shell.hidden=false;document.documentElement.classList.add('prediction-slip-open');requestAnimationFrame(()=>shell.classList.add('is-open'));render()}
  function close(){state.open=false;shell.classList.remove('is-open');document.documentElement.classList.remove('prediction-slip-open');setTimeout(()=>{if(!state.open)shell.hidden=true},220)}
  function toggle(){state.open?close():open()}

  function fly(source){
    if(!source||!fab||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const from=source.getBoundingClientRect(),to=fab.getBoundingClientRect();
    const chip=document.createElement('span');chip.className='slip-fly-chip';chip.textContent='＋';
    chip.style.left=`${from.left+from.width/2-15}px`;chip.style.top=`${from.top+from.height/2-15}px`;
    document.body.append(chip);
    requestAnimationFrame(()=>{chip.style.transform=`translate(${to.left+to.width/2-(from.left+from.width/2)}px,${to.top+to.height/2-(from.top+from.height/2)}px) scale(.25)`;chip.style.opacity='0'});
    setTimeout(()=>chip.remove(),700);
  }

  function pulse(){
    if(!fab)return;fab.classList.remove('slip-pop');void fab.offsetWidth;fab.classList.add('slip-pop');setTimeout(()=>fab.classList.remove('slip-pop'),750)
  }

  function add(raw,source=null){
    const item=normalize(raw);if(!item)return false;
    const existing=state.items.find(row=>row.id===item.id);
    if(existing){open();toast('This tip is already in your prediction slip.');return false}
    if(state.items.length>=MAX_SELECTIONS){toast(`A prediction slip can contain up to ${MAX_SELECTIONS} tips.`);return false}
    state.items.push(item);persist();fly(source);pulse();render();
    document.dispatchEvent(new CustomEvent('sporty:slip-updated',{detail:{items:[...state.items]}}));
    toast(`${item.fixture} added to your prediction slip.`);return true;
  }

  function removeItem(id){state.items=state.items.filter(item=>item.id!==id);persist();render();document.dispatchEvent(new CustomEvent('sporty:slip-updated',{detail:{items:[...state.items]}}))}
  function clear(){if(!state.items.length)return;state.items=[];persist();render();document.dispatchEvent(new CustomEvent('sporty:slip-updated',{detail:{items:[]}}));toast('Prediction slip cleared.')}
  function has(raw){const item=normalize(raw);return Boolean(item&&state.items.some(row=>row.id===item.id))}
  function count(){return state.items.length}

  function save(){
    const ok=persist();
    saveStateNode.textContent=ok?'Saved on this device':'Could not save on this device';
    saveStateNode.classList.toggle('is-error',!ok);toast(ok?'Prediction slip saved on this device.':'Could not save the slip.');
  }

  function share(){
    if(!state.items.length){toast('Add at least one popular tip first.');return}
    if(!window.SportyShare){toast('Sharing is still loading.');return}
    const days=[...new Set(state.items.map(item=>dayLabel(item.kickoff)))];
    const day=days.length===1?days[0]:'Multiple days';
    window.SportyShare.share({
      type:'slip',title:'My sporty.codes prediction slip',items:state.items,
      totalOdds:combinedOdds(),practicePoints:state.practicePoints,projectedPoints:projectedPoints(),day,
      url:location.href.split('#')[0]
    });
  }

  function restorePosition(){
    try{
      const value=JSON.parse(localStorage.getItem(POSITION_KEY)||'null');
      if(!value||!Number.isFinite(value.x)||!Number.isFinite(value.y))return;
      const size=76,margin=10;
      fab.style.left=`${Math.max(margin,Math.min(innerWidth-size-margin,value.x))}px`;
      fab.style.top=`${Math.max(margin,Math.min(innerHeight-size-margin,value.y))}px`;
      fab.style.right='auto';fab.style.bottom='auto';
    }catch{}
  }

  function makeDraggable(){
    let drag=null;
    fab.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      const rect=fab.getBoundingClientRect();drag={id:event.pointerId,startX:event.clientX,startY:event.clientY,offsetX:event.clientX-rect.left,offsetY:event.clientY-rect.top,moved:false};
      fab.setPointerCapture?.(event.pointerId);
    });
    fab.addEventListener('pointermove',event=>{
      if(!drag||event.pointerId!==drag.id)return;
      if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>5)drag.moved=true;
      if(!drag.moved)return;
      const size=fab.offsetWidth||72,margin=8;
      const x=Math.max(margin,Math.min(innerWidth-size-margin,event.clientX-drag.offsetX));
      const y=Math.max(margin,Math.min(innerHeight-size-margin,event.clientY-drag.offsetY));
      fab.style.left=`${x}px`;fab.style.top=`${y}px`;fab.style.right='auto';fab.style.bottom='auto';
    });
    const finish=event=>{
      if(!drag||event.pointerId!==drag.id)return;
      const wasMoved=drag.moved;drag=null;
      if(wasMoved){
        const rect=fab.getBoundingClientRect();try{localStorage.setItem(POSITION_KEY,JSON.stringify({x:rect.left,y:rect.top}))}catch{}
      }else toggle();
    };
    fab.addEventListener('pointerup',finish);fab.addEventListener('pointercancel',()=>{drag=null});
    fab.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle()}});
  }

  function build(){
    fab=document.createElement('button');fab.type='button';fab.id='predictionSlipFab';fab.className='prediction-slip-fab';fab.setAttribute('aria-label','Open prediction slip');fab.innerHTML='<span class="prediction-slip-fab-ring" aria-hidden="true"></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14l-1.4 14H6.4L5 4Z"/><path d="M8 8h8M8.5 12h7M9 16h6"/></svg><span class="prediction-slip-count" hidden>0</span>';
    countNode=fab.querySelector('.prediction-slip-count');document.body.append(fab);restorePosition();makeDraggable();

    shell=document.createElement('div');shell.className='prediction-slip-shell';shell.hidden=true;shell.innerHTML=`
      <div class="prediction-slip-backdrop" data-slip-close></div>
      <aside class="prediction-slip-drawer" role="dialog" aria-modal="true" aria-labelledby="predictionSlipTitle">
        <div class="prediction-slip-handle" aria-hidden="true"></div>
        <header class="prediction-slip-head">
          <div><div class="eyebrow">sporty.codes builder</div><h2 id="predictionSlipTitle">My prediction slip</h2><p data-slip-summary-count>0 selections</p></div>
          <button class="prediction-slip-close" type="button" aria-label="Close prediction slip" data-slip-close>×</button>
        </header>
        <div class="prediction-slip-list" id="predictionSlipList"></div>
        <section class="prediction-slip-calculator" aria-label="Practice points calculator">
          <div class="prediction-slip-total"><span>Combined odds</span><strong id="predictionSlipTotal">1.00</strong></div>
          <label>Practice points<input id="predictionPracticePoints" type="number" min="0" max="100000" step="1" inputmode="decimal" value="10"></label>
          <div class="prediction-slip-return"><span>Projected points</span><strong id="predictionProjectedPoints">0.00</strong></div>
          <p>Simulation only. No payment, wallet, real-money stake or wager is processed by sporty.codes.</p>
        </section>
        <div class="prediction-slip-actions">
          <button class="button primary" type="button" id="predictionShareSlip">Share branded image</button>
          <button class="button secondary" type="button" id="predictionSaveSlip">Save on device</button>
          <button class="button ghost prediction-slip-clear" type="button" id="predictionClearSlip">Clear</button>
        </div>
        <small class="prediction-slip-save-state" id="predictionSlipSaveState">Your slip is stored only on this device.</small>
      </aside>`;
    document.body.append(shell);
    list=shell.querySelector('#predictionSlipList');totalNode=shell.querySelector('#predictionSlipTotal');pointsNode=shell.querySelector('#predictionPracticePoints');returnNode=shell.querySelector('#predictionProjectedPoints');saveStateNode=shell.querySelector('#predictionSlipSaveState');
    shell.querySelectorAll('[data-slip-close]').forEach(node=>node.addEventListener('click',close));
    shell.querySelector('#predictionShareSlip').addEventListener('click',share);
    shell.querySelector('#predictionSaveSlip').addEventListener('click',save);
    shell.querySelector('#predictionClearSlip').addEventListener('click',clear);
    pointsNode.addEventListener('input',()=>{const value=number(pointsNode.value);state.practicePoints=Math.max(0,Math.min(100000,value));persist();returnNode.textContent=state.items.length?projectedPoints().toFixed(2):'0.00'});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.open)close()});
  }

  function init(){load();build();render()}
  window.SportySlip={add,remove:removeItem,clear,open,close,toggle,has,count,getState:()=>({items:[...state.items],practicePoints:state.practicePoints,totalOdds:combinedOdds(),projectedPoints:projectedPoints()})};
  document.addEventListener('DOMContentLoaded',init);
})();
