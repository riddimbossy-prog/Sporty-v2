(()=>{
  'use strict';
  const OFFICIAL_ADMIN_EMAIL='sportycodesofficial@gmail.com';
  const NEXT_KEY='sporty_admin_next_v1';
  const $=selector=>document.querySelector(selector);
  const $$=selector=>Array.from(document.querySelectorAll(selector));
  const safeNext=value=>window.SportyAuth.safePath(value||'/admin-users.html');

  function status(message,tone='neutral'){
    const box=$('#adminAuthStatus');
    if(!box)return;
    box.textContent=message;
    box.dataset.tone=tone;
    box.hidden=!message;
  }

  function busy(value){
    $$('#adminEmailForm button,#adminGoogleSignIn,#adminForgotPassword,#switchAdminAccount,#adminSignOut').forEach(button=>{button.disabled=value});
  }

  function friendly(error){
    const raw=String(error?.message||error||'').toLowerCase();
    if(raw.includes('invalid login credentials'))return 'The administrator email or password is incorrect.';
    if(raw.includes('email not confirmed'))return 'Confirm the administrator email before signing in.';
    if(raw.includes('rate limit'))return 'Too many attempts. Wait a little and try again.';
    if(raw.includes('network')||raw.includes('fetch'))return 'The secure account service could not be reached.';
    return error?.message||'Administrator sign-in could not be completed.';
  }

  function nextPath(){
    const stored=sessionStorage.getItem(NEXT_KEY)||'/admin-users.html';
    sessionStorage.removeItem(NEXT_KEY);
    return safeNext(stored);
  }

  async function renderState({redirectWhenApproved=false}={}){
    const auth=window.SportyAuth;
    await auth.ready;
    if(auth.session?.user)await auth.refreshAccess();
    const signedIn=Boolean(auth.session?.user);
    const approved=signedIn&&auth.isAdmin();
    $('#adminAuthForm').hidden=signedIn;
    $('#adminAccountPanel').hidden=!approved;
    $('#adminDeniedPanel').hidden=!(signedIn&&!approved);
    if(approved){
      $('#adminAccountEmail').textContent=auth.session.user.email||'';
      if(redirectWhenApproved)location.replace(nextPath());
    }
  }

  async function emailSignIn(event){
    event.preventDefault();
    const auth=window.SportyAuth;
    await auth.ready;
    if(!auth.client){status('Administrator access is temporarily unavailable.','error');return}
    const email=$('#adminEmail').value.trim().toLowerCase();
    const password=$('#adminPassword').value;
    if(email!==OFFICIAL_ADMIN_EMAIL){status('This email is not approved for sporty.codes administration.','error');return}
    if(password.length<8){status('Enter the administrator password.','error');return}
    busy(true);
    try{
      const {error}=await auth.client.auth.signInWithPassword({email,password});
      if(error)throw error;
      await auth.refreshAccess();
      if(!auth.isAdmin()){
        await auth.client.auth.signOut();
        throw new Error('This identity is not authorized for administration.');
      }
      status('Official administrator verified. Opening dashboard…','success');
      setTimeout(()=>location.replace(nextPath()),450);
    }catch(error){status(friendly(error),'error');await renderState()}
    finally{busy(false)}
  }

  async function googleSignIn(){
    const auth=window.SportyAuth;
    await auth.ready;
    if(!auth.client){status('Administrator access is temporarily unavailable.','error');return}
    busy(true);
    try{
      const {error}=await auth.client.auth.signInWithOAuth({
        provider:'google',
        options:{redirectTo:`${location.origin}/admin-login.html?oauth=1`,queryParams:{access_type:'offline',prompt:'select_account'}}
      });
      if(error)throw error;
    }catch(error){status(friendly(error),'error');busy(false)}
  }

  async function resetPassword(){
    const auth=window.SportyAuth;
    await auth.ready;
    if(!auth.client){status('Administrator access is temporarily unavailable.','error');return}
    busy(true);
    try{
      const {error}=await auth.client.auth.resetPasswordForEmail(OFFICIAL_ADMIN_EMAIL,{redirectTo:`${location.origin}/login.html?recovery=1&source=admin`});
      if(error)throw error;
      status('A branded password-reset email was sent to the official administrator inbox.','success');
    }catch(error){status(friendly(error),'error')}
    finally{busy(false)}
  }

  function bindPasswordToggle(){
    $$('[data-password-toggle]').forEach(button=>button.addEventListener('click',()=>{
      const input=document.getElementById(button.dataset.passwordToggle);
      if(!input)return;
      const show=input.type==='password';
      input.type=show?'text':'password';
      button.textContent=show?'Hide':'Show';
      button.setAttribute('aria-pressed',show?'true':'false');
    }));
  }

  document.addEventListener('DOMContentLoaded',async()=>{
    const params=new URLSearchParams(location.search);
    sessionStorage.setItem(NEXT_KEY,safeNext(params.get('next')||sessionStorage.getItem(NEXT_KEY)||'/admin-users.html'));
    $('#adminEmailForm')?.addEventListener('submit',emailSignIn);
    $('#adminGoogleSignIn')?.addEventListener('click',googleSignIn);
    $('#adminForgotPassword')?.addEventListener('click',resetPassword);
    $('#switchAdminAccount')?.addEventListener('click',()=>window.SportyAuth.signOut('/admin-login.html'));
    $('#adminSignOut')?.addEventListener('click',()=>window.SportyAuth.signOut('/admin-login.html'));
    bindPasswordToggle();
    await renderState({redirectWhenApproved:params.get('oauth')==='1'});
    document.addEventListener('sportyauthchange',()=>renderState());
  });
})();
