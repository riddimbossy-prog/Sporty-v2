(()=>{
  'use strict';

  const $=selector=>document.querySelector(selector);
  const $$=selector=>Array.from(document.querySelectorAll(selector));
  const clean=value=>String(value??'').trim();
  const number=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:0};
  const DEFAULTS={
    favorite_markets:[],favorite_leagues:[],min_tip_strength:65,max_opposition:30,min_sources:2,
    odds_min:1.10,odds_max:5.00,selections_min:1,selections_max:20,preferred_day:'all',
    notifications_opt_in:false,digest_frequency:'off',onboarding_completed:false,age_confirmed_at:null
  };
  const state={preferences:{...DEFAULTS},loaded:false,view:'for-you',menuOpen:false,dialogOpen:false,mandatory:false};

  function normalizePreferences(row={}){
    return {
      ...DEFAULTS,...row,
      favorite_markets:Array.isArray(row.favorite_markets)?row.favorite_markets.filter(Boolean):[],
      favorite_leagues:Array.isArray(row.favorite_leagues)?row.favorite_leagues.filter(Boolean):[],
      odds_min:number(row.odds_min)||DEFAULTS.odds_min,
      odds_max:number(row.odds_max)||DEFAULTS.odds_max,
      selections_min:Math.max(1,Math.floor(number(row.selections_min)||DEFAULTS.selections_min)),
      selections_max:Math.max(1,Math.floor(number(row.selections_max)||DEFAULTS.selections_max)),
      notifications_opt_in:row.notifications_opt_in===true,
      digest_frequency:['off','daily','weekly'].includes(clean(row.digest_frequency))?clean(row.digest_frequency):'off',
      onboarding_completed:row.onboarding_completed===true,
      age_confirmed_at:row.age_confirmed_at||null
    };
  }

  function token(value){return clean(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
  function marketFamily(value){
    const source=token(value);
    if(!source)return '';
    if(/btts|both teams|gg|ng/.test(source))return 'btts';
    if(/over 1 5/.test(source))return 'over15';
    if(/over 2 5/.test(source))return 'over25';
    if(/under 3 5/.test(source))return 'under35';
    if(/team goal|team total/.test(source))return 'teamgoals';
    if(/goal|over|under|score/.test(source))return 'goals';
    if(/double chance|1x|x2|12|draw no bet|dnb/.test(source))return 'doublechance';
    if(/home win|away win|match winner|1x2|draw/.test(source))return '1x2';
    if(/corner/.test(source))return 'corners';
    if(/card/.test(source))return 'cards';
    return source;
  }

  function codeSignals(item){
    const mvp=window.SportyMVP;
    const tips=mvp?.normalizedTips?.(item)||[];
    const category=mvp?.categoryForCode?.(item)||clean(item.category);
    const markets=new Set([marketFamily(category)]);
    const leagues=new Set();
    for(const tip of tips){
      markets.add(marketFamily(`${tip.market} ${tip.pick} ${tip.category||''}`));
      if(clean(tip.league))leagues.add(token(tip.league));
    }
    return {tips,category,markets:[...markets].filter(Boolean),leagues:[...leagues]};
  }

  function marketMatches(preferences,signals){
    if(!preferences.length)return true;
    const desired=preferences.map(marketFamily).filter(Boolean);
    return desired.some(pref=>signals.markets.some(actual=>{
      if(pref==='goals')return ['goals','btts','over15','over25','under35','teamgoals'].includes(actual);
      return actual===pref||actual.includes(pref)||pref.includes(actual);
    }));
  }

  function leagueMatches(preferences,signals){
    if(!preferences.length)return true;
    if(!signals.leagues.length)return true;
    const desired=preferences.map(token).filter(Boolean);
    return desired.some(pref=>signals.leagues.some(actual=>actual.includes(pref)||pref.includes(actual)));
  }

  function scoreCode(item,prefs=state.preferences){
    const mvp=window.SportyMVP;
    if(!mvp)return {matches:false,score:0,reasons:[]};
    const odds=number(item.odds);
    const selections=Math.max(0,Math.floor(number(item.selections)));
    const kickoff=mvp.kickoffForCode?.(item)||null;
    if(odds<prefs.odds_min||odds>prefs.odds_max)return {matches:false,score:0,reasons:[]};
    if(selections<prefs.selections_min||selections>prefs.selections_max)return {matches:false,score:0,reasons:[]};
    if(!mvp.dayFilterMatches?.(kickoff,prefs.preferred_day||'all'))return {matches:false,score:0,reasons:[]};
    const signals=codeSignals(item);
    if(!marketMatches(prefs.favorite_markets,signals))return {matches:false,score:0,reasons:[]};
    if(!leagueMatches(prefs.favorite_leagues,signals))return {matches:false,score:0,reasons:[]};
    const reasons=[];
    let score=3;
    if(prefs.favorite_markets.length){score+=4;reasons.push('market match')}
    if(prefs.favorite_leagues.length&&signals.leagues.length){score+=4;reasons.push('league match')}
    if(selections<=5){score+=1;reasons.push('compact slip')}
    if(prefs.preferred_day!=='all'){score+=1;reasons.push('match-day fit')}
    reasons.push('odds range');
    return {matches:true,score,reasons};
  }

  function matchedCodes(){
    const mvp=window.SportyMVP;
    const all=mvp?.displayableCodes?.()||[];
    return all.map(item=>({item,...scoreCode(item)})).filter(row=>row.matches).sort((a,b)=>{
      const byScore=b.score-a.score;if(byScore)return byScore;
      const aDate=mvp.dateValue?.(a.item.created_at)?.getTime()||0;
      const bDate=mvp.dateValue?.(b.item.created_at)?.getTime()||0;
      return bDate-aDate;
    });
  }

  function renderHome(){
    const section=$('#memberHomeSection');
    const grid=$('#memberHomeGrid');
    if(!section||!grid||!state.loaded||!window.SportyMVP)return;
    const all=window.SportyMVP.displayableCodes?.()||[];
    const matches=matchedCodes();
    const forYouButton=$('[data-member-view="for-you"]');
    const allButton=$('[data-member-view="all"]');
    if(!all.length){section.hidden=true;return}
    section.hidden=false;
    if(forYouButton)forYouButton.hidden=matches.length===0;
    if(state.view==='for-you'&&!matches.length)state.view='all';
    const rows=state.view==='for-you'?matches.map(row=>row.item):all;
    if(forYouButton){forYouButton.classList.toggle('active',state.view==='for-you');forYouButton.setAttribute('aria-selected',state.view==='for-you'?'true':'false')}
    if(allButton){allButton.classList.toggle('active',state.view==='all');allButton.setAttribute('aria-selected',state.view==='all'?'true':'false')}
    const count=$('#memberHomeCount');if(count)count.textContent=`${Math.min(rows.length,8)} of ${rows.length}`;
    const copy=$('#memberHomeCopy');
    if(copy)copy.textContent=state.view==='for-you'
      ?'These free public codes match your saved filters. A match is not a recommendation or a guarantee.'
      :'All complete codes currently available in the public feed.';
    grid.replaceChildren();
    rows.slice(0,8).forEach(item=>{
      const card=window.SportyMVP.codeCard?.(item);
      if(!card)return;
      card.classList.add('member-home-card');
      if(state.view==='for-you'){
        const result=scoreCode(item);
        const badge=document.createElement('div');
        badge.className='preference-match-badge';
        badge.textContent=`Matches ${result.reasons.slice(0,2).join(' + ')}`;
        card.prepend(badge);
      }
      grid.append(card);
    });
  }

  async function loadPreferences(){
    const auth=window.SportyAuth;
    if(!auth)return;
    await auth.ready;
    if(!auth.session?.user||!auth.client)return;
    const {data,error}=await auth.client.from('user_preferences').select('*').eq('user_id',auth.session.user.id).maybeSingle();
    if(error)console.warn('Personalisation preferences unavailable',error.message);
    state.preferences=normalizePreferences(data||{});
    state.loaded=true;
    renderHome();
    if(!state.preferences.onboarding_completed||!state.preferences.age_confirmed_at)openPreferences(true);
  }

  function dialogMarkup(){
    const shell=document.createElement('div');
    shell.id='memberPreferencesShell';
    shell.className='member-preferences-shell';
    shell.hidden=true;
    shell.innerHTML=`
      <div class="member-preferences-backdrop" data-preferences-close></div>
      <section class="member-preferences-dialog" role="dialog" aria-modal="true" aria-labelledby="memberPreferencesTitle">
        <button class="member-dialog-close" type="button" aria-label="Close preferences" data-preferences-close>×</button>
        <div class="member-dialog-head"><span class="eyebrow">Personalise your home</span><h2 id="memberPreferencesTitle">Show codes that fit your filters</h2><p>Choose a simple range. You can change it anytime from your profile picture.</p></div>
        <form id="memberPreferencesForm" class="member-preferences-form">
          <label>Market focus<select name="marketFocus"><option value="all">All markets</option><option>Goals</option><option>Over 1.5</option><option>Over 2.5</option><option>Under 3.5</option><option>BTTS</option><option>1X2</option><option>Double Chance</option><option>Team Goals</option><option>Corners</option><option>Cards</option></select></label>
          <label>League focus<select name="leagueFocus"><option value="all">All leagues</option><option>Premier League</option><option>La Liga</option><option>Serie A</option><option>Bundesliga</option><option>Ligue 1</option><option>Champions League</option><option>Europa League</option><option>MLS</option><option>Saudi Pro League</option><option value="Other">Other leagues</option></select></label>
          <label>Odds range<select name="oddsRange"><option value="1.10:3">1.10–3.00</option><option value="1.10:5">1.10–5.00</option><option value="1.50:10">1.50–10.00</option><option value="1.10:25">1.10–25.00</option><option value="1.10:1000">Any available odds</option></select></label>
          <label>Slip size<select name="slipRange"><option value="1:5">1–5 selections</option><option value="6:10">6–10 selections</option><option value="11:20">11–20 selections</option><option value="1:20">1–20 selections</option><option value="1:100">Any slip size</option></select></label>
          <label>Match day<select name="preferredDay"><option value="all">All days</option><option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="week">Next 7 days</option></select></label>
          <label>In-app digest<select name="digestFrequency"><option value="off">Off</option><option value="daily">Daily summary</option><option value="weekly">Weekly summary</option></select></label>
          <label class="check-row member-check-wide"><input name="notificationsOptIn" type="checkbox"><span>Show saved-item changes and preference matches inside my account.</span></label>
          <label class="check-row member-check-wide age-confirm-row"><input name="ageConfirmed" type="checkbox"><span>I confirm that I am 18 or older.</span></label>
          <p class="member-responsible-note">Preference matching only organises public codes. It does not predict an outcome or guarantee a result. Set limits and use responsibly.</p>
          <p id="memberPreferencesMessage" class="auth-status" hidden></p>
          <div class="member-dialog-actions"><button class="button secondary" type="button" data-preferences-close>Cancel</button><button class="button primary" type="submit">Save and continue</button></div>
        </form>
      </section>`;
    document.body.append(shell);
    shell.querySelector('#memberPreferencesForm')?.addEventListener('submit',saveQuickPreferences);
    shell.querySelectorAll('[data-preferences-close]').forEach(node=>node.addEventListener('click',()=>closePreferences()));
    return shell;
  }

  function splitRange(value,fallbackMin,fallbackMax){
    const [min,max]=clean(value).split(':').map(Number);
    return [Number.isFinite(min)?min:fallbackMin,Number.isFinite(max)?max:fallbackMax];
  }

  function nearestRange(min,max,values,fallback){
    let best=fallback,bestDistance=Infinity;
    for(const value of values){const [a,b]=value.split(':').map(Number);const distance=Math.abs(a-min)+Math.abs(b-max);if(distance<bestDistance){best=value;bestDistance=distance}}
    return best;
  }

  function fillDialog(){
    const form=$('#memberPreferencesForm');if(!form)return;
    const prefs=state.preferences;
    form.elements.marketFocus.value=prefs.favorite_markets[0]||'all';
    form.elements.leagueFocus.value=prefs.favorite_leagues[0]||'all';
    form.elements.oddsRange.value=nearestRange(prefs.odds_min,prefs.odds_max,['1.10:3','1.10:5','1.50:10','1.10:25','1.10:1000'],'1.10:5');
    form.elements.slipRange.value=nearestRange(prefs.selections_min,prefs.selections_max,['1:5','6:10','11:20','1:20','1:100'],'1:20');
    form.elements.preferredDay.value=prefs.preferred_day||'all';
    form.elements.digestFrequency.value=prefs.digest_frequency||'off';
    form.elements.notificationsOptIn.checked=prefs.notifications_opt_in===true;
    form.elements.ageConfirmed.checked=Boolean(prefs.age_confirmed_at);
    const message=$('#memberPreferencesMessage');if(message){message.hidden=true;message.textContent=''}
  }

  function openPreferences(mandatory=false){
    const shell=$('#memberPreferencesShell')||dialogMarkup();
    state.mandatory=Boolean(mandatory);
    state.dialogOpen=true;
    fillDialog();
    shell.hidden=false;
    shell.dataset.mandatory=state.mandatory?'true':'false';
    document.documentElement.classList.add('member-dialog-open');
    const close=shell.querySelector('.member-dialog-close');if(close)close.hidden=state.mandatory;
    shell.querySelectorAll('[data-preferences-close]').forEach(node=>{if(node!==close)node.hidden=state.mandatory});
    requestAnimationFrame(()=>shell.querySelector('select')?.focus({preventScroll:true}));
  }

  function closePreferences(force=false){
    if(state.mandatory&&!force)return;
    const shell=$('#memberPreferencesShell');if(shell)shell.hidden=true;
    state.dialogOpen=false;state.mandatory=false;
    document.documentElement.classList.remove('member-dialog-open');
  }

  async function saveQuickPreferences(event){
    event.preventDefault();
    const auth=window.SportyAuth;await auth.ready;
    const form=event.currentTarget;
    const message=$('#memberPreferencesMessage');
    const ageConfirmed=form.elements.ageConfirmed.checked||Boolean(state.preferences.age_confirmed_at);
    if(!ageConfirmed){message.textContent='You must confirm that you are 18 or older.';message.dataset.tone='error';message.hidden=false;return}
    const [oddsMin,oddsMax]=splitRange(form.elements.oddsRange.value,1.10,5);
    const [selectionsMin,selectionsMax]=splitRange(form.elements.slipRange.value,1,20);
    const market=clean(form.elements.marketFocus.value);
    const league=clean(form.elements.leagueFocus.value);
    const row={
      user_id:auth.session.user.id,
      favorite_markets:market&&market!=='all'?[market]:[],
      favorite_leagues:league&&league!=='all'?[league]:[],
      min_tip_strength:number(state.preferences.min_tip_strength)||65,
      max_opposition:number(state.preferences.max_opposition)||30,
      min_sources:number(state.preferences.min_sources)||2,
      odds_min:oddsMin,odds_max:oddsMax,
      selections_min:selectionsMin,selections_max:selectionsMax,
      preferred_day:form.elements.preferredDay.value,
      location_opt_in:false,
      notifications_opt_in:form.elements.notificationsOptIn.checked,
      digest_frequency:form.elements.digestFrequency.value,
      onboarding_completed:true,
      age_confirmed_at:state.preferences.age_confirmed_at||new Date().toISOString(),
      updated_at:new Date().toISOString()
    };
    const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;
    const {data,error}=await auth.client.from('user_preferences').upsert(row,{onConflict:'user_id'}).select().single();
    if(submit)submit.disabled=false;
    if(error){message.textContent=error.message||'Preferences could not be saved.';message.dataset.tone='error';message.hidden=false;return}
    state.preferences=normalizePreferences(data||row);state.loaded=true;
    closePreferences(true);renderHome();
    document.dispatchEvent(new CustomEvent('sportypreferenceschange',{detail:{preferences:state.preferences}}));
  }

  function menuMarkup(){
    const shell=document.createElement('div');
    shell.id='memberMenuShell';shell.className='member-menu-shell';shell.hidden=true;
    shell.innerHTML=`<div class="member-menu-scrim" data-member-menu-close></div><aside class="member-menu" role="menu" aria-label="Account menu"><div class="member-menu-profile"><div id="memberMenuAvatar" class="member-menu-avatar"></div><div><strong id="memberMenuName">Member</strong><span id="memberMenuEmail"></span></div></div><nav><a role="menuitem" href="/account.html">My account</a><a role="menuitem" href="/account.html#preferences" data-open-preferences>My preferences</a><a role="menuitem" href="/saved.html">Saved codes</a><a role="menuitem" href="/account.html#recent-codes">Recently viewed</a><a role="menuitem" href="/account.html#notification-settings">Notification settings</a></nav><button id="memberMenuSignOut" class="member-menu-signout" type="button">Sign out</button></aside>`;
    document.body.append(shell);
    shell.querySelectorAll('[data-member-menu-close]').forEach(node=>node.addEventListener('click',closeMenu));
    shell.querySelector('#memberMenuSignOut')?.addEventListener('click',()=>window.SportyAuth?.signOut('/login.html?signed_out=1'));
    shell.querySelector('[data-open-preferences]')?.addEventListener('click',event=>{
      if(document.body.dataset.page!=='home')return;
      event.preventDefault();closeMenu();openPreferences(false);
    });
    return shell;
  }

  function openMenu(anchor){
    const auth=window.SportyAuth;if(!auth?.session?.user)return;
    const shell=$('#memberMenuShell')||menuMarkup();
    const name=auth.getDisplayName?.()||'Member';
    $('#memberMenuName').textContent=name;$('#memberMenuEmail').textContent=auth.session.user.email||'';
    auth.renderAvatar?.($('#memberMenuAvatar'),{size:'large',label:name});
    shell.hidden=false;state.menuOpen=true;document.documentElement.classList.add('member-menu-open');
    anchor?.setAttribute('aria-expanded','true');
    requestAnimationFrame(()=>shell.querySelector('a')?.focus({preventScroll:true}));
  }

  function closeMenu(){
    const shell=$('#memberMenuShell');if(shell)shell.hidden=true;
    state.menuOpen=false;document.documentElement.classList.remove('member-menu-open');
    $$('[data-auth-link]').forEach(node=>node.setAttribute('aria-expanded','false'));
  }

  function bind(){
    document.addEventListener('click',event=>{
      const authLink=event.target.closest?.('[data-auth-link].signed-in');
      if(authLink){event.preventDefault();state.menuOpen?closeMenu():openMenu(authLink);return}
      const view=event.target.closest?.('[data-member-view]');
      if(view){state.view=view.dataset.memberView;renderHome();return}
      if(event.target.closest?.('#quickPreferencesButton')){openPreferences(false);return}
    });
    document.addEventListener('keydown',event=>{
      if(event.key!=='Escape')return;
      if(state.menuOpen)closeMenu();
      else if(state.dialogOpen)closePreferences();
    });
    document.addEventListener('sporty:feed-updated',renderHome);
    document.addEventListener('sportyauthchange',event=>{
      if(event.detail?.session?.user){
        $$('[data-auth-link]').forEach(node=>{node.setAttribute('aria-haspopup','menu');node.setAttribute('aria-expanded','false')});
        if(!state.loaded)loadPreferences();
      }else closeMenu();
    });
  }

  async function init(){
    bind();
    const auth=window.SportyAuth;if(!auth)return;
    await auth.ready;
    if(auth.session?.user){
      $$('[data-auth-link]').forEach(node=>{node.setAttribute('aria-haspopup','menu');node.setAttribute('aria-expanded','false')});
      await loadPreferences();
    }
  }

  window.SportyMember={get preferences(){return state.preferences},openPreferences,closePreferences,scoreCode,matchedCodes,renderHome};
  window.__SPORTY_PERSONALIZATION_TEST__={normalizePreferences,marketFamily,marketMatches,leagueMatches,scoreCode};
  document.addEventListener('DOMContentLoaded',init);
})();
