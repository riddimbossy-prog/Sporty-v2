(function(){
  'use strict';

  const backend=window.SportyBackend;
  const helpers=window.SportyHelpers;
  const config=window.SPORTY_CONFIG || {};
  const state={
    user:null,wallet:{balance:0,currency:'GHS'},listings:[],purchases:[],transactions:[],seller:{listings:[],sales_count:0,lifetime_earned:0},
    codeHub:{status:'loading',items:[],generated_at:null,error:null},
    codeHubCarousel:{timer:null,paused:false,index:0},
    view:'discover',discoverSort:'score',marketSearch:'',category:'all',price:'all',sort:'score',loading:false
  };

  const $=selector=>document.querySelector(selector);
  const $$=selector=>[...document.querySelectorAll(selector)];
  const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;};
  const money=(value,currency='GHS')=>new Intl.NumberFormat('en-GH',{style:'currency',currency:currency||'GHS',minimumFractionDigits:2}).format(Number(value)||0).replace('GHS','GH₵');
  const dateText=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString([], {dateStyle:'medium',timeStyle:'short'}):'Invalid date';};
  const toast=message=>{const node=$('#toast');node.textContent=message;node.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),3000);};
  const clear=node=>{while(node.firstChild)node.removeChild(node.firstChild);};
  const ownedIds=()=>new Set(state.purchases.map(item=>item.listing_id));

  function statusFor(listing){
    if(listing.source==='codehub'){
      const publicStatus=String(listing.matches_status||listing.status||'upcoming').toLowerCase();
      if(['live','expired','unavailable','settled'].includes(publicStatus)) return {label:publicStatus,className:'bad',available:false};
      if(listing.expires_at){
        const expiry=Date.parse(listing.expires_at);
        if(Number.isFinite(expiry)&&expiry<=Date.now()) return {label:'expired',className:'bad',available:false};
      }
      return {label:'public feed',className:'ok',available:true};
    }
    if(listing.status!=='approved') return {label:listing.status||'pending',className:'warn',available:false};
    if(listing.matches_status!=='upcoming') return {label:listing.matches_status||'unavailable',className:'bad',available:false};
    const expiry=Date.parse(listing.expires_at);
    if(!Number.isFinite(expiry)||expiry<=Date.now()) return {label:'expired',className:'bad',available:false};
    return {label:'upcoming',className:'ok',available:true};
  }

  function friendlyError(error){
    const message=String(error?.message||error||'Something went wrong.');
    if(message.includes('JWT')||message.includes('session')) return 'Your session expired. Sign in again.';
    if(message.includes('duplicate key')) return 'This action has already been completed.';
    return message;
  }

  async function refresh(options={}){
    if(state.loading) return;
    state.loading=true;
    try{
      state.user=await backend.currentUser();
      const results=await Promise.all([
        backend.listListings(),backend.getWallet(),backend.getPurchases(),backend.getTransactions(),backend.getSellerDashboard()
      ]);
      [state.listings,state.wallet,state.purchases,state.transactions,state.seller]=results;
      renderAll();
      if(!options.silent) toast('Marketplace refreshed.');
    }catch(error){
      console.error(error);
      toast(friendlyError(error));
    }finally{state.loading=false;}
  }

  function renderAll(){
    renderHeader();renderBanner();renderCodeHubBanner();renderVictoryHero();renderWonCodes();renderDiscover();renderMarketplace();renderOwned();renderSeller();renderWallet();
  }

  function renderHeader(){
    const balance=money(state.wallet.balance,state.wallet.currency||config.currency);
    $('#headerBalance').textContent=balance;$('#heroBalance').textContent=balance;$('#walletBalance').textContent=balance;
    $('#heroMode').textContent=backend.mode==='supabase'?'Ready':backend.mode==='unavailable'?'Unavailable':'Preview';
    $('#heroAccount').textContent=state.user?.display_name||state.user?.email||'Guest';
    $('#accountButton').textContent=backend.mode==='unavailable'?'Fix connection':(state.user?(state.user.display_name||'Account'):'Sign in');
  }

  function renderBanner(){
    const banner=$('#systemBanner');clear(banner);
    const unavailable=backend.mode==='unavailable';
    if(backend.mode==='supabase'){banner.className='system-banner';clear(banner);return;}
    banner.className='system-banner show demo';
    const copy=el('span','',backend.mode==='supabase'
      ?'Your account is connected and ready.'
      :unavailable
        ?'The service is temporarily unavailable. Please try again shortly.'
        :'Preview mode is active.');
    const badge=el('strong','',backend.mode==='supabase'?'Ready':unavailable?'Try again':'Preview');
    banner.append(copy,badge);
  }


  async function loadCodeHubFeed(options={}){
    const section=$('#codeHubBanner');
    if(config.codeHubBannerEnabled===false){
      if(section)section.hidden=true;
      return;
    }
    const feedUrl=String(config.codeHubFeedUrl||'./data/codehub-banner.json');
    try{
      const separator=feedUrl.includes('?')?'&':'?';
      const response=await fetch(`${feedUrl}${separator}ts=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error(`Feed returned HTTP ${response.status}`);
      const payload=await response.json();
      state.codeHub={
        status:String(payload.status||'ok'),
        items:Array.isArray(payload.items)?payload.items.slice(0,16):[],
        generated_at:payload.generated_at||null,
        error:null
      };
    }catch(error){
      console.warn('Code Hub banner feed unavailable',error);
      state.codeHub={status:'error',items:[],generated_at:null,error:error?.message||'Feed unavailable'};
      if(!options.silent)toast('Code Hub feed could not refresh.');
    }
    renderCodeHubBanner();
    renderDiscover();
    renderMarketplace();
  }

  function renderCodeHubBanner(){
    const section=$('#codeHubBanner');
    if(!section)return;
    if(config.codeHubBannerEnabled===false){section.hidden=true;return;}
    section.hidden=false;
    const track=$('#codeHubTrack');
    const updated=$('#codeHubUpdated');
    const pulse=$('#codeHubPulse');
    const openLink=$('#codeHubOpenLink');
    clear(track);
    openLink.href=officialLoadUrl();

    if(state.codeHub.status==='loading'){
      updated.textContent='Loading public codes…';
      pulse.className='live-dot';
      track.append(codeHubEmpty('Connecting to the sanitized Code Hub feed.'));
      return;
    }
    if(state.codeHub.status==='error'){
      updated.textContent='Feed temporarily unavailable';
      pulse.className='live-dot offline';
      track.append(codeHubEmpty('The marketplace still works. The banner will retry automatically.'));
      return;
    }
    if(!state.codeHub.items.length){
      updated.textContent='Waiting for fresh codes';
      pulse.className='live-dot waiting';
      track.append(codeHubEmpty('Fresh codes will appear here automatically.'));
      return;
    }

    const generated=new Date(state.codeHub.generated_at);
    updated.textContent=Number.isFinite(generated.getTime())
      ?`Updated ${generated.toLocaleString([], {dateStyle:'medium',timeStyle:'short'})}`
      :'Public feed active';
    pulse.className='live-dot active';
    state.codeHub.items.forEach(item=>track.append(codeHubCard(item)));
    startCodeHubCarousel();
  }

  function codeHubEmpty(message){
    const empty=el('div','codehub-empty');
    empty.append(el('strong','','SPORTY CODE HUB'),el('span','',message));
    return empty;
  }

  function codeHubCard(item){
    const card=el('article','codehub-item');
    const head=el('div','codehub-item-head');
    head.append(el('span','codehub-tag',item.tag||'Code Hub'));
    if(Number(item.odds)>0)head.append(el('strong','codehub-odds',`${Number(item.odds).toFixed(2)} odds`));
    card.append(head,el('h3','',item.title||'Code Hub pick'));

    const meta=el('div','codehub-meta');
    if(Number(item.selections)>0)meta.append(el('span','',`${Math.floor(Number(item.selections))} selections`));
    const chance=impliedChance(item.odds);
    if(chance>0)meta.append(el('span','chance-pill',`${chance<1?chance.toFixed(2):chance.toFixed(1)}% implied`));
    if(item.author)meta.append(el('span','',String(item.author)));
    if(item.expires_at){
      const expiry=new Date(item.expires_at);
      if(Number.isFinite(expiry.getTime()))meta.append(el('span','',`Expires ${expiry.toLocaleString([], {dateStyle:'short',timeStyle:'short'})}`));
    }
    if(meta.childNodes.length)card.append(meta);

    const codeRow=el('div','codehub-code-row');
    const code=el('code','',String(item.code||''));
    const actions=el('div','codehub-mini-actions');
    const copy=el('button','codehub-copy','Copy');
    copy.type='button';
    copy.addEventListener('click',async()=>{
      try{await navigator.clipboard.writeText(String(item.code||''));toast('Code Hub code copied.');}
      catch{toast('Copy failed. Select the code manually.');}
    });
    const open=el('button','codehub-open','Load sporty ↗');
    open.type='button';
    open.title='Copy this code and continue to the official load-code page.';
    open.addEventListener('click',()=>launchSportyCode(item.code));
    actions.append(copy,open);codeRow.append(code,actions);card.append(codeRow);
    return card;
  }

  function impliedChance(odds){
    const value=Number(odds);
    if(!Number.isFinite(value)||value<=1)return 0;
    return Math.max(0,Math.min(100,100/value));
  }

  function estimatedChance(listing){
    const supplied=Number(listing?.hit_probability);
    if(Number.isFinite(supplied)&&supplied>0&&listing?.source!=='codehub'){
      return {value:Math.max(0,Math.min(100,supplied)),label:'Estimated chance'};
    }
    return {value:impliedChance(listing?.odds),label:'Odds-implied chance'};
  }

  function resultFor(item){
    return String(item?.result||item?.result_status||item?.settlement||item?.matches_status||item?.status||'').toLowerCase();
  }

  function isWon(item){return ['won','winner','win','settled_won','success'].includes(resultFor(item));}

  function categoryForCodeHub(item){
    const title=String(item.title||'').toLowerCase();
    const selections=Math.max(0,Math.floor(Number(item.selections)||0));
    const odds=Math.max(0,Number(item.odds)||0);
    if(/goal|over|under|btts|gg|ng|score/.test(title))return 'Goals';
    if(/1x2|home win|away win|draw|double chance|dnb/.test(title))return '1X2';
    if(selections>=6||odds>=8)return 'Accumulators';
    if(selections<=3&&odds>0&&odds<=3.5)return 'Safe';
    if(selections===1)return 'Singles';
    return 'Code Hub';
  }

  function codeHubMarketplaceItems(){
    return state.codeHub.items.map((item,index)=>({
      id:`codehub-${String(item.code||index).replace(/[^A-Za-z0-9_-]/g,'')}`,
      source:'codehub',
      title:item.title||'Code Hub pick',
      category:categoryForCodeHub(item),
      odds:Number(item.odds)||0,
      selections:Math.max(0,Math.floor(Number(item.selections)||0)),
      price:0,
      currency:'GHS',
      status:'approved',
      matches_status:String(item.status||'upcoming').toLowerCase(),
      result:item.result||item.result_status||item.settlement||null,
      expires_at:item.expires_at||null,
      created_at:state.codeHub.generated_at||new Date().toISOString(),
      purchase_count:0,
      code:String(item.code||''),
      source_url:item.source_url||String(config.codeHubLoadUrl||config.codeHubUrl||'https://www.sportybet.com/gh/m/code-hub/load-code'),
      seller:{display_name:item.author||'Code Hub Public Feed',verified:false},
      note:'Free public-feed code. Verify the selections and status on the official platform before taking any action.',
      _publicFeed:true
    })).filter(item=>item.code&&statusFor(item).available);
  }

  function marketplaceItems(){
    const combined=[...codeHubMarketplaceItems(),...state.listings];
    const seen=new Set();
    return combined.filter(item=>{const key=item.source==='codehub'?`code:${item.code}`:`listing:${item.id}`;if(seen.has(key))return false;seen.add(key);return true;});
  }

  function officialLoadUrl(){
    return String(window.SportyRegion?.getLoadUrl?.()||config.codeHubLoadUrl||'https://www.sportybet.com/gh/m/code-hub/load-code');
  }

  async function copyPublicCode(code){
    try{await navigator.clipboard.writeText(String(code||''));toast('Code copied.');return true;}
    catch{toast('Copy failed. Select the code manually.');return false;}
  }

  function openPublicCode(listing){
    const content=el('div');
    const box=el('div','purchase-box');box.append(el('span','', 'Public booking code'),el('strong','',String(listing.code||'')));content.append(box);
    content.append(el('p','note','Your code will be copied before the official load page opens. Review every selection before continuing.'));
    const actions=el('div','modal-actions');
    actions.append(actionButton('Copy code','secondary',()=>copyPublicCode(listing.code)));
    const open=el('button','button primary','Load sporty ↗');open.type='button';open.addEventListener('click',()=>launchSportyCode(listing.code));actions.append(open);
    content.append(actions);
    openModal(listing.title,'Free public-feed listing',content);
  }


  async function launchSportyCode(code){
    const value=String(code||'').trim();
    if(window.SportyRegion?.isInternational?.()){
      window.location.assign(value?`/international.html?code=${encodeURIComponent(value)}#internationalCodes`:'/international.html');
      return;
    }
    if(window.SportyHandoff){await window.SportyHandoff.open(value,officialLoadUrl());return}
    if(value){try{await navigator.clipboard.writeText(value)}catch{}}
    window.location.assign(officialLoadUrl());
  }

  function stopCodeHubCarousel(){
    if(state.codeHubCarousel.timer){clearInterval(state.codeHubCarousel.timer);state.codeHubCarousel.timer=null;}
  }

  function scrollCodeHub(direction=1){
    const track=$('#codeHubTrack');if(!track||!track.children.length)return;
    const first=track.querySelector('.codehub-item');if(!first)return;
    const gap=parseFloat(getComputedStyle(track).columnGap||getComputedStyle(track).gap||'12')||12;
    const step=first.getBoundingClientRect().width+gap;
    const atEnd=track.scrollLeft+track.clientWidth>=track.scrollWidth-step/2;
    const atStart=track.scrollLeft<=step/2;
    if(direction>0&&atEnd){track.scrollTo({left:0,behavior:'smooth'});state.codeHubCarousel.index=0;return;}
    if(direction<0&&atStart){track.scrollTo({left:track.scrollWidth,behavior:'smooth'});return;}
    track.scrollBy({left:direction*step,behavior:'smooth'});
  }

  function startCodeHubCarousel(){
    stopCodeHubCarousel();
    const track=$('#codeHubTrack');if(!track||state.codeHub.items.length<2)return;
    const reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.onmouseenter=()=>{state.codeHubCarousel.paused=true;};
    track.onmouseleave=()=>{state.codeHubCarousel.paused=false;};
    track.onfocusin=()=>{state.codeHubCarousel.paused=true;};
    track.onfocusout=()=>{state.codeHubCarousel.paused=false;};
    if(reduced)return;
    state.codeHubCarousel.timer=setInterval(()=>{if(!state.codeHubCarousel.paused&&document.visibilityState==='visible')scrollCodeHub(1);},6000);
  }

  function chip(label,value){
    const button=el('button','filter-chip'+(state.discoverSort===value?' active':''),label);button.type='button';
    button.addEventListener('click',()=>{state.discoverSort=value;renderDiscover();});return button;
  }

  function listingSort(items,mode){
    return [...items].sort((a,b)=>{
      if(mode==='newest') return Date.parse(b.created_at)-Date.parse(a.created_at);
      if(mode==='price-low') return Number(a.price)-Number(b.price);
      if(mode==='odds-high') return Number(b.odds)-Number(a.odds);
      return (Number(b.hit_probability)||0)-(Number(a.hit_probability)||0)||(Number(b.purchase_count)||0)-(Number(a.purchase_count)||0);
    });
  }

  function wonItems(){
    const publicWins=state.codeHub.items.filter(isWon).map((item,index)=>({
      id:`won-codehub-${String(item.code||index).replace(/[^A-Za-z0-9_-]/g,'')}`,
      source:'codehub',title:item.title||'Winning Code Hub pick',category:categoryForCodeHub(item),odds:Number(item.odds)||0,
      selections:Math.max(0,Math.floor(Number(item.selections)||0)),code:String(item.code||''),result:'won',
      settled_at:item.settled_at||item.updated_at||state.codeHub.generated_at,seller:{display_name:item.author||'Public feed'}
    }));
    const sellerWins=state.listings.filter(isWon).map(item=>({...item,result:'won'}));
    return [...publicWins,...sellerWins];
  }

  function renderVictoryHero(){
    const wins=wonItems();
    const count=$('#heroWonCount');const odds=$('#heroWonOdds');
    if(count)count.textContent=String(wins.length);
    if(odds){const top=wins.reduce((best,item)=>Number(item.odds)>Number(best?.odds||0)?item:best,null);odds.textContent=top&&Number(top.odds)>0?Number(top.odds).toFixed(2):'—';}
  }

  function renderWonCodes(){
    const root=$('#wonGrid');if(!root)return;clear(root);const wins=wonItems().slice(0,8);
    if(!wins.length){const empty=el('div','won-empty');empty.append(el('strong','','Verified winners will appear here'),el('span','','A code is shown only after its result is marked as won by the feed or marketplace settlement.'));root.append(empty);return;}
    wins.forEach(item=>{const card=el('article','won-card');const top=el('div','won-card-top');top.append(el('span','won-badge','✓ WON'),el('strong','',Number(item.odds)>0?`${Number(item.odds).toFixed(2)} odds`:'Winner'));card.append(top,el('h3','',item.title||'Winning code'));const meta=el('div','won-meta');meta.append(el('span','',item.category||'Code Hub'));if(item.selections)meta.append(el('span','',`${item.selections} selections`));if(item.seller?.display_name)meta.append(el('span','',item.seller.display_name));card.append(meta);if(item.code)card.append(el('code','won-code',item.code));root.append(card);});
  }

  function renderDiscover(){
    const filters=$('#discoverFilters');clear(filters);filters.append(chip('Best score','score'),chip('Newest','newest'),chip('Highest odds','odds-high'));
    const active=marketplaceItems().filter(item=>statusFor(item).available).slice();
    renderGrid($('#discoverGrid'),listingSort(active,state.discoverSort).slice(0,9));
  }

  function renderMarketplace(){
    const sourceItems=marketplaceItems();
    const categories=[...new Set(sourceItems.map(item=>item.category).filter(Boolean))].sort();
    const select=$('#categoryFilter');
    const selected=state.category;clear(select);const all=el('option','', 'All categories');all.value='all';select.append(all);
    categories.forEach(category=>{const option=el('option','',category);option.value=category;select.append(option);});select.value=categories.includes(selected)?selected:'all';
    state.category=select.value;

    let items=sourceItems.filter(item=>{
      const seller=item.seller?.display_name||item.seller?.username||'';
      const haystack=`${item.title||''} ${seller} ${item.category||''} ${item.code||''}`.toLowerCase();
      const searchOk=!state.marketSearch||haystack.includes(state.marketSearch.toLowerCase());
      const categoryOk=state.category==='all'||item.category===state.category;
      const priceOk=state.price==='all'||(state.price==='free'?Number(item.price)===0:Number(item.price)>0);
      return searchOk&&categoryOk&&priceOk;
    });
    renderGrid($('#marketGrid'),listingSort(items,state.sort));
  }

  function renderOwned(){
    const items=state.purchases.map(purchase=>purchase.listing).filter(Boolean).map(item=>({...item,_owned:true}));
    renderGrid($('#ownedGrid'),items,'You have not purchased any codes yet.');
  }

  function renderGrid(root,items,emptyMessage='No listings match this view.'){
    clear(root);
    if(!items.length){root.append(el('div','empty-state',emptyMessage));return;}
    items.forEach(item=>root.append(listingCard(item)));
  }

  function listingCard(listing){
    const status=statusFor(listing);const owned=listing._owned||ownedIds().has(listing.id);const seller=listing.seller||{};
    const card=el('article','listing-card'+(listing.source==='codehub'?' public-feed':'')+(!status.available?' unavailable':''));

    const top=el('div','listing-top');const left=el('div');left.append(el('div','listing-category',listing.category||'Code'),el('div','listing-title',listing.title||'Untitled listing'));
    top.append(left,el('div','listing-odds',Number(listing.odds||0).toFixed(2)));card.append(top);if(listing.source==='codehub')card.append(el('span','public-feed-badge','Public feed · Free'));

    const sellerLine=el('div','seller-line');sellerLine.append(el('div','avatar',(seller.display_name||seller.username||'?').slice(0,1).toUpperCase()));
    const sellerCopy=el('div');const sellerName=el('div','seller-name',seller.display_name||seller.username||'Tipster');if(seller.verified)sellerName.append(el('span','verified',' ✓'));
    sellerCopy.append(sellerName,el('div','seller-meta',listing.source==='codehub'?`Free public feed · ${listing.selections||0} selections`:`${Number(listing.purchase_count)||0} purchases · ${listing.selections||0} selections`));sellerLine.append(sellerCopy);card.append(sellerLine);

    const metrics=el('div','metric-grid');
    const chance=estimatedChance(listing);
    const chanceText=chance.value>0?`${chance.value<1?chance.value.toFixed(2):chance.value.toFixed(1)}%`:'—';
    const defs=listing.source==='codehub'
      ?[[chance.label,chanceText],['Category',listing.category||'Code Hub'],['Selections',listing.selections||'—']]
      :[[chance.label,chanceText],['Average leg',listing.avg_odds_per_leg?Number(listing.avg_odds_per_leg).toFixed(2):'—'],['Category',listing.category||'Other']];
    defs.forEach(([label,value])=>{const box=el('div','metric');box.append(el('span','',label),el('strong','',value));metrics.append(box);});
    const statusBox=el('div','metric');statusBox.append(el('span','','Status'),el('strong','status '+status.className,status.label));metrics.append(statusBox);card.append(metrics);

    const codeBox=el('div','code-preview');codeBox.append(el('code','',status.available?(listing.source==='codehub'?String(listing.code||'PUBLIC'):owned?'OWNED':'••••••••'):'UNAVAILABLE'));
    const priceText=listing.source==='codehub'?'PUBLIC · FREE':Number(listing.price)===0?'FREE':owned?'OWNED':money(listing.price,listing.currency);codeBox.append(el('span','price '+(Number(listing.price)===0?'free':owned?'owned':''),priceText));card.append(codeBox);
    if(listing.note)card.append(el('p','note',listing.note));

    const actions=el('div','listing-actions');
    if(!status.available){const disabled=el('button','button secondary','Unavailable');disabled.disabled=true;actions.append(disabled);}
    else if(listing.source==='codehub'){actions.append(actionButton('View free code','primary',()=>openPublicCode(listing)),actionButton('Details','secondary',()=>showDetails(listing)));}
    else if(owned){actions.append(actionButton('Reveal code','primary',()=>revealCode(listing)),actionButton('Details','secondary',()=>showDetails(listing)));}
    else if(Number(listing.price)===0){actions.append(actionButton('Get free code','primary',()=>buyListing(listing)),actionButton('Details','secondary',()=>showDetails(listing)));}
    else{actions.append(actionButton(`Buy ${money(listing.price,listing.currency)}`,'primary',()=>openPurchase(listing)),actionButton('Details','secondary',()=>showDetails(listing)));}
    card.append(actions);return card;
  }

  function actionButton(label,kind,handler){const button=el('button','button '+kind,label);button.type='button';button.addEventListener('click',handler);return button;}

  function renderSeller(){
    $('#sellerListingCount').textContent=state.seller.listings?.length||0;$('#sellerSalesCount').textContent=state.seller.sales_count||0;
    $('#sellerEarnings').textContent=money(state.seller.lifetime_earned||0,config.currency||'GHS');
    const root=$('#sellerListings');clear(root);
    if(!state.user){root.append(el('div','empty-state','Sign in to create and manage listings.'));return;}
    const items=state.seller.listings||[];
    if(!items.length){root.append(el('div','empty-state','No seller listings yet.'));return;}
    items.forEach(item=>{
      const row=el('div','compact-row');const copy=el('div');copy.append(el('strong','',item.title),el('small','',`${item.category} · expires ${dateText(item.expires_at)}`));
      const right=el('div','compact-right');right.append(el('b','',money(item.price,item.currency)),el('small','',item.status));row.append(copy,right);root.append(row);
    });
  }

  function renderWallet(){
    const root=$('#transactionList');clear(root);
    if(!state.user){root.append(el('div','empty-state','Sign in to view wallet activity.'));return;}
    if(!state.transactions.length){root.append(el('div','empty-state','No wallet transactions yet.'));return;}
    state.transactions.forEach(tx=>{
      const amount=Number(tx.amount)||0;const row=el('div','transaction-row');const copy=el('div');copy.append(el('strong','',tx.note||tx.kind||'Transaction'),el('small','',dateText(tx.created_at)));
      const right=el('div','compact-right');right.append(el('b',amount>=0?'credit':'debit',`${amount>=0?'+':'−'} ${money(Math.abs(amount),state.wallet.currency)}`),el('small','',`Balance ${money(tx.balance_after,state.wallet.currency)}`));row.append(copy,right);root.append(row);
    });
  }

  async function buyListing(listing){
    if(!state.user){openAuth();return;}
    try{
      await backend.purchase(listing.id);toast(Number(listing.price)===0?'Free code added to My Codes.':'Purchase completed.');await refresh({silent:true});
      await revealCode(listing);
    }catch(error){
      const message=friendlyError(error);toast(message);
      if(message.toLowerCase().includes('sign in'))openAuth();
      if(message.toLowerCase().includes('balance'))navigate('wallet');
    }
  }

  function openPurchase(listing){
    if(!state.user){openAuth();return;}
    const content=el('div');content.append(el('p','',`Buy “${listing.title}” from ${listing.seller?.display_name||'this seller'}.`));
    const total=el('div','purchase-box');total.append(el('span','',`Wallet: ${money(state.wallet.balance,state.wallet.currency)}`),el('strong','',money(listing.price,listing.currency)));content.append(total);
    const actions=el('div','modal-actions');actions.append(actionButton('Cancel','secondary',closeModal),actionButton('Confirm purchase','primary',async()=>{closeModal();await buyListing(listing);}));content.append(actions);
    openModal('Confirm purchase','Wallet deduction and ownership are handled together.',content);
  }

  async function revealCode(listing){
    if(!state.user){openAuth();return;}
    try{
      const code=await backend.reveal(listing.id);
      const content=el('div');const box=el('div','purchase-box');box.append(el('span','', 'Booking code'),el('strong','',String(code)));content.append(box);
      const actions=el('div','modal-actions');
      actions.append(actionButton('Copy code','secondary',async()=>{try{await navigator.clipboard.writeText(String(code));toast('Code copied.');}catch{toast('Copy failed. Select the code manually.');}}));
      actions.append(actionButton('Close','primary',closeModal));content.append(actions);
      openModal(listing.title,'This code is visible because the active account owns it.',content);
    }catch(error){toast(friendlyError(error));}
  }

  function showDetails(listing){
    const content=el('div');
    const rows=[['Source',listing.source==='codehub'?'Public Code Hub feed':listing.seller?.display_name||listing.seller?.username||'Tipster'],['Category',listing.category],['Total odds',Number(listing.odds||0).toFixed(2)],['Selections',listing.selections],['Price',listing.source==='codehub'?'FREE':money(listing.price,listing.currency)],['Expiry',listing.expires_at?dateText(listing.expires_at):'Not supplied'],['Status',statusFor(listing).label]];
    rows.forEach(([label,value])=>{const row=el('div','purchase-box');row.append(el('span','',label),el('strong','',value));content.append(row);});
    if(listing.note)content.append(el('p','note',listing.note));openModal(listing.title,listing.source==='codehub'?'Free public-feed details':'Marketplace listing details',content);
  }

  function openModal(title,subtitle,content){
    closeModal();const root=$('#modalRoot');const backdrop=el('div','modal-backdrop');const modal=el('section','modal');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
    const head=el('div','modal-head');const copy=el('div');copy.append(el('h3','',title),el('p','',subtitle));const close=el('button','close-button','×');close.type='button';close.setAttribute('aria-label','Close');close.addEventListener('click',closeModal);head.append(copy,close);modal.append(head,content);backdrop.append(modal);backdrop.addEventListener('click',event=>{if(event.target===backdrop)closeModal();});root.append(backdrop);
  }
  function closeModal(){clear($('#modalRoot'));}

  function openAuth(){
    if(backend.mode==='unavailable'){
      const content=el('div');
      content.append(el('p','note','This service is temporarily unavailable. Please try again shortly.'));
      const check=el('a','button primary','Open connection check');check.href='connection-check.html';check.target='_blank';check.rel='noopener';
      const actions=el('div','modal-actions');actions.append(check,actionButton('Close','secondary',closeModal));content.append(actions);
      openModal('Connection needs attention','The production build will not use an editable browser wallet.',content);return;
    }
    if(backend.mode==='demo'){
      const content=el('div');content.append(el('p','note','A local demo buyer is already active. Add demo credit, buy codes and test the seller flow immediately.'));
      const actions=el('div','modal-actions');actions.append(actionButton('Open wallet','primary',()=>{closeModal();navigate('wallet');}),actionButton('Close','secondary',closeModal));content.append(actions);
      openModal('Preview account','Sign in is unavailable in preview mode.',content);return;
    }
    if(state.user){openAccount();return;}
    const content=el('div');const tabs=el('div','auth-tabs');const signInTab=actionButton('Sign in','primary',()=>renderAuthForm('signin',content));const signUpTab=actionButton('Create account','secondary',()=>renderAuthForm('signup',content));tabs.append(signInTab,signUpTab);content.append(tabs,el('div','', ''));openModal('Access your account','Sign in with your email and password.',content);renderAuthForm('signin',content);
  }

  function renderAuthForm(mode,content){
    const old=content.querySelector('.auth-form');if(old)old.remove();
    content.querySelectorAll('.auth-tabs .button').forEach((button,index)=>button.className='button '+((mode==='signin'&&index===0)||(mode==='signup'&&index===1)?'primary':'secondary'));
    const form=el('form','auth-form');
    if(mode==='signup'){const nameLabel=el('label');nameLabel.append(el('span','', 'Display name'));const name=el('input');name.name='display_name';name.required=true;nameLabel.append(name);form.append(nameLabel);}
    const emailLabel=el('label');emailLabel.append(el('span','', 'Email'));const email=el('input');email.name='email';email.type='email';email.required=true;email.autocomplete='email';emailLabel.append(email);
    const passwordLabel=el('label');passwordLabel.append(el('span','', 'Password'));const password=el('input');password.name='password';password.type='password';password.required=true;password.minLength=6;password.autocomplete=mode==='signup'?'new-password':'current-password';passwordLabel.append(password);
    const submit=el('button','button primary',mode==='signin'?'Sign in':'Create account');submit.type='submit';form.append(emailLabel,passwordLabel,submit);
    form.addEventListener('submit',async event=>{
      event.preventDefault();submit.disabled=true;
      try{
        const data=new FormData(form);
        if(mode==='signin'){await backend.signIn(String(data.get('email')),String(data.get('password')));toast('Signed in.');}
        else{await backend.signUp(String(data.get('display_name')),String(data.get('email')),String(data.get('password')));toast('Account created. Check email confirmation if enabled.');}
        closeModal();await refresh({silent:true});
      }catch(error){toast(friendlyError(error));}finally{submit.disabled=false;}
    });content.append(form);
  }

  function openAccount(){
    const content=el('div');
    [['Name',state.user?.display_name||'—'],['Email',state.user?.email||'—'],['Role',state.user?.role||'user'],['Status',backend.mode==='supabase'?'Ready':'Preview']].forEach(([label,value])=>{const row=el('div','purchase-box');row.append(el('span','',label),el('strong','',value));content.append(row);});
    const actions=el('div','modal-actions');actions.append(actionButton('Close','secondary',closeModal),actionButton('Sign out','primary',async()=>{try{await backend.signOut();closeModal();await refresh({silent:true});toast('Signed out.');}catch(error){toast(friendlyError(error));}}));content.append(actions);
    openModal('Account','Current marketplace session',content);
  }

  const pageRoutes={discover:'index.html',marketplace:'marketplace.html',owned:'my-codes.html',sell:'sell.html',wallet:'wallet.html'};
  const pageCopy={discover:['Discover','Everything in one place','Fresh codes, verified winners, wallet balance and marketplace highlights.'],marketplace:['Marketplace','Browse every code','Search categorized public codes and seller listings from one focused page.'],owned:['My codes','Your private library','Review codes you own and reveal eligible purchases.'],sell:['Sell','Seller studio','Publish and manage your codes from a dedicated workspace.'],wallet:['Wallet','Balance and activity','View your balance, add testing credit and review every transaction.']};
  function navigate(view,{route=false}={}){
    if(route&&pageRoutes[view]){window.location.assign(pageRoutes[view]);return;}
    state.view=view;
    document.body.dataset.page=view;
    $$('.view').forEach(node=>node.classList.toggle('active',node.id===`view-${view}`));
    $$('[data-view]').forEach(node=>node.classList.toggle('active',node.dataset.view===view));
    const copy=pageCopy[view]||pageCopy.discover;if($('#pageEyebrow'))$('#pageEyebrow').textContent=copy[1];if($('#pageTitle'))$('#pageTitle').textContent=copy[0];if($('#pageDescription'))$('#pageDescription').textContent=copy[2];
    window.scrollTo({top:0,behavior:'smooth'});
  }

  async function addTopUp(amount){
    if(!state.user){openAuth();return;}
    try{await backend.topUp(amount);toast('Credit added.');await refresh({silent:true});}catch(error){toast(friendlyError(error));}
  }

  function bindEvents(){
    $$('[data-view]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.view,{route:true})));
    $('#walletButton').addEventListener('click',()=>navigate('wallet',{route:true}));$('#accountButton').addEventListener('click',openAuth);
    const previous=$('#codeHubPrev');const next=$('#codeHubNext');if(previous)previous.addEventListener('click',()=>scrollCodeHub(-1));if(next)next.addEventListener('click',()=>scrollCodeHub(1));
    $('#marketSearch').addEventListener('input',event=>{state.marketSearch=event.target.value;renderMarketplace();});
    $('#categoryFilter').addEventListener('change',event=>{state.category=event.target.value;renderMarketplace();});
    $('#priceFilter').addEventListener('change',event=>{state.price=event.target.value;renderMarketplace();});
    $('#sortFilter').addEventListener('change',event=>{state.sort=event.target.value;renderMarketplace();});
    $$('[data-topup]').forEach(button=>button.addEventListener('click',()=>addTopUp(Number(button.dataset.topup))));
    $('#customTopupButton').addEventListener('click',()=>addTopUp(Number($('#customTopup').value)));
    $('#listingForm').addEventListener('submit',async event=>{
      event.preventDefault();if(!state.user){openAuth();return;}
      const submit=event.submitter;submit.disabled=true;
      try{const payload=Object.fromEntries(new FormData(event.currentTarget).entries());await backend.createListing(payload);event.currentTarget.reset();setDefaultExpiry();toast('Listing published.');await refresh({silent:true});}
      catch(error){toast(friendlyError(error));}finally{submit.disabled=false;}
    });
  }

  function setDefaultExpiry(){
    const field=$('#listingForm [name="expires_at"]');const date=new Date(Date.now()+36*60*60*1000);date.setMinutes(date.getMinutes()-date.getTimezoneOffset());field.value=date.toISOString().slice(0,16);
  }

  async function init(){
    const savedTheme=localStorage.getItem('sporty_theme');if(savedTheme)document.documentElement.dataset.theme=savedTheme;
    $('#themeButton').textContent=document.documentElement.dataset.theme==='dark'?'☾':'☀';
    bindEvents();setDefaultExpiry();await backend.init();backend.onAuthChange(()=>refresh({silent:true}));
    const initial=document.body.dataset.page||'discover';if($(`#view-${initial}`))state.view=initial;navigate(state.view);
    await Promise.all([refresh({silent:true}),loadCodeHubFeed({silent:true})]);
    window.setInterval(()=>loadCodeHubFeed({silent:true}),5*60*1000);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')loadCodeHubFeed({silent:true});});
    window.addEventListener('beforeunload',stopCodeHubCarousel);
    if('serviceWorker' in navigator)navigator.serviceWorker.getRegistrations().then(items=>Promise.all(items.map(item=>item.unregister()))).catch(()=>{}); if('caches' in window)caches.keys().then(keys=>Promise.all(keys.map(key=>caches.delete(key)))).catch(()=>{});
  }

  document.addEventListener('DOMContentLoaded',init);
})();
