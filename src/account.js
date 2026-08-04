(()=>{
  'use strict';
  const $=selector=>document.querySelector(selector);
  const $$=selector=>Array.from(document.querySelectorAll(selector));
  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const clean=value=>String(value??'').trim();
  const date=value=>value?new Date(value).toLocaleString():'Never';
  let preferences=null;
  let deletion=null;

  function message(text,tone='neutral'){
    const box=$('#accountMessage');
    if(!box)return;
    box.textContent=text;box.dataset.tone=tone;box.hidden=!text;
  }

  function blocked(status){
    $('#accountLoading').hidden=true;$('#accountApp').hidden=true;$('#accountBlocked').hidden=false;
    const labels={suspended:'This account is temporarily suspended.',disabled:'This account has been disabled.',pending_deletion:'This account has a pending deletion request.',deleted:'This account is no longer active.'};
    $('#blockedCopy').textContent=labels[status]||'This account is unavailable.';
  }

  function readMulti(name){
    return $$(`input[name="${name}"]:checked`).map(input=>input.value).slice(0,30);
  }

  function setMulti(name,values=[]){
    const selected=new Set((Array.isArray(values)?values:[]).map(String));
    $$(`input[name="${name}"]`).forEach(input=>{input.checked=selected.has(input.value)});
    updateMultiSummary(name);
  }

  function updateMultiSummary(name){
    const selected=readMulti(name);
    const summary=$(`[data-summary-for="${name}"]`);
    if(!summary)return;
    if(!selected.length){summary.textContent=name==='favoriteMarkets'?'All markets':'All leagues';return}
    summary.textContent=selected.length<=2?selected.join(', '):`${selected.length} selected`;
  }

  function selectValue(id,value,fallback){
    const node=$(id);if(!node)return;
    const stringValue=String(value??fallback);
    const exists=Array.from(node.options||[]).some(option=>option.value===stringValue);
    node.value=exists?stringValue:String(fallback);
  }

  function renderHeroIdentity(auth){
    const name=auth.getDisplayName?.()||'Member';
    $('#accountName').textContent=name;
    $('#accountEmail').textContent=auth.session?.user?.email||'';
    const avatar=$('#accountHeroAvatar');
    if(avatar)auth.renderAvatar?.(avatar,{size:'large',label:name});
  }

  async function loadPreferences(auth){
    const {data,error}=await auth.client.from('user_preferences').select('*').eq('user_id',auth.session.user.id).maybeSingle();
    if(error)console.warn('Preferences unavailable',error.message);
    preferences=data||{
      favorite_markets:[],favorite_leagues:[],min_tip_strength:65,max_opposition:30,
      min_sources:2,odds_min:1.10,odds_max:5.00,selections_min:1,selections_max:20,preferred_day:'all',notifications_opt_in:false,digest_frequency:'off',onboarding_completed:false,age_confirmed_at:null
    };
    setMulti('favoriteMarkets',preferences.favorite_markets||[]);
    setMulti('favoriteLeagues',preferences.favorite_leagues||[]);
    selectValue('#minStrength',preferences.min_tip_strength,65);
    selectValue('#maxOpposition',preferences.max_opposition,30);
    selectValue('#minSources',preferences.min_sources,2);
    selectValue('#oddsMin',Number(preferences.odds_min??1.10).toFixed(2),1.10);
    selectValue('#oddsMax',Number(preferences.odds_max??5.00).toFixed(2),5.00);
    selectValue('#preferredDay',preferences.preferred_day||'all','all');
    selectValue('#selectionsMin',preferences.selections_min??1,1);
    selectValue('#selectionsMax',preferences.selections_max??20,20);
    selectValue('#digestFrequency',preferences.digest_frequency||'off','off');
    $('#notificationsOptIn').checked=preferences.notifications_opt_in===true;
    $('#ageConfirmed').checked=Boolean(preferences.age_confirmed_at);
  }

  async function loadDeletion(auth){
    const {data}=await auth.client.from('account_deletion_requests').select('id,status,reason,requested_at,updated_at,resolution_note').order('requested_at',{ascending:false}).limit(1).maybeSingle();
    deletion=data||null;
    const panel=$('#deletionState');
    if(!deletion){panel.innerHTML='<strong>No deletion request</strong><span>Your account remains active.</span>';$('#cancelDeletion').hidden=true;return}
    panel.innerHTML=`<strong>${esc(deletion.status.replaceAll('_',' '))}</strong><span>Requested ${date(deletion.requested_at)}</span>`;
    $('#cancelDeletion').hidden=!['pending','reviewing'].includes(deletion.status);
  }

  async function loadSignins(auth){
    const {data,error}=await auth.client.from('user_signins').select('signed_in_at,signed_out_at,timezone,device_type,browser_name,os_name,auth_provider').order('signed_in_at',{ascending:false}).limit(8);
    const root=$('#signinHistory');
    if(error){root.innerHTML='<div class="empty"><strong>Sign-in history unavailable</strong><span>Try again later.</span></div>';return}
    root.innerHTML=(data||[]).length?(data||[]).map(row=>`<article class="account-history-row"><div><strong>${esc(row.device_type||'Device')}</strong><span>${esc([row.browser_name,row.os_name].filter(Boolean).join(' · ')||'Browser details unavailable')}</span></div><div><strong>${date(row.signed_in_at)}</strong><span>${esc(row.auth_provider||'email')} · ${esc(row.timezone||'Timezone unavailable')}</span></div></article>`).join(''):'<div class="empty"><strong>No sign-in history yet</strong><span>Your recent sessions will appear here.</span></div>';
  }

  function renderSavedPreview(){
    const items=window.SportySaved?.getCached()||[];
    document.querySelectorAll('[data-saved-count]').forEach(node=>node.textContent=String(items.length));
    const root=$('#savedPreview');
    const rows=items.slice(0,4);
    root.innerHTML=rows.length?rows.map(item=>`<article class="saved-mini-card"><span class="pill ${item.item_status==='changed'?'pill-alert':''}">${esc(item.item_status==='changed'?'changed':item.item_type)}</span><strong>${esc(item.title)}</strong><small>${esc(item.payload?.last_change_note||item.subtitle||'Saved for later')}</small></article>`).join(''):'<div class="empty"><strong>Nothing saved yet</strong><span>Save free codes or Smart Board tips to keep them here.</span></div>';
  }

  function renderRecent(){
    const rows=window.SportySaved?.recentCodes()||[];
    const root=$('#recentCodes');
    root.innerHTML=rows.length?rows.map(item=>`<article class="saved-mini-card"><span class="pill">recent code</span><strong>${esc(item.title)}</strong><small>${esc(item.subtitle||'')}</small></article>`).join(''):'<div class="empty"><strong>No recently viewed codes</strong><span>Codes you copy or open will appear on this device.</span></div>';
  }

  async function saveProfile(event){
    event.preventDefault();
    const auth=window.SportyAuth;await auth.ready;
    const name=clean($('#displayName').value);
    const username=clean($('#username').value).toLowerCase().replace(/[^a-z0-9_]+/g,'_').replace(/^_+|_+$/g,'').slice(0,28);
    if(name.length<2){message('Enter a display name with at least 2 characters.','error');return}
    const submit=event.submitter; if(submit)submit.disabled=true;
    const {error}=await auth.client.from('profiles').update({display_name:name,username:username||null}).eq('id',auth.session.user.id);
    if(submit)submit.disabled=false;
    if(error){message(error.message||'Profile could not be saved.','error');return}
    await auth.refreshProfile?.();
    renderHeroIdentity(auth);
    message('Profile updated.','success');
  }

  async function savePreferences(event){
    event.preventDefault();
    const auth=window.SportyAuth;await auth.ready;
    const oddsMin=Number($('#oddsMin').value),oddsMax=Number($('#oddsMax').value);
    const selectionsMin=Number($('#selectionsMin').value),selectionsMax=Number($('#selectionsMax').value);
    if(!(oddsMin>=1&&oddsMax>=oddsMin)){message('Check the preferred odds range.','error');return}
    if(!(selectionsMin>=1&&selectionsMax>=selectionsMin)){message('Check the preferred slip-size range.','error');return}
    if(!$('#ageConfirmed').checked&&!preferences?.age_confirmed_at){message('You must confirm that you are 18 or older.','error');return}
    const row={
      user_id:auth.session.user.id,
      favorite_markets:readMulti('favoriteMarkets'),
      favorite_leagues:readMulti('favoriteLeagues'),
      min_tip_strength:Number($('#minStrength').value)||0,
      max_opposition:Number($('#maxOpposition').value)||0,
      min_sources:Number($('#minSources').value)||1,
      odds_min:oddsMin,odds_max:oddsMax,
      selections_min:selectionsMin,selections_max:selectionsMax,
      preferred_day:$('#preferredDay').value,
      location_opt_in:false,
      notifications_opt_in:$('#notificationsOptIn').checked,
      digest_frequency:$('#digestFrequency').value,
      onboarding_completed:true,
      age_confirmed_at:preferences?.age_confirmed_at||new Date().toISOString(),
      updated_at:new Date().toISOString()
    };
    const submit=event.submitter;if(submit)submit.disabled=true;
    const {error}=await auth.client.from('user_preferences').upsert(row,{onConflict:'user_id'});
    if(submit)submit.disabled=false;
    if(error){message(error.message||'Preferences could not be saved.','error');return}
    preferences=row;message('Preferences saved. Your personalised home has been updated.','success');document.dispatchEvent(new CustomEvent('sportypreferenceschange',{detail:{preferences:row}}));
  }

  async function signOutEverywhere(){
    const auth=window.SportyAuth;await auth.ready;
    if(!confirm('Sign out this account on every device?'))return;
    try{await auth.client.rpc('record_user_sign_out')}catch{}
    const {error}=await auth.client.auth.signOut({scope:'global'});
    if(error){message(error.message||'Could not sign out all devices.','error');return}
    location.replace('/login.html?signed_out=all');
  }

  async function requestDeletion(){
    const typed=clean($('#deleteConfirm').value);
    if(typed!=='DELETE'){message('Type DELETE exactly to submit the request.','error');return}
    const reason=clean($('#deleteReason').value);
    const auth=window.SportyAuth;await auth.ready;
    const {error}=await auth.client.rpc('request_account_deletion',{p_reason:reason||null});
    if(error){message(error.message||'Deletion request could not be submitted.','error');return}
    message('Deletion request sent.','success');
    $('#deleteConfirm').value='';await loadDeletion(auth);await auth.refreshAccess();
  }

  async function cancelDeletion(){
    const auth=window.SportyAuth;await auth.ready;
    const {error}=await auth.client.rpc('cancel_account_deletion');
    if(error){message(error.message||'Request could not be cancelled.','error');return}
    message('Deletion request cancelled.','success');await loadDeletion(auth);await auth.refreshAccess();
  }

  async function init(){
    const loader=$('#accountLoading');
    const slowTimer=setTimeout(()=>{
      if(loader&&!loader.hidden){loader.querySelector('p').textContent='Still loading…'}
    },4500);
    try{
      const auth=window.SportyAuth;await auth.ready;
      if(!auth.session?.user){location.replace(`/login.html?next=${encodeURIComponent('/account.html')}`);return}
      if(auth.access?.is_allowed===false&&!auth.isAdmin()){blocked(auth.access.account_status);return}
      loader.hidden=true;$('#accountApp').hidden=false;
      renderHeroIdentity(auth);
      $('#displayName').value=auth.getDisplayName?.()||'';
      $('#username').value=auth.profile?.username||'';
      const results=await Promise.allSettled([loadPreferences(auth),loadDeletion(auth),loadSignins(auth),window.SportySaved?.load({force:true})]);
      if(results.some(result=>result.status==='rejected'))message('Some account details could not be refreshed. Your main account is still available.','neutral');
      renderSavedPreview();renderRecent();
    }catch(error){
      console.error('Account page failed to open',error);
      loader.hidden=true;$('#accountApp').hidden=false;
      message('Your account could not be fully refreshed. Check your connection and try again.','error');
    }finally{clearTimeout(slowTimer)}
  }

  document.addEventListener('DOMContentLoaded',()=>{
    $('#profileForm')?.addEventListener('submit',saveProfile);
    $('#preferencesForm')?.addEventListener('submit',savePreferences);
    $$('[data-preference-option]').forEach(input=>input.addEventListener('change',()=>updateMultiSummary(input.name)));
    $('#signOutEverywhere')?.addEventListener('click',signOutEverywhere);
    $('#requestDeletion')?.addEventListener('click',requestDeletion);
    $('#cancelDeletion')?.addEventListener('click',cancelDeletion);
    $('#accountSignOut')?.addEventListener('click',()=>window.SportyAuth.signOut('/login.html?signed_out=1'));
    $('#blockedSignOut')?.addEventListener('click',()=>window.SportyAuth.signOut('/login.html?signed_out=1'));
    document.addEventListener('sportysavedchange',renderSavedPreview);
    document.addEventListener('sportyrecentchange',renderRecent);
    init();
  });
})();
