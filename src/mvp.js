(()=>{
  'use strict';

  const config=window.SPORTY_CONFIG||{};
  const state={
    feed:{status:'loading',generated_at:null,items:[],error:null},health:{state:'preparing',last_successful_at:null,max_public_age_hours:30},resultsSummary:{verified_total:0,verified_won:0,verified_lost:0,verified_void:0,needs_review:0,latest_verified_at:null},settlementLedger:{entries:[]},
    page:document.body.dataset.page||'home',
    carouselTimer:null,carouselPaused:false,
    codeFilters:{search:'',category:'all',odds:'all',size:'all',day:'all',sort:'latest'},
    tipFilters:{search:'',category:'all',share:'all',sort:'share',day:'all'},
    feedSource:'network',feedFallback:false
  };

  const $=selector=>document.querySelector(selector);
  const $$=selector=>[...document.querySelectorAll(selector)];
  const clear=node=>{if(node)while(node.firstChild)node.removeChild(node.firstChild)};
  const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node};
  const text=value=>String(value??'').trim();
  const number=value=>{const n=Number(String(value??'').replace(/,/g,''));return Number.isFinite(n)?n:0};
  const slug=value=>text(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const dateValue=value=>{if(value===null||value===undefined||String(value).trim()==='')return null;const d=new Date(value);return Number.isFinite(d.getTime())?d:null};
  const startOfDay=value=>{const d=dateValue(value)||new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate())};
  const isoDay=value=>{const d=dateValue(value);if(!d)return 'undated';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const dayDiff=(value,base=new Date())=>{const d=dateValue(value);if(!d)return null;return Math.round((startOfDay(d)-startOfDay(base))/86400000)};
  function dayLabel(value){const d=dateValue(value);if(!d)return 'Date unavailable';const diff=dayDiff(d);if(diff===0)return 'Today';if(diff===1)return 'Tomorrow';if(diff===-1)return 'Yesterday';return d.toLocaleDateString([], {weekday:'short',day:'numeric',month:'short'})}
  function dayFilterMatches(value,filter){if(filter==='all')return true;const diff=dayDiff(value);if(filter==='undated')return diff===null;if(diff===null)return false;if(filter==='today')return diff===0;if(filter==='tomorrow')return diff===1;if(filter==='week')return diff>=0&&diff<=6;return true}
  const daySortValue=value=>{const d=dateValue(value);return d?startOfDay(d).getTime():Number.MAX_SAFE_INTEGER};
  const toast=message=>{const node=$('#toast');if(!node)return;node.textContent=message;node.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),2600)};
  function populationSection(root){return root?.matches?.('[data-population-section]')?root:root?.closest?.('[data-population-section]')||null}
  function setPopulated(root,hasContent){const section=populationSection(root);if(section)section.hidden=!Boolean(hasContent);return Boolean(hasContent)}
  const feedAgeHours=value=>{const date=dateValue(value);return date?Math.max(0,(Date.now()-date.getTime())/3600000):Number.POSITIVE_INFINITY}
  const completeFeedItem=item=>Boolean(text(item?.code)&&number(item?.odds)>1&&number(item?.selections)>0)
  const feedIsCurrent=generatedAt=>feedAgeHours(generatedAt)<=Math.max(6,number(state.health?.max_public_age_hours)||30)

  function officialLoadUrl(){return window.SportyRegion?.getLoadUrl?.()||text(config.codeHubLoadUrl)||'https://www.sportybet.com/gh/m/code-hub/load-code'}
  function internationalMode(){return Boolean(window.SportyRegion?.isInternational?.())}
  function impliedChance(odds){const value=number(odds);return value>1?Math.min(100,100/value):0}
  function formatOdds(value){const n=number(value);if(!(n>0))return 'Unavailable';return new Intl.NumberFormat(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}).format(n)}
  function actionIcon(name){const paths={copy:'<path d="M8 8h10v10H8z"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',open:'<path d="M5 12h12m-5-5 5 5-5 5"/><path d="M19 5v14"/>'};return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]||''}</svg>`}
  function setButtonContent(button,icon,label){button.innerHTML=`${actionIcon(icon)}<span>${label}</span>`;return button}
  function firstValue(object,keys){for(const key of keys){const value=object?.[key];if(value!==undefined&&value!==null&&value!=='')return value}return undefined}
  function normalizedFeedItem(raw={}){
    const item={...raw};
    item.code=text(firstValue(raw,['code','booking_code','bookingCode','bet_code','betCode','coupon_code','couponCode']));
    item.title=text(firstValue(raw,['title','name','label','headline','description']))||'Code Hub pick';
    item.odds=number(firstValue(raw,['odds','total_odds','totalOdds','combined_odds','combinedOdds']));
    const rawSelections=firstValue(raw,['selections','selections_count','selection_count','selectionCount','selectionsCount','legs']);
    item.selections=Array.isArray(rawSelections)?rawSelections.length:number(rawSelections);
    item.status=text(firstValue(raw,['status','code_status','codeStatus','match_status','matchStatus']))||'upcoming';
    item.result=text(firstValue(raw,['result','result_status','resultStatus','settlement','outcome','code_result','codeResult']));
    item.expires_at=firstValue(raw,['expires_at','expiresAt','expiry','expiration','valid_until','validUntil'])||null;
    item.created_at=firstValue(raw,['created_at','createdAt','scraped_at','scrapedAt','published_at','publishedAt'])||null;
    item.author=text(firstValue(raw,['author','tipster','seller','username','owner']));
    item.category=text(firstValue(raw,['category','tag','market','badge','type']));
    if(!Array.isArray(item.tips))item.tips=Array.isArray(raw.selection_details)?raw.selection_details:Array.isArray(raw.selections_detail)?raw.selections_detail:Array.isArray(raw.legs)?raw.legs:[];
    return item;
  }
  function resultText(item){return slug(item?.result||item?.result_status||item?.outcome)}
  function isVerifiedSettlement(item){return slug(item?.settlement?.verification_status)==='verified'}
  function isWon(item){
    if(!isVerifiedSettlement(item))return false;
    const explicit=resultText(item);
    const status=slug(item?.status);
    return ['won','winner','win','settled won','settled_won'].includes(explicit)||['won','winner','win','settled won','settled_won'].includes(status);
  }
  function plausibleExpiry(value){
    const expiry=dateValue(value);if(!expiry)return null;
    const year=expiry.getUTCFullYear();const currentYear=new Date().getUTCFullYear();
    if(year<currentYear-1||year>currentYear+6)return null;
    return expiry;
  }
  function isExplicitlyBlocked(item){
    const status=slug(item?.status||item?.matches_status||'upcoming');
    return ['expired','live','started','cancelled','canceled','invalid','closed','lost','void','suspended'].includes(status);
  }
  function isAvailable(item){
    const rawResult=resultText(item);
    const hasUnverifiedSettlement=['won','winner','win','settled won','settled_won','lost','lose','loss','settled lost','void','push','cancelled','canceled'].includes(rawResult)&&!isVerifiedSettlement(item);
    if(!text(item?.code)||isWon(item)||hasUnverifiedSettlement||isExplicitlyBlocked(item))return false;
    const expiry=plausibleExpiry(item?.expires_at);if(expiry&&expiry.getTime()<=Date.now())return false;
    return true;
  }
  function displayableCodes(){
    if(!feedIsCurrent(state.feed.generated_at))return [];
    state.feedFallback=false;
    return state.feed.items.filter(item=>completeFeedItem(item)&&isAvailable(item));
  }

  function categoryForCode(item){
    if(text(item.category))return text(item.category);
    const source=`${text(item.title)} ${text(item.tag)}`.toLowerCase();
    const count=Math.max(0,Math.floor(number(item.selections)));
    const odds=number(item.odds);
    if(/btts|both teams|gg|ng|goal|over|under|score|team total/.test(source))return 'Goals';
    if(/double chance|draw no bet|dnb/.test(source))return 'Double Chance';
    if(/1x2|home win|away win|match winner|draw/.test(source))return '1X2';
    if(count===1)return 'Singles';
    if(count>=6||odds>=8)return 'Accumulators';
    if(count>0&&count<=3&&odds>0&&odds<=4)return 'Safer';
    return 'Mixed';
  }

  function categoryForTip(tip){
    const source=`${text(tip.market)} ${text(tip.pick)} ${text(tip.title)}`.toLowerCase();
    if(/btts|both teams|gg|ng/.test(source))return 'BTTS';
    if(/over|under|goal|team total|score/.test(source))return 'Goals';
    if(/double chance|1x|x2|12|draw no bet|dnb/.test(source))return 'Double Chance';
    if(/home win|away win|match winner|1x2|draw/.test(source))return '1X2';
    if(/corner/.test(source))return 'Corners';
    if(/card/.test(source))return 'Cards';
    return 'Other';
  }

  function normalizedTips(item){
    const source=Array.isArray(item?.tips)?item.tips:Array.isArray(item?.selection_details)?item.selection_details:Array.isArray(item?.selections_detail)?item.selections_detail:Array.isArray(item?.legs)?item.legs:[];
    return source.map(raw=>{
      const fixture=text(raw.fixture||raw.event||raw.match||raw.event_name||raw.name||raw.teams);
      const home=text(raw.home_team||raw.home||raw.homeTeam);
      const away=text(raw.away_team||raw.away||raw.awayTeam);
      const displayFixture=fixture||(home&&away?`${home} vs ${away}`:home||away);
      const market=text(raw.market||raw.market_name||raw.bet_type||raw.type||raw.group);
      const pick=text(raw.pick||raw.selection||raw.outcome||raw.tip||raw.choice||raw.name);
      const odds=number(raw.odds||raw.price||raw.selection_odds);
      return {
        fixture:displayFixture,market,pick,odds,
        league:text(raw.league||raw.competition||raw.tournament),
        kickoff:raw.kickoff||raw.start_time||raw.startTime||raw.event_time||null,
        result:text(raw.result||raw.status||raw.settlement),
        category:categoryForTip({market,pick})
      };
    }).filter(tip=>tip.fixture&&tip.market&&tip.pick).slice(0,80);
  }

  function kickoffForCode(item){
    const dates=normalizedTips(item).map(tip=>dateValue(tip.kickoff)).filter(Boolean).sort((a,b)=>a-b);
    if(!dates.length)return null;
    const upcoming=dates.find(d=>d.getTime()>=Date.now()-6*60*60*1000);
    return upcoming||dates[0];
  }

  function consensusTips(){
    const slips=displayableCodes().map(item=>({item,tips:normalizedTips(item)})).filter(row=>row.tips.length);
    const daySlipTotals=new Map();
    const map=new Map();
    for(const {item,tips} of slips){
      const daysInSlip=new Set(tips.map(tip=>isoDay(tip.kickoff)));
      daysInSlip.forEach(day=>daySlipTotals.set(day,(daySlipTotals.get(day)||0)+1));
      const seenInSlip=new Set();
      for(const tip of tips){
        const day=isoDay(tip.kickoff);
        const key=[day,slug(tip.fixture),slug(tip.market),slug(tip.pick)].join('|');
        if(!key.replace(/\|/g,''))continue;
        if(seenInSlip.has(key))continue;seenInSlip.add(key);
        if(!map.has(key))map.set(key,{...tip,dayKey:day,count:0,oddsSum:0,oddsCount:0,codes:[],latest:0});
        const row=map.get(key);row.count+=1;
        if(tip.odds>0){row.oddsSum+=tip.odds;row.oddsCount+=1}
        row.codes.push(text(item.code));
        if(!row.kickoff&&tip.kickoff)row.kickoff=tip.kickoff;
        const stamp=dateValue(item.created_at||state.feed.generated_at)?.getTime()||0;row.latest=Math.max(row.latest,stamp);
      }
    }
    return [...map.values()].map(row=>{
      const totalSlips=daySlipTotals.get(row.dayKey)||slips.length;
      const share=totalSlips?row.count/totalSlips*100:0;
      return {
        ...row,totalSlips,share,
        averageOdds:row.oddsCount?row.oddsSum/row.oddsCount:0,
        tier:row.count>=4&&share>=50?'Strong agreement':row.count>=3&&share>=30?'Popular':row.count>=2?'Repeated':'Single mention'
      };
    }).filter(row=>row.count>=2).sort((a,b)=>daySortValue(a.kickoff)-daySortValue(b.kickoff)||b.share-a.share||b.count-a.count||b.latest-a.latest);
  }

  let feedLoadPromise=null;
  let lastFeedRequestAt=0;
  const FEED_MIN_REFRESH_MS=60*1000;

  async function fetchJson(path,{timeout=6500,cache='no-cache'}={}){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetch(path,{cache,signal:controller.signal,headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      return await response.json();
    }finally{clearTimeout(timer)}
  }

  async function refreshFeedMetadata(){
    const results=await Promise.allSettled([
      fetchJson('/data/feed-health.json'),
      fetchJson('/data/results-summary.json'),
      fetchJson('/data/settlement-ledger.json')
    ]);
    const [health,summary,ledger]=results;
    if(health.status==='fulfilled'&&health.value&&typeof health.value==='object')state.health=health.value;
    if(summary.status==='fulfilled'&&summary.value&&typeof summary.value==='object')state.resultsSummary={...state.resultsSummary,...summary.value};
    if(ledger.status==='fulfilled'&&ledger.value&&Array.isArray(ledger.value.entries))state.settlementLedger=ledger.value;
    renderWinners();renderResultsSummary();renderStatus();
  }

  async function loadFeed({silent=false,force=false}={}){
    if(feedLoadPromise)return feedLoadPromise;
    if(!force&&silent&&state.feed.status!=='loading'&&Date.now()-lastFeedRequestAt<FEED_MIN_REFRESH_MS)return state.feed;
    lastFeedRequestAt=Date.now();
    feedLoadPromise=(async()=>{
      const configured=text(config.codeHubFeedUrl);
      const candidates=[configured,'/data/codehub-banner.json','./data/codehub-banner.json'].filter(Boolean).filter((value,index,array)=>array.indexOf(value)===index);
      const cacheKey='sporty_codes_last_good_feed_v204';let lastError=null;let payload=null;
      const metadataPromise=refreshFeedMetadata().catch(()=>{});
      for(const candidate of candidates){
        try{
          const parsed=await fetchJson(candidate);
          if(!parsed||!Array.isArray(parsed.items))throw new Error('Invalid feed shape');
          if(!feedIsCurrent(parsed.generated_at))throw new Error('Latest feed is outside the public freshness window');
          const validItems=parsed.items.map(normalizedFeedItem).filter(completeFeedItem).slice(0,80);if(!validItems.length)throw new Error('No complete current codes in latest response');
          payload={...parsed,items:validItems};state.feedSource='network';break;
        }catch(error){lastError=error}
      }
      if(payload){
        state.feed={status:'ok',generated_at:payload.generated_at,items:payload.items,error:null};
        try{localStorage.setItem(cacheKey,JSON.stringify(payload));localStorage.removeItem('sporty_codes_last_good_feed_v196');localStorage.removeItem('sporty_codes_last_feed_v181')}catch{}
      }else{
        let cached=null;try{cached=JSON.parse(localStorage.getItem(cacheKey)||'null')}catch{}
        if(cached&&Array.isArray(cached.items)&&cached.items.length&&feedAgeHours(cached.generated_at)<=12){state.feed={status:'cached',generated_at:cached.generated_at,items:cached.items.map(normalizedFeedItem).filter(completeFeedItem),error:null};state.feedSource='cache'}
        else{try{localStorage.removeItem(cacheKey)}catch{}state.feed={status:'error',generated_at:null,items:[],error:lastError?.message||'Fresh codes unavailable'};if(!silent)toast('Fresh codes are taking longer than expected.')}
      }
      state.feedFallback=false;renderAll();document.dispatchEvent(new CustomEvent('sporty:feed-updated',{detail:{feed:state.feed,health:state.health,source:state.feedSource}}));
      await metadataPromise;
      return state.feed;
    })().finally(()=>{feedLoadPromise=null});
    return feedLoadPromise;
  }

  function renderAll(){renderStatus();renderHomeStats();renderCarousel();renderCategories();renderMarketplacePreview();renderCodePage();renderConsensus();renderWinners();renderResultsSummary()}

  function renderStatus(){
    const count=displayableCodes().length;
    const generated=dateValue(state.feed.generated_at);
    const label=$('#feedStatusLabel');const dot=$('#feedStatusDot');
    if(label){
      if(state.feed.status==='error')label.textContent='Fresh codes are being refreshed';
      else if(count===0)label.textContent='Preparing fresh codes';
      else if(state.feedSource==='cache')label.textContent=`Showing ${count} recently available codes`;
      else label.textContent=generated?`Updated ${generated.toLocaleString([], {dateStyle:'medium',timeStyle:'short'})}`:`${count} fresh codes`;
      if(state.feedFallback&&count)label.textContent=`${count} fresh codes · verify current status`;
    }
    if(dot)dot.className=`live-dot ${state.feed.status==='error'?'error':count?'active':'waiting'}`;
  }

  function renderHomeStats(){
    const available=displayableCodes();const tips=available.reduce((sum,item)=>sum+normalizedTips(item).length,0);const consensus=consensusTips();const wins=state.feed.items.filter(isWon);
    const values={freshCodes:available.length,tipsAnalysed:tips,consensusCount:consensus.length,winnerCount:wins.length};
    for(const [id,value] of Object.entries(values)){const node=document.querySelector(`[data-stat="${id}"]`);if(node)node.textContent=String(value)}
  }

  function renderCarousel(){
    const root=$('#codeHubTrack');if(!root)return;clear(root);stopCarousel();
    const items=displayableCodes().slice(0,18);
    setPopulated(root,items.length>0);
    if(!items.length)return;
    items.forEach(item=>root.append(codeHubCard(item)));
    const controls=root.closest('[data-population-section]')?.querySelector('.carousel-buttons');
    if(controls)controls.hidden=items.length<2;
    startCarousel();
  }

  function codeHubCard(item){
    const kickoff=kickoffForCode(item);
    const selections=Math.max(0,Math.floor(number(item.selections)));
    const chance=impliedChance(item.odds);
    const code=text(item.code)||'CODE';
    const savedItem=window.SportySaved?.codeItem({...item,category:categoryForCode(item),kickoff});

    const card=el('article','codehub-card codehub-card-v203');
    const header=el('div','codehub-card-header');
    const source=el('div','codehub-source-lockup');
    source.append(el('span','codehub-source-badge','FREE CODE'),el('span','codehub-source-name','Sporty Code Hub'));
    const odds=el('div','codehub-odds-block');
    odds.append(el('span','', 'Total odds'),el('strong','',formatOdds(item.odds)));
    header.append(source,odds);

    const identity=el('div','codehub-card-identity');
    identity.append(el('span','codehub-code-label','Booking code'));
    const codePanel=el('div','codehub-code-panel');
    const codeNode=el('code','',code);codeNode.title=code;
    codePanel.append(codeNode);
    identity.append(codePanel);

    const meta=el('div','codehub-meta-v203');
    if(kickoff)meta.append(el('span','codehub-meta-chip day',dayLabel(kickoff)));
    if(selections)meta.append(el('span','codehub-meta-chip',`${selections} selection${selections===1?'':'s'}`));
    if(chance>0)meta.append(el('span','codehub-meta-chip chance',`${formatPct(chance)} implied`));

    const actions=el('div','codehub-actions-v203');
    const load=setButtonContent(el('button','codehub-load-v203'),'open',internationalMode()?'Use internationally':'Load Sporty');
    load.type='button';
    load.addEventListener('click',()=>{window.SportySaved?.recordRecentCode({...item,category:categoryForCode(item),kickoff});launchSporty(code)});
    const support=el('div','codehub-support-actions');
    const copy=setButtonContent(el('button','codehub-support-button'),'copy','Copy');
    copy.type='button';
    copy.addEventListener('click',async()=>{await copyCode(code);copy.classList.add('is-done');copy.querySelector('span').textContent='Copied';setTimeout(()=>{copy.classList.remove('is-done');const label=copy.querySelector('span');if(label)label.textContent='Copy'},1600)});
    support.append(copy);
    if(window.SportyShare)support.append(window.SportyShare.button({type:'code',code,title:item.title,odds:item.odds,selections:item.selections,category:categoryForCode(item),day:kickoff?dayLabel(kickoff):'Current feed'},{className:'codehub-support-button codehub-share-v203',label:`Share code ${code}`}));
    if(window.SportySaved&&savedItem)support.append(window.SportySaved.button(savedItem,{className:'codehub-support-button codehub-save-v203'}));
    actions.append(load,support);

    card.append(header,identity,meta,actions);
    return card;
  }

  function renderCategories(){
    const root=$('#categoryGrid');if(!root)return;clear(root);const counts=new Map();displayableCodes().forEach(item=>{const category=categoryForCode(item);counts.set(category,(counts.get(category)||0)+1)});
    const order=['Safer','Goals','1X2','Double Chance','Singles','Accumulators','Mixed'];
    const rows=[...counts.entries()].sort((a,b)=>{const ai=order.indexOf(a[0]),bi=order.indexOf(b[0]);return (ai<0?99:ai)-(bi<0?99:bi)||b[1]-a[1]});
    setPopulated(root,rows.length>0);
    if(!rows.length)return;
    rows.forEach(([category,count])=>{const link=el('a','category-card');link.href=`marketplace.html?category=${encodeURIComponent(category)}`;link.append(el('strong','',category),el('span','',`${count} free code${count===1?'':'s'}`));root.append(link)});
  }

  function codeCard(item){
    const kickoff=kickoffForCode(item);
    const selections=Math.max(0,Math.floor(number(item.selections)));
    const chance=impliedChance(item.odds);
    const code=text(item.code)||'CODE';
    const savedItem=window.SportySaved?.codeItem({...item,category:categoryForCode(item),kickoff});

    const card=el('article','code-card code-card-v203');
    const header=el('div','code-card-v203-header');
    const source=el('div','codehub-source-lockup');
    source.append(el('span','codehub-source-badge','FREE CODE'),el('span','codehub-source-name',categoryForCode(item)));
    const odds=el('div','codehub-odds-block');
    odds.append(el('span','', 'Total odds'),el('strong','',formatOdds(item.odds)));
    header.append(source,odds);

    const identity=el('div','code-card-v203-identity');
    identity.append(el('h3','', 'Free public code'),el('span','codehub-code-label','Booking code'));
    const codePanel=el('div','codehub-code-panel code-card-code-panel');
    const codeNode=el('code','',code);codeNode.title=code;
    codePanel.append(codeNode);
    identity.append(codePanel);

    const stats=el('div','code-card-stats-v203');
    const statRows=[['Match day',kickoff?dayLabel(kickoff):'Date unavailable'],['Selections',selections||'—'],['Implied',chance?formatPct(chance):'—']];
    statRows.forEach(([label,value])=>{const node=el('div','code-card-stat-v203');node.append(el('span','',label),el('strong','',value));stats.append(node)});

    const actions=el('div','codehub-actions-v203 code-card-actions-v203');
    const load=setButtonContent(el('button','codehub-load-v203'),'open',internationalMode()?'Use internationally':'Load Sporty');
    load.type='button';
    load.addEventListener('click',()=>{window.SportySaved?.recordRecentCode({...item,category:categoryForCode(item),kickoff});launchSporty(code)});
    const support=el('div','codehub-support-actions');
    const copy=setButtonContent(el('button','codehub-support-button'),'copy','Copy');
    copy.type='button';copy.addEventListener('click',async()=>{await copyCode(code);copy.classList.add('is-done');const label=copy.querySelector('span');if(label)label.textContent='Copied';setTimeout(()=>{copy.classList.remove('is-done');const next=copy.querySelector('span');if(next)next.textContent='Copy'},1600)});
    support.append(copy);
    if(window.SportyShare)support.append(window.SportyShare.button({type:'code',code,title:item.title,odds:item.odds,selections:item.selections,category:categoryForCode(item),day:kickoff?dayLabel(kickoff):'Current feed'},{className:'codehub-support-button codehub-share-v203',label:`Share code ${code}`}));
    if(window.SportySaved&&savedItem)support.append(window.SportySaved.button(savedItem,{className:'codehub-support-button codehub-save-v203'}));
    actions.append(load,support);

    card.append(header,identity,stats,actions);
    return card;
  }

  function renderMarketplacePreview(){
    const root=$('#marketplacePreview');if(!root)return;clear(root);
    const items=displayableCodes().slice(0,6);
    setPopulated(root,items.length>0);
    if(!items.length)return;
    items.forEach(item=>root.append(codeCard(item)));
  }

  function renderCodePage(){
    const root=$('#allCodesGrid');if(!root)return;
    const items=displayableCodes();setPopulated(root,items.length>0);clear(root);if(!items.length)return;const categorySelect=$('#codeCategory');if(categorySelect){const categories=[...new Set(items.map(categoryForCode))].sort();const current=state.codeFilters.category;clear(categorySelect);const all=el('option','', 'All categories');all.value='all';categorySelect.append(all);categories.forEach(category=>{const option=el('option','',category);option.value=category;categorySelect.append(option)});categorySelect.value=categories.includes(current)?current:'all';state.codeFilters.category=categorySelect.value;}
    let filtered=items.filter(item=>{
      const search=state.codeFilters.search.toLowerCase();const haystack=`${text(item.title)} ${text(item.code)} ${categoryForCode(item)} ${text(item.author)}`.toLowerCase();
      const odds=number(item.odds);const selections=number(item.selections);const kickoff=kickoffForCode(item);
      const oddsOk=state.codeFilters.odds==='all'||(state.codeFilters.odds==='low'&&odds>0&&odds<=5)||(state.codeFilters.odds==='mid'&&odds>5&&odds<=25)||(state.codeFilters.odds==='high'&&odds>25);
      const sizeOk=state.codeFilters.size==='all'||(state.codeFilters.size==='small'&&selections<=5)||(state.codeFilters.size==='medium'&&selections>=6&&selections<=15)||(state.codeFilters.size==='large'&&selections>=16);
      return (!search||haystack.includes(search))&&(state.codeFilters.category==='all'||categoryForCode(item)===state.codeFilters.category)&&oddsOk&&sizeOk&&dayFilterMatches(kickoff,state.codeFilters.day);
    });
    const latest=(a,b)=>daySortValue(kickoffForCode(a))-daySortValue(kickoffForCode(b))||(dateValue(b.created_at)?.getTime()||0)-(dateValue(a.created_at)?.getTime()||0)||number(a.odds)-number(b.odds);
    const sorters={
      latest,
      pocket:(a,b)=>(number(a.selections)||999)-(number(b.selections)||999)||(number(a.odds)||999999)-(number(b.odds)||999999)||latest(a,b),
      'odds-low':(a,b)=>(number(a.odds)||999999)-(number(b.odds)||999999)||latest(a,b),
      'odds-high':(a,b)=>number(b.odds)-number(a.odds)||latest(a,b),
      'size-low':(a,b)=>(number(a.selections)||999)-(number(b.selections)||999)||latest(a,b),
      'size-high':(a,b)=>number(b.selections)-number(a.selections)||latest(a,b)
    };
    filtered.sort(sorters[state.codeFilters.sort]||latest);
    if(!filtered.length){root.append(emptyNode('No free codes match these filters','Try another day, category or clear the search.'));return;}filtered.forEach(item=>root.append(codeCard(item)));
  }

  function renderConsensus(){
    const homeRoot=$('#consensusPreview');const pageRoot=$('#consensusGrid');const all=consensusTips();
    if(homeRoot){clear(homeRoot);const preview=all.slice(0,4);setPopulated(homeRoot,preview.length>0);if(preview.length)preview.forEach(item=>homeRoot.append(tipCard(item)));}
    if(!pageRoot)return;
    setPopulated(pageRoot,all.length>0);clear(pageRoot);if(!all.length)return;
    const categorySelect=$('#tipCategory');if(categorySelect){const categories=[...new Set(all.map(item=>item.category))].sort();const current=state.tipFilters.category;clear(categorySelect);const option=el('option','','All categories');option.value='all';categorySelect.append(option);categories.forEach(category=>{const o=el('option','',category);o.value=category;categorySelect.append(o)});categorySelect.value=categories.includes(current)?current:'all';state.tipFilters.category=categorySelect.value;}
    let filtered=all.filter(item=>{
      const search=state.tipFilters.search.toLowerCase();const haystack=`${item.fixture} ${item.market} ${item.pick} ${item.category}`.toLowerCase();const shareOk=state.tipFilters.share==='all'||(state.tipFilters.share==='50'&&item.share>=50)||(state.tipFilters.share==='30'&&item.share>=30)||(state.tipFilters.share==='20'&&item.share>=20);
      return (!search||haystack.includes(search))&&(state.tipFilters.category==='all'||item.category===state.tipFilters.category)&&shareOk&&dayFilterMatches(item.kickoff,state.tipFilters.day);
    });
    filtered.sort((a,b)=>daySortValue(a.kickoff)-daySortValue(b.kickoff)||(state.tipFilters.sort==='count'?b.count-a.count||b.share-a.share:state.tipFilters.sort==='odds'?b.averageOdds-a.averageOdds:b.share-a.share||b.count-a.count));
    renderTipGroups(pageRoot,filtered);
  }

  function renderTipGroups(root,items){
    clear(root);if(!items.length){root.append(emptyNode('No repeated tips match these filters','Change the day, category or minimum share to see the available data.'));return;}
    const groups=new Map();for(const item of items){const key=isoDay(item.kickoff);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item)}
    [...groups.entries()].sort((a,b)=>daySortValue(a[1][0]?.kickoff)-daySortValue(b[1][0]?.kickoff)).forEach(([,rows])=>{
      const section=el('section','tip-day-group');const head=el('div','tip-day-head');head.append(el('div','eyebrow','Tips by day'),el('h2','',dayLabel(rows[0]?.kickoff)),el('span','pill',`${rows.length} repeated tip${rows.length===1?'':'s'}`));section.append(head);const grid=el('div','tip-grid');rows.forEach(item=>grid.append(tipCard(item)));section.append(grid);root.append(section);
    });
  }

  function consensusEmpty(){
    return emptyNode('Most Added is waiting for detailed slip tips','Free codes are already available. This list will populate automatically when the feed includes each slip’s fixture, market, selection and kickoff time. No tips will be invented.');
  }

  function tipCard(item){
    const card=el('article','tip-card');const line=el('div','tip-line');const left=el('div');const tags=el('div','pill-row');tags.append(el('span','card-kicker',item.category));tags.append(el('span','pill day-pill',dayLabel(item.kickoff)));left.append(tags,el('h3','',item.fixture));line.append(left,el('strong','tip-share',formatPct(item.share)));card.append(line);
    const pick=el('div','tip-pick',`${item.market}: ${item.pick}`);card.append(pick);
    const kickoff=dateValue(item.kickoff);const time=kickoff?kickoff.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'Not supplied';
    const metrics=el('div','metric-grid');[['Consensus share',`${item.count} of ${item.totalSlips} slips`],['Kickoff',time],['Average tip odds',item.averageOdds?item.averageOdds.toFixed(2):'—'],['Meaning','Frequency, not win chance']].forEach(([label,value])=>{const box=el('div','metric');box.append(el('span','',label),el('strong','',value));metrics.append(box)});card.append(metrics);
    const sources=el('div','source-codes');item.codes.slice(0,8).forEach(code=>sources.append(el('code','',code)));if(item.codes.length>8)sources.append(el('span','pill',`+${item.codes.length-8}`));card.append(sources);const actions=el('div','card-actions');if(window.SportySaved){actions.append(window.SportySaved.button(window.SportySaved.tipItem(item),{className:'button secondary save-button'}))}if(window.SportyShare){actions.append(window.SportyShare.button({type:'tip',fixture:item.fixture,market:item.market,pick:item.pick,tier:'Most Added',score:item.share,odds:item.averageOdds,day:dayLabel(item.kickoff)},{className:'button secondary share-button',label:`Share ${text(item.fixture)}`}))}if(actions.childElementCount)card.append(actions);return card;
  }

  function verifiedWinnerRows(){
    const map=new Map();
    for(const row of state.settlementLedger?.entries||[]){
      if(slug(row.verification_status)!=='verified'||slug(row.result)!=='won'||!text(row.proof_id))continue;
      const code=text(row.code).toUpperCase();if(!code)continue;
      map.set(code,{...row,status:'won',result:'won',author:row.source,settlement:{verification_status:'verified',method:row.method,verified_at:row.verified_at,evidence_url:row.evidence_url,proof_id:row.proof_id}});
    }
    for(const item of state.feed.items.filter(isWon)){const code=text(item.code).toUpperCase();if(code&&!map.has(code))map.set(code,item)}
    return [...map.values()].sort((a,b)=>(dateValue(b.settled_at||b.settlement?.verified_at||b.updated_at||b.created_at)?.getTime()||0)-(dateValue(a.settled_at||a.settlement?.verified_at||a.updated_at||a.created_at)?.getTime()||0));
  }

  function renderWinners(){
    const homeRoot=$('#winnerPreview');const pageRoot=$('#winnerGrid');const wins=verifiedWinnerRows();
    if(homeRoot){clear(homeRoot);const preview=wins.slice(0,3);setPopulated(homeRoot,preview.length>0);if(preview.length)preview.forEach(item=>homeRoot.append(winnerCard(item)));}
    if(pageRoot){clear(pageRoot);setPopulated(pageRoot,wins.length>0);if(wins.length)wins.forEach(item=>pageRoot.append(winnerCard(item)));}
  }

  function renderResultsSummary(){
    const root=$('#resultsProofSummary');if(!root)return;const summary=state.resultsSummary||{};const total=number(summary.verified_total);
    root.hidden=total<1;
    if(total<1)return;
    const values={verifiedTotal:total,verifiedWon:number(summary.verified_won),verifiedLost:number(summary.verified_lost),verifiedVoid:number(summary.verified_void)};
    for(const [key,value] of Object.entries(values)){const node=root.querySelector(`[data-proof-stat="${key}"]`);if(node)node.textContent=String(value)}
    const updated=root.querySelector('[data-proof-updated]');if(updated){const date=dateValue(summary.latest_verified_at);updated.textContent=date?`Latest verified ${date.toLocaleString([], {dateStyle:'medium',timeStyle:'short'})}`:'Verified settlement records'}
  }

  function winnerCard(item){
    const settlement=item.settlement||{};const method=slug(settlement.method)==='manual verified'?'Admin verified':'Source verified';
    const card=el('article','winner-card proof-card');
    const proofHead=el('div','proof-card-head');proofHead.append(el('div','winner-mark','✓ VERIFIED WON'),el('span','proof-method',method));
    card.append(proofHead,el('h3','',text(item.title)||'Winning public code'));
    const metrics=el('div','metric-grid');[['Code',text(item.code)||'—'],['Odds',number(item.odds)>0?number(item.odds).toFixed(2):'—'],['Selections',number(item.selections)>0?Math.floor(number(item.selections)):'—'],['Settled',dayLabel(item.settled_at||settlement.verified_at)]].forEach(([label,value])=>{const box=el('div','metric');box.append(el('span','',label),el('strong','',value));metrics.append(box)});card.append(metrics);
    const proofId=text(settlement.proof_id||item.proof_id);const proofLine=el('div','proof-id-row');proofLine.append(el('span','',proofId?`Proof ID ${proofId}`:'Verified settlement record'));
    const evidence=text(settlement.evidence_url||item.source_url);if(/^https:\/\//i.test(evidence)){const link=el('a','proof-link','View source');link.href=evidence;link.target='_blank';link.rel='noopener noreferrer';proofLine.append(link)}
    card.append(proofLine);return card;
  }

  function emptyNode(title,copy){const node=el('div','empty');node.append(el('strong','',title),el('span','',copy));return node}
  function formatPct(value){const n=number(value);return `${n<1?n.toFixed(2):n.toFixed(1)}%`}

  async function copyCode(code){const value=text(code);if(!value)return;try{await navigator.clipboard.writeText(value);toast('Code copied.')}catch{toast('Copy failed. Select the code manually.')}}
  async function launchSporty(code){
    const value=text(code);
    if(internationalMode()){
      try{sessionStorage.setItem('sporty_international_code',value)}catch{}
      const target=value?`/international.html?code=${encodeURIComponent(value)}#internationalCodes`:'/international.html#internationalCodes';
      window.location.assign(target);
      return;
    }
    const webUrl=officialLoadUrl();
    if(window.SportyHandoff){await window.SportyHandoff.open(value,webUrl);return}
    if(value){try{await navigator.clipboard.writeText(value)}catch{}}
    window.location.assign(webUrl);
  }

  function scrollCarousel(direction=1){const track=$('#codeHubTrack');const card=track?.querySelector('.codehub-card');if(!track||!card)return;const gap=parseFloat(getComputedStyle(track).gap)||12;const step=card.getBoundingClientRect().width+gap;const atEnd=track.scrollLeft+track.clientWidth>=track.scrollWidth-step/2;if(direction>0&&atEnd)track.scrollTo({left:0,behavior:'smooth'});else track.scrollBy({left:direction*step,behavior:'smooth'})}
  function stopCarousel(){if(state.carouselTimer){clearInterval(state.carouselTimer);state.carouselTimer=null}}
  function startCarousel(){stopCarousel();const track=$('#codeHubTrack');if(!track||track.children.length<2||matchMedia('(prefers-reduced-motion: reduce)').matches)return;track.onmouseenter=()=>state.carouselPaused=true;track.onmouseleave=()=>state.carouselPaused=false;track.onfocusin=()=>state.carouselPaused=true;track.onfocusout=()=>state.carouselPaused=false;track.ontouchstart=()=>state.carouselPaused=true;track.ontouchend=()=>setTimeout(()=>state.carouselPaused=false,1600);const speed=Math.max(3200,number(config.carouselIntervalMs)||4800);state.carouselTimer=setInterval(()=>{if(!state.carouselPaused&&document.visibilityState==='visible')scrollCarousel(1)},speed)}

  function bind(){
    $('#installButton')?.addEventListener('click',()=>window.location.assign('install.html'));
    $('#codeHubPrev')?.addEventListener('click',()=>scrollCarousel(-1));$('#codeHubNext')?.addEventListener('click',()=>scrollCarousel(1));
    $('#codeSearch')?.addEventListener('input',event=>{state.codeFilters.search=event.target.value;renderCodePage()});
    $('#codeCategory')?.addEventListener('change',event=>{state.codeFilters.category=event.target.value;renderCodePage()});
    $('#codeOdds')?.addEventListener('change',event=>{state.codeFilters.odds=event.target.value;renderCodePage()});
    $('#codeSize')?.addEventListener('change',event=>{state.codeFilters.size=event.target.value;renderCodePage()});
    $('#codeSort')?.addEventListener('change',event=>{state.codeFilters.sort=event.target.value;renderCodePage()});
    $('#codeDay')?.addEventListener('change',event=>{state.codeFilters.day=event.target.value;renderCodePage()});
    $('#tipSearch')?.addEventListener('input',event=>{state.tipFilters.search=event.target.value;renderConsensus()});
    $('#tipCategory')?.addEventListener('change',event=>{state.tipFilters.category=event.target.value;renderConsensus()});
    $('#tipShare')?.addEventListener('change',event=>{state.tipFilters.share=event.target.value;renderConsensus()});
    $('#tipSort')?.addEventListener('change',event=>{state.tipFilters.sort=event.target.value;renderConsensus()});
    $('#tipDay')?.addEventListener('change',event=>{state.tipFilters.day=event.target.value;renderConsensus()});
    const params=new URLSearchParams(location.search);if(params.get('category'))state.codeFilters.category=params.get('category');
  }

  async function init(){
    const theme=localStorage.getItem('sporty_theme');if(theme)document.documentElement.dataset.theme=theme;const themeButton=$('#themeButton');if(themeButton)themeButton.textContent=document.documentElement.dataset.theme==='dark'?'☾':'☀';
    bind();renderAll();await loadFeed({silent:true,force:true});
    setInterval(()=>{if(document.visibilityState==='visible')loadFeed({silent:true})},5*60*1000);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')loadFeed({silent:true})});
  }
  window.SportyMVP={state,displayableCodes,normalizedTips,consensusTips,kickoffForCode,categoryForCode,categoryForTip,isWon,isVerifiedSettlement,verifiedWinnerRows,isAvailable,dayLabel,dayFilterMatches,isoDay,daySortValue,dateValue,slug,text,number,formatPct,loadFeed,renderAll,copyCode,launchSporty,codeCard,codeHubCard};
  window.__SPORTY_FEED_TEST__={normalizedFeedItem,isAvailable,isWon,plausibleExpiry};
  window.__SPORTY_MVP_TEST__={dayLabel,dayFilterMatches,isoDay,officialLoadUrl,internationalMode,consensusTips,kickoffForCode};
  document.addEventListener('DOMContentLoaded',init);
})();
