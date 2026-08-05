(()=>{
  'use strict';

  const doc=document;
  const root=doc.documentElement;
  const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  const lite=Boolean(connection?.saveData)||Number(navigator.deviceMemory||8)<=4||Number(navigator.hardwareConcurrency||8)<=4;
  if(lite)root.dataset.performance='lite';

  function setViewportHeight(){
    const height=window.visualViewport?.height||window.innerHeight;
    root.style.setProperty('--viewport-height',`${Math.max(320,Math.round(height))}px`);
  }
  setViewportHeight();
  window.visualViewport?.addEventListener('resize',setViewportHeight,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(setViewportHeight,120),{passive:true});

  function applyThemeColor(){
    const dark=root.dataset.theme==='dark';
    root.style.colorScheme=dark?'dark':'light';
    let meta=doc.querySelector('meta[name="theme-color"]');
    if(!meta){meta=doc.createElement('meta');meta.name='theme-color';doc.head.append(meta)}
    meta.content=dark?'#07090d':'#f2f4f8';
    const button=doc.querySelector('#themeButton');
    if(button){
      button.textContent=dark?'☾':'☀';
      button.setAttribute('aria-label',dark?'Switch to light theme':'Switch to dark theme');
      button.title=dark?'Switch to light theme':'Switch to dark theme';
    }
  }
  applyThemeColor();

  doc.addEventListener('click',event=>{
    const button=event.target.closest?.('#themeButton');
    if(!button)return;
    event.preventDefault();
    const next=root.dataset.theme==='dark'?'light':'dark';
    root.dataset.theme=next;
    try{localStorage.setItem('sporty_theme',next)}catch{}
    applyThemeColor();
  });
  new MutationObserver((mutations)=>{
    if(mutations.some(item=>item.attributeName==='data-theme')){
      root.classList.add('theme-switching');
      applyThemeColor();
      setTimeout(()=>root.classList.remove('theme-switching'),320);
    }
  }).observe(root,{attributes:true,attributeFilter:['data-theme']});

  const progress=doc.createElement('div');
  progress.className='page-progress';
  progress.setAttribute('aria-hidden','true');
  progress.innerHTML='<i></i>';
  doc.body.prepend(progress);
  const progressBar=progress.firstElementChild;
  progressBar.style.width='34%';
  requestAnimationFrame(()=>{progressBar.style.width='72%'});

  function currentPath(path){
    const clean=(path||'/').replace(/index\.html$/,'').replace(/\/+$/,'')||'/';
    return clean;
  }
  const here=currentPath(location.pathname);
  doc.querySelectorAll('.desktop-nav a,.mobile-nav a').forEach(link=>{
    try{
      const target=currentPath(new URL(link.href,location.href).pathname);
      const active=target===here||(here==='/free-codes'&&target==='/marketplace.html');
      link.classList.toggle('active',active);
      if(active)link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
    }catch{}
  });

  const ELITE_CACHE_KEY='sporty_elite_availability_v2';
  const ELITE_CACHE_MS=90*1000;
  let eliteFeedPromise=null;
  function usableEliteItems(data){
    const allowed=new Set(['elite_verified','elite_strong','elite_supported','trending','elite_watch']);
    return (Array.isArray(data?.items)?data.items:[]).filter(item=>allowed.has(String(item?.classification||''))&&String(item?.fixture||'').trim()&&String(item?.pick||'').trim());
  }
  function cachedEliteFeed(){
    try{
      const cached=JSON.parse(sessionStorage.getItem(ELITE_CACHE_KEY)||'null');
      if(cached&&Date.now()-Number(cached.saved_at||0)<ELITE_CACHE_MS&&Array.isArray(cached.data?.items))return cached.data;
    }catch{}
    return null;
  }
  function loadEliteFeed(){
    if(eliteFeedPromise)return eliteFeedPromise;
    const cached=cachedEliteFeed();
    if(cached)eliteFeedPromise=Promise.resolve(cached);
    else eliteFeedPromise=fetch('/data/elite-picks.json',{cache:'no-cache',headers:{Accept:'application/json'}})
      .then(response=>{if(!response.ok)throw new Error('Elite feed unavailable');return response.json()})
      .then(data=>{
        const clean={...data,items:usableEliteItems(data)};
        try{sessionStorage.setItem(ELITE_CACHE_KEY,JSON.stringify({saved_at:Date.now(),data:clean}))}catch{}
        return clean;
      })
      .catch(()=>({items:[]}));
    return eliteFeedPromise;
  }
  function applyEliteAvailability(data){
    const available=usableEliteItems(data).length>0;
    root.dataset.eliteAvailable=available?'true':'false';
    root.dataset.eliteAvailabilityReady='true';
    // The Elite destination remains visible even when today's board is empty.
    // Only populated homepage previews are hidden; navigation is never removed.
    return data;
  }
  window.SportyEliteAvailability={loadData:loadEliteFeed,usableItems:usableEliteItems};
  loadEliteFeed().then(applyEliteAvailability);

  const revealSelector='.section,.code-card,.tip-card,.winner-card,.category-card,.intelligence-card,.contradiction-card,.performance-card,.source-card,.saved-card,.account-panel,.privacy-card,.privacy-note,.control-panel,.audience-metric';
  let observer=null;
  if(!reduceMotion&&!lite&&'IntersectionObserver' in window){
    root.classList.add('motion-ready');
    observer=new IntersectionObserver(entries=>{
      for(const entry of entries){
        if(entry.isIntersecting){
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      }
    },{rootMargin:'90px 0px 90px',threshold:.06});
  }

  function prepareElement(element){
    if(!(element instanceof Element))return;
    const candidates=element.matches?.(revealSelector)?[element]:Array.from(element.querySelectorAll?.(revealSelector)||[]);
    for(const item of candidates){
      if(item.dataset.motionBound==='1')continue;
      item.dataset.motionBound='1';
      if(observer){item.classList.add('reveal-target');observer.observe(item)}
      else item.classList.add('is-visible');
    }
    const images=element.matches?.('img')?[element]:Array.from(element.querySelectorAll?.('img')||[]);
    for(const image of images){
      if(!image.hasAttribute('decoding'))image.decoding='async';
      if(!image.closest('.topbar')&&!image.hasAttribute('loading'))image.loading='lazy';
    }
  }

  prepareElement(doc.body);
  if('MutationObserver' in window){
    let queued=[];
    let scheduled=false;
    const flush=()=>{
      scheduled=false;
      const batch=queued.splice(0,80);
      for(const node of batch)prepareElement(node);
      if(queued.length)schedule();
    };
    const schedule=()=>{
      if(scheduled)return;
      scheduled=true;
      (window.requestIdleCallback||((callback)=>setTimeout(callback,40)))(flush,{timeout:180});
    };
    new MutationObserver(records=>{
      for(const record of records){
        for(const node of record.addedNodes){if(node.nodeType===1)queued.push(node)}
      }
      schedule();
    }).observe(doc.body,{childList:true,subtree:true});
  }

  let prefetched=new Set();
  const canPrefetch=!connection?.saveData&&!['slow-2g','2g'].includes(connection?.effectiveType||'');
  function prefetchLink(event){
    if(!canPrefetch)return;
    const anchor=event.target.closest?.('a[href]');
    if(!anchor||anchor.target==='_blank'||anchor.hasAttribute('download'))return;
    const url=new URL(anchor.href,location.href);
    if(url.origin!==location.origin||url.pathname===location.pathname||prefetched.has(url.href))return;
    prefetched.add(url.href);
    const hint=doc.createElement('link');
    hint.rel='prefetch';hint.href=url.href;hint.as='document';
    doc.head.append(hint);
  }
  doc.addEventListener('pointerover',prefetchLink,{passive:true,capture:true});
  doc.addEventListener('touchstart',prefetchLink,{passive:true,capture:true});

  let previousY=window.scrollY;
  let ticking=false;
  function updateScrollState(){
    ticking=false;
    const y=window.scrollY;
    const nav=doc.querySelector('.mobile-nav');
    if(nav){
      nav.classList.toggle('is-compact',y>previousY&&y>160);
      if(Math.abs(y-previousY)>10)previousY=y;
    }
    const max=Math.max(1,doc.documentElement.scrollHeight-window.innerHeight);
    progressBar.style.width=`${Math.min(100,Math.max(0,(y/max)*100))}%`;
  }
  window.addEventListener('scroll',()=>{
    if(!ticking){ticking=true;requestAnimationFrame(updateScrollState)}
  },{passive:true});

  doc.addEventListener('visibilitychange',()=>{
    root.toggleAttribute('data-page-hidden',doc.hidden);
  });
  window.addEventListener('pageshow',()=>{
    progressBar.style.width='100%';
    requestAnimationFrame(()=>doc.body.classList.add('app-ready'));
  },{once:true});

  if(doc.readyState==='loading'){
    doc.addEventListener('DOMContentLoaded',()=>{
      progressBar.style.width='92%';
      requestAnimationFrame(()=>doc.body.classList.add('app-ready'));
    },{once:true});
  }else{
    progressBar.style.width='92%';
    requestAnimationFrame(()=>doc.body.classList.add('app-ready'));
  }
})();
