(()=>{
  'use strict';

  const CONFIG=window.SPORTY_CONFIG||{};
  const SESSION_MARKER_KEY='sporty_auth_session_marker_v1';
  const PENDING_NEXT_KEY='sporty_auth_next_v1';
  const HEARTBEAT_MS=45000;
  let client=null;
  let session=null;
  let profile=null;
  let access={authenticated:false,is_admin:false,role:'guest',account_status:'guest',is_allowed:false};
  let heartbeatTimer=null;
  let readyResolve;
  const ready=new Promise(resolve=>{readyResolve=resolve});

  const clean=value=>String(value??'').trim();
  const configured=()=>clean(CONFIG.supabaseUrl).startsWith('https://')&&clean(CONFIG.supabaseAnonKey).length>30&&window.supabase?.createClient;
  const safePath=value=>{const path=clean(value);return path.startsWith('/')&&!path.startsWith('//')?path:'/'};
  const requiresMemberSignIn=()=>document.documentElement.dataset.authRequired==='member';
  const currentReturnPath=()=>safePath(`${location.pathname}${location.search}${location.hash}`);

  function unlockMemberPage(){
    if(requiresMemberSignIn())document.documentElement.dataset.authGate='ready';
  }

  function redirectToMemberLogin(reason='required'){
    const next=currentReturnPath();
    try{localStorage.setItem(PENDING_NEXT_KEY,next)}catch{}
    const params=new URLSearchParams({next});
    if(reason==='blocked')params.set('blocked','1');
    location.replace(`/login.html?${params.toString()}`);
    return true;
  }

  function deviceInfo(){
    const ua=navigator.userAgent||'';
    const width=Math.min(screen.width||innerWidth||0,innerWidth||screen.width||0);
    let device='Desktop';
    if(/iPad|Tablet|SM-X|Tab/i.test(ua)||(navigator.maxTouchPoints>1&&/Macintosh/i.test(ua)))device='Tablet';
    else if(/Android|iPhone|Mobile/i.test(ua)||width<720)device='Mobile';
    let browser='Browser';
    if(/Edg\//.test(ua))browser='Edge';
    else if(/SamsungBrowser\//.test(ua))browser='Samsung Internet';
    else if(/OPR\//.test(ua))browser='Opera';
    else if(/CriOS|Chrome\//.test(ua))browser='Chrome';
    else if(/FxiOS|Firefox\//.test(ua))browser='Firefox';
    else if(/Safari\//.test(ua))browser='Safari';
    let os='Other';
    if(/Android/i.test(ua))os='Android';
    else if(/iPhone|iPad|iPod/i.test(ua))os='iOS';
    else if(/Windows/i.test(ua))os='Windows';
    else if(/Macintosh|Mac OS/i.test(ua))os='macOS';
    else if(/Linux/i.test(ua))os='Linux';
    return {device,browser,os,userAgent:ua.slice(0,500)};
  }

  function providerFor(currentSession){
    const app=clean(currentSession?.user?.app_metadata?.provider);
    if(app)return app;
    const identities=currentSession?.user?.identities||[];
    return clean(identities[0]?.provider)||'email';
  }

  function contextPayload(){
    const info=deviceInfo();
    return {
      p_timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||null,
      p_language:navigator.language||null,
      p_device_type:info.device,
      p_browser_name:info.browser,
      p_os_name:info.os,
      p_auth_provider:providerFor(session),
      p_approx_lat:null,
      p_approx_lng:null,
      p_location_permission:'not_requested',
      p_current_path:locationPath(),
      p_user_agent:info.userAgent
    };
  }

  function locationPath(){return `${location.pathname}${location.search}`.slice(0,200)||'/'}

  async function loadProfile(){
    if(!session?.user){profile=null;return null}
    const {data,error}=await client.from('profiles').select('id,display_name,username,verified,role,created_at').eq('id',session.user.id).maybeSingle();
    if(error)console.warn('Account profile unavailable',error.message);
    profile=data||{
      id:session.user.id,
      display_name:session.user.user_metadata?.full_name||session.user.user_metadata?.name||session.user.user_metadata?.display_name||session.user.email?.split('@')[0]||'Member',
      username:null,verified:false,role:'user'
    };
    return profile;
  }

  async function loadAccess(){
    if(!session?.user||!client){access={authenticated:false,is_admin:false,role:'guest',account_status:'guest',is_allowed:false};return access}
    const {data,error}=await client.rpc('current_user_access');
    if(error){
      console.warn('Account access check unavailable',error.message);
      access={authenticated:true,is_admin:false,role:'user',account_status:'access_check_failed',is_allowed:false};
    }else{
      const value=data&&typeof data==='object'?data:{};
      access={
        authenticated:true,
        is_admin:value.is_admin===true,
        role:value.is_admin===true?'admin':'user',
        account_status:clean(value.account_status)||'active',
        is_allowed:value.is_allowed!==false
      };
    }
    if(profile)profile={...profile,role:access.role};
    return access;
  }

  function getDisplayName(){
    const emailLocal=clean(session?.user?.email?.split('@')[0]);
    const profileName=clean(profile?.display_name);
    const metadataName=clean(session?.user?.user_metadata?.full_name)||clean(session?.user?.user_metadata?.name)||clean(session?.user?.user_metadata?.display_name);
    if(profileName&&profileName.toLowerCase()!==emailLocal.toLowerCase())return profileName;
    return metadataName||profileName||emailLocal||'Member';
  }

  function getAvatarUrl(){
    return clean(session?.user?.user_metadata?.avatar_url)||clean(session?.user?.user_metadata?.picture)||'';
  }

  function renderAvatar(target,{size='small',label=getDisplayName()}={}){
    if(!target)return;
    target.replaceChildren();
    target.classList.add('profile-avatar');
    target.classList.toggle('profile-avatar-large',size==='large');
    const url=getAvatarUrl();
    if(url){
      const image=document.createElement('img');
      image.src=url;image.alt='';image.decoding='async';image.loading='eager';image.referrerPolicy='no-referrer';
      image.addEventListener('error',()=>{
        const fallback=document.createElement('span');fallback.className='profile-avatar-fallback';fallback.textContent=(clean(label)[0]||'S').toUpperCase();
        target.replaceChildren(fallback);
      },{once:true});
      target.append(image);
    }else{
      const fallback=document.createElement('span');fallback.className='profile-avatar-fallback';fallback.textContent=(clean(label)[0]||'S').toUpperCase();target.append(fallback);
    }
    target.setAttribute('aria-hidden','true');
  }

  async function refreshProfile(){
    await loadProfile();
    if(profile)profile={...profile,role:access.role};
    updateAccountUI();
    return profile;
  }

  async function refreshAccess(){
    await loadAccess();
    updateAccountUI();
    return access;
  }

  async function recordSessionOnce(){
    if(!session?.user)return;
    const marker=`${session.user.id}:${session.user.last_sign_in_at||session.user.created_at||session.expires_at}`;
    if(localStorage.getItem(SESSION_MARKER_KEY)===marker)return;
    const {error}=await client.rpc('record_user_sign_in',contextPayload());
    if(error){console.warn('Sign-in activity could not be recorded',error.message);return}
    localStorage.setItem(SESSION_MARKER_KEY,marker);
  }

  async function heartbeat(){
    if(!session?.user)return;
    const info=deviceInfo();
    const {error}=await client.rpc('heartbeat_user_presence',{
      p_current_path:locationPath(),
      p_timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||null,
      p_language:navigator.language||null,
      p_device_type:info.device,
      p_browser_name:info.browser,
      p_os_name:info.os
    });
    if(error)console.warn('Presence update skipped',error.message);
  }

  function startHeartbeat(){
    clearInterval(heartbeatTimer);
    if(!session?.user)return;
    heartbeat();
    heartbeatTimer=setInterval(heartbeat,HEARTBEAT_MS);
  }

  function updateAccountUI(){
    const signedIn=Boolean(session?.user);
    const name=getDisplayName();
    document.querySelectorAll('[data-auth-link]').forEach(node=>{
      node.setAttribute('href',signedIn?'/account.html':'/login.html');
      node.classList.toggle('signed-in',signedIn);
      node.classList.toggle('profile-avatar-button',signedIn);
      node.removeAttribute('data-profile-name');
      if(signedIn){
        node.replaceChildren();
        const avatar=document.createElement('span');
        renderAvatar(avatar,{label:name});
        node.append(avatar);
        node.setAttribute('aria-label',`Open ${name}'s account`);
        node.setAttribute('title',name);
        node.dataset.profileName=name;
      }else{
        node.textContent='Sign in';
        node.setAttribute('aria-label','Sign in');
        node.removeAttribute('title');
      }
    });
    document.querySelectorAll('[data-auth-only]').forEach(node=>{node.hidden=!signedIn});
    document.querySelectorAll('[data-guest-only]').forEach(node=>{node.hidden=signedIn});
    document.documentElement.dataset.signedIn=signedIn?'true':'false';
    document.documentElement.dataset.accountStatus=access.account_status||'guest';
    document.dispatchEvent(new CustomEvent('sportyauthchange',{detail:{session,profile,access}}));
  }

  async function signOut(redirect='/login.html?signed_out=1'){
    if(!client)return;
    try{await client.rpc('record_user_sign_out')}catch{}
    localStorage.removeItem(SESSION_MARKER_KEY);
    const {error}=await client.auth.signOut();
    if(error)throw error;
    location.href=safePath(redirect);
  }

  function initializeTheme(){
    const saved=localStorage.getItem('sporty_theme');
    if(saved==='dark'||saved==='light')document.documentElement.dataset.theme=saved;
    const button=document.querySelector('#themeButton');
    if(!button)return;
    button.textContent=document.documentElement.dataset.theme==='dark'?'☾':'☀';
  }

  async function initialize(){
    initializeTheme();
    if(!configured()){
      document.documentElement.dataset.authReady='false';
      readyResolve({client:null,session:null,profile:null,access,configured:false});
      updateAccountUI();
      if(requiresMemberSignIn())redirectToMemberLogin();
      return;
    }
    client=window.supabase.createClient(CONFIG.supabaseUrl,CONFIG.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data}=await client.auth.getSession();
    session=data.session||null;
    if(!session&&requiresMemberSignIn()){
      readyResolve({client,session:null,profile:null,access,configured:true});
      redirectToMemberLogin();
      return;
    }
    if(session){
      await loadProfile();
      await loadAccess();
      if(access.is_allowed===false&&requiresMemberSignIn()){
        try{await client.auth.signOut()}catch{}
        readyResolve({client,session:null,profile:null,access,configured:true});
        redirectToMemberLogin('blocked');
        return;
      }
    }
    unlockMemberPage();
    updateAccountUI();
    if(session&&access.is_allowed!==false){await recordSessionOnce();startHeartbeat()}
    client.auth.onAuthStateChange(async(event,newSession)=>{
      session=newSession||null;
      if(session){await loadProfile();await loadAccess();if(access.is_allowed!==false){await recordSessionOnce();startHeartbeat()}else{clearInterval(heartbeatTimer)}}
      else{
        profile=null;
        access={authenticated:false,is_admin:false,role:'guest',account_status:'guest',is_allowed:false};
        clearInterval(heartbeatTimer);
        localStorage.removeItem(SESSION_MARKER_KEY);
        if(requiresMemberSignIn()){
          redirectToMemberLogin();
          return;
        }
      }
      if(session&&requiresMemberSignIn())unlockMemberPage();
      updateAccountUI();
    });
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')heartbeat()});
    document.documentElement.dataset.authReady='true';
    readyResolve({client,session,profile,access,configured:true});
  }

  window.SportyAuth={
    ready,
    get client(){return client},
    get session(){return session},
    get profile(){return profile},
    get access(){return access},
    isAdmin:()=>access.is_admin===true,
    isAllowed:()=>access.is_allowed!==false,
    refreshAccess,
    refreshProfile,
    getDisplayName,
    getAvatarUrl,
    renderAvatar,
    signOut,
    heartbeat,
    safePath,
    setNext:path=>localStorage.setItem(PENDING_NEXT_KEY,safePath(path)),
    takeNext:()=>{const value=safePath(localStorage.getItem(PENDING_NEXT_KEY)||'/');localStorage.removeItem(PENDING_NEXT_KEY);return value}
  };

  initialize().catch(error=>{
    console.error('Account initialization failed',error);
    readyResolve({client:null,session:null,profile:null,access,configured:false,error});
    if(requiresMemberSignIn())redirectToMemberLogin();
  });
})();
