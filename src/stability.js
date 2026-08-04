(()=>{
  'use strict';
  const $=s=>document.querySelector(s);
  const text=v=>String(v??'').trim();
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  const date=v=>{const d=v?new Date(v):null;return d&&Number.isFinite(d.getTime())?d:null};
  const ageHours=v=>{const d=date(v);return d?Math.max(0,(Date.now()-d.getTime())/3600000):null};

  function freshness(feed){
    const age=ageHours(feed?.generated_at);
    if(feed?.items?.length&&age!==null&&age<=3)return{label:'Current',tone:'good',detail:'Recently updated'};
    if(feed?.items?.length&&age!==null&&age<=12)return{label:'Recent',tone:'good',detail:'Updated today'};
    if(feed?.items?.length&&age!==null&&age<=36)return{label:'Delayed',tone:'warn',detail:'Check current status before use'};
    if(feed?.items?.length)return{label:'Older data',tone:'warn',detail:'Verify every code before use'};
    return{label:'Updating',tone:'neutral',detail:'Fresh codes are being prepared'};
  }
  function quality(feed){
    const items=Array.isArray(feed?.items)?feed.items:[];
    const mapped=items.filter(item=>Array.isArray(item.tips)&&item.tips.length).length;
    const withDate=items.filter(item=>(item.tips||[]).some(t=>date(t.kickoff))).length;
    if(!items.length)return{label:'Waiting',tone:'neutral'};
    const ratio=mapped/items.length;
    const dateRatio=withDate/items.length;
    if(ratio>=.75&&dateRatio>=.6)return{label:'Strong coverage',tone:'good'};
    if(ratio>=.35)return{label:'Partial coverage',tone:'warn'};
    return{label:'Basic coverage',tone:'neutral'};
  }
  function formatTime(value){const d=date(value);if(!d)return'Preparing';return d.toLocaleString([], {dateStyle:'medium',timeStyle:'short'})}
  function buildStrip(){document.querySelectorAll('.trust-strip').forEach(node=>node.remove())}
  function paint(){buildStrip()}
  document.addEventListener('DOMContentLoaded',()=>{buildStrip();paint()});
  document.addEventListener('sporty:feed-updated',paint);
  window.SportyStability={freshness,quality,paint};
})();
