(()=>{
  'use strict';

  const config=window.SPORTY_CONFIG||{};
  const $=selector=>document.querySelector(selector);
  const text=value=>String(value??'').trim();
  const number=value=>{const n=Number(String(value??'').replace(/,/g,''));return Number.isFinite(n)?n:0};
  const el=(tag,className,content)=>{const node=document.createElement(tag);if(className)node.className=className;if(content!==undefined)node.textContent=String(content);return node};
  const clear=node=>{while(node?.firstChild)node.removeChild(node.firstChild)};
  const dateValue=value=>{const d=new Date(value);return Number.isFinite(d.getTime())?d:null};
  const state={items:[],generatedAt:null,status:'loading',search:'',size:'all',expanded:new Set()};

  function tipsFor(item){
    const source=Array.isArray(item?.tips)?item.tips:Array.isArray(item?.selection_details)?item.selection_details:Array.isArray(item?.legs)?item.legs:[];
    return source.map(raw=>({
      fixture:text(raw.fixture||raw.event||raw.match||raw.name||([raw.home_team,raw.away_team].filter(Boolean).join(' vs '))),
      market:text(raw.market||raw.market_name||raw.bet_type||raw.type),
      pick:text(raw.pick||raw.selection||raw.outcome||raw.tip||raw.choice),
      odds:number(raw.odds||raw.price||raw.selection_odds),
      league:text(raw.league||raw.competition||raw.tournament),
      kickoff:raw.kickoff||raw.start_time||raw.startTime||null
    })).filter(tip=>tip.fixture&&tip.market&&tip.pick);
  }
  function itemCode(item){return text(item?.code||item?.booking_code||item?.bookingCode)}
  function itemOdds(item){return number(item?.odds||item?.total_odds||item?.totalOdds)}
  function itemSelections(item){const raw=item?.selections??item?.selections_count??item?.selection_count;return Array.isArray(raw)?raw.length:Math.max(0,Math.floor(number(raw)||tipsFor(item).length))}
  function firstKickoff(item){return tipsFor(item).map(tip=>dateValue(tip.kickoff)).filter(Boolean).sort((a,b)=>a-b)[0]||null}
  function formatOdds(value){return value>0?new Intl.NumberFormat(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}).format(value):'—'}
  function countryName(){return window.SportyRegion?.countryName?.()||'your country'}
  function toast(message){const node=$('#toast');if(!node)return;node.textContent=message;node.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),2800)}
  async function copy(value,message){try{await navigator.clipboard.writeText(value);toast(message)}catch{toast('Copy failed. Select the text manually.')}}

  function selectionText(item){
    const code=itemCode(item);const tips=tipsFor(item);
    const lines=[`sporty.codes slip ${code||''}`.trim(),`Source region: Ghana`,`Rebuild for: ${countryName()}`,`Total source odds: ${formatOdds(itemOdds(item))}`,''];
    tips.forEach((tip,index)=>{
      const odds=tip.odds>0?` @ ${tip.odds.toFixed(2)}`:'';
      lines.push(`${index+1}. ${tip.fixture} — ${tip.market}: ${tip.pick}${odds}`);
    });
    lines.push('','Check every market and price on your local platform before use. 18+ only.');
    return lines.join('\n');
  }

  function updateCountryUI(){
    const name=countryName();
    document.querySelectorAll('[data-country-name]').forEach(node=>node.textContent=name);
    const open=$('#openCountrySite');if(open)open.href=window.SportyRegion?.officialSiteUrl?.()||'https://www.sportybet.com/';
    const note=$('#countryAvailabilityNote');if(note)note.textContent=`Use the listed selections to rebuild the slip for ${name}. Market names and odds can differ by country.`;
  }

  function matchesFilters(item){
    const search=state.search.toLowerCase();const tips=tipsFor(item);const haystack=[itemCode(item),item.title,item.category,...tips.flatMap(tip=>[tip.fixture,tip.market,tip.pick,tip.league])].join(' ').toLowerCase();
    const count=itemSelections(item);
    const sizeOk=state.size==='all'||(state.size==='small'&&count<=5)||(state.size==='medium'&&count>=6&&count<=15)||(state.size==='large'&&count>=16);
    return (!search||haystack.includes(search))&&sizeOk;
  }

  function selectionRow(tip,index){
    const row=el('li','international-selection');
    const count=el('span','international-selection-number',String(index+1));
    const body=el('div','international-selection-body');
    const title=el('strong','',tip.fixture);const meta=el('span','',`${tip.market}: ${tip.pick}${tip.odds>0?` · ${tip.odds.toFixed(2)}`:''}`);
    body.append(title,meta);if(tip.league||tip.kickoff){const detail=el('small','',[tip.league,dateValue(tip.kickoff)?.toLocaleString([], {dateStyle:'medium',timeStyle:'short'})].filter(Boolean).join(' · '));body.append(detail)}
    row.append(count,body);return row;
  }

  function codeCard(item,highlight=false){
    const code=itemCode(item);const odds=itemOdds(item);const tips=tipsFor(item);const selections=itemSelections(item);const kickoff=firstKickoff(item);
    const card=el('article',`international-code-card${highlight?' is-highlighted':''}`);card.id=`code-${code}`;
    const head=el('div','international-code-head');
    const identity=el('div','');identity.append(el('span','eyebrow','Ghana source code'),el('h3','',code||'Code unavailable'));
    const oddsBox=el('div','international-odds');oddsBox.append(el('span','Source odds'),el('strong','',formatOdds(odds)));
    head.append(identity,oddsBox);
    const meta=el('div','international-code-meta');
    meta.append(el('span','',`${selections||tips.length} selection${(selections||tips.length)===1?'':'s'}`));
    if(kickoff)meta.append(el('span','',kickoff.toLocaleDateString([], {weekday:'short',day:'numeric',month:'short'})));
    meta.append(el('span','',`Rebuild for ${countryName()}`));

    const warning=el('p','international-code-warning',`This Ghana booking code may not load in ${countryName()}. Review the selections below and recreate them locally.`);
    const actions=el('div','international-code-actions');
    const detailsButton=el('button','button primary',tips.length?`View ${tips.length} selections`:'Selections unavailable');detailsButton.type='button';detailsButton.disabled=!tips.length;
    const copyButton=el('button','button secondary','Copy selections');copyButton.type='button';copyButton.disabled=!tips.length;copyButton.addEventListener('click',()=>copy(selectionText(item),'Selections copied.'));
    const codeButton=el('button','button ghost','Copy Ghana code');codeButton.type='button';codeButton.disabled=!code;codeButton.addEventListener('click',()=>copy(code,'Ghana code copied.'));
    const siteLink=el('a','button ghost','Open official site ↗');siteLink.href=window.SportyRegion?.officialSiteUrl?.()||'https://www.sportybet.com/';siteLink.target='_blank';siteLink.rel='noopener noreferrer';
    actions.append(detailsButton,copyButton,codeButton,siteLink);

    const details=el('div','international-selections');details.hidden=true;
    const detailHead=el('div','international-selections-head');detailHead.append(el('strong','',`Selections in ${code}`),el('span','',`${tips.length} mapped`));
    const list=el('ol','international-selection-list');tips.forEach((tip,index)=>list.append(selectionRow(tip,index)));
    details.append(detailHead,list);
    detailsButton.addEventListener('click',()=>{
      details.hidden=!details.hidden;detailsButton.textContent=details.hidden?`View ${tips.length} selections`:'Hide selections';
      if(!details.hidden)details.scrollIntoView({behavior:'smooth',block:'nearest'});
    });
    card.append(head,meta,warning,actions,details);return card;
  }

  function render(){
    const root=$('#internationalCodesGrid');if(!root)return;clear(root);
    if(state.status==='loading'){root.append(el('div','loading-shimmer'));return}
    if(state.status==='error'){const empty=el('div','empty');empty.append(el('strong','','The public feed is temporarily unavailable.'),el('span','','Your Ghana structure is unchanged. Refresh this page when the feed returns.'));root.append(empty);return}
    const focus=new URLSearchParams(location.search).get('code')?.toUpperCase()||'';
    let items=state.items.filter(matchesFilters);
    if(focus)items=[...items].sort((a,b)=>(itemCode(a)===focus?-1:0)-(itemCode(b)===focus?-1:0));
    if(!items.length){const empty=el('div','empty');empty.append(el('strong','','No codes match these filters.'),el('span','','Try another slip size or search term.'));root.append(empty);return}
    items.slice(0,30).forEach(item=>root.append(codeCard(item,itemCode(item)===focus)));
    $('#internationalCount').textContent=String(items.length);
    const totalSelections=items.reduce((sum,item)=>sum+itemSelections(item),0);$('#internationalSelections').textContent=String(totalSelections);
    if(focus){requestAnimationFrame(()=>document.querySelector(`#code-${CSS.escape(focus)}`)?.scrollIntoView({behavior:'smooth',block:'center'}))}
  }

  async function loadFeed(){
    const url=text(config.codeHubFeedUrl)||'/data/codehub-banner.json';
    try{
      const response=await fetch(`${url}${url.includes('?')?'&':'?'}ts=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const payload=await response.json();state.items=Array.isArray(payload.items)?payload.items.filter(item=>itemCode(item)):[];state.generatedAt=payload.generated_at||null;state.status='ready';
      const updated=$('#internationalUpdated');const date=dateValue(state.generatedAt);if(updated)updated.textContent=date?`Updated ${date.toLocaleString([], {dateStyle:'medium',timeStyle:'short'})}`:'Feed ready';
    }catch(error){console.warn('International feed unavailable',error);state.status='error'}
    render();
  }

  function bind(){
    const country=$('#internationalCountry');if(country){country.value=window.SportyRegion?.currentCountry?.()||'INTL';country.addEventListener('change',()=>{window.SportyRegion?.setCountry?.(country.value);updateCountryUI();render()})}
    $('#internationalSearch')?.addEventListener('input',event=>{state.search=event.target.value;render()});
    $('#internationalSize')?.addEventListener('change',event=>{state.size=event.target.value;render()});
    $('#switchToGhana')?.addEventListener('click',()=>window.SportyRegion?.setRegion?.('ghana'));
    window.addEventListener('sporty:country-change',()=>{updateCountryUI();render()});
  }

  function init(){bind();updateCountryUI();render();loadFeed()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();

  window.__SPORTY_INTERNATIONAL_TEST__={tipsFor,itemCode,itemOdds,itemSelections,selectionText,matchesFilters};
})();
