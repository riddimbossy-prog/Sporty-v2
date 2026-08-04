(()=>{
  'use strict';
  const $=selector=>document.querySelector(selector);
  const $$=selector=>Array.from(document.querySelectorAll(selector));
  const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let mode='signin';
  let recoveryMode=false;

  const status=(message,tone='neutral')=>{
    const box=$('#authStatus');
    if(!box)return;
    box.textContent=message;
    box.dataset.tone=tone;
    box.hidden=!message;
  };

  const setBusy=value=>$$('#emailAuthForm button,#googleSignIn,#forgotPassword,#signOutButton,#updatePassword').forEach(button=>{button.disabled=value});

  function friendlyError(error){
    const raw=String(error?.message||error||'').toLowerCase();
    if(raw.includes('invalid login credentials'))return 'The email or password is incorrect.';
    if(raw.includes('email not confirmed'))return 'Confirm your email address before signing in.';
    if(raw.includes('user already registered'))return 'An account already exists for this email. Sign in or reset the password.';
    if(raw.includes('password should be'))return 'Use a stronger password with at least 8 characters.';
    if(raw.includes('rate limit'))return 'Too many attempts were made. Wait a little and try again.';
    if(raw.includes('network')||raw.includes('fetch'))return 'The account service could not be reached. Check your connection and retry.';
    return error?.message||'The account request could not be completed.';
  }

  function setMode(next){
    if(recoveryMode)return;
    mode=next;
    $$('[data-auth-mode]').forEach(button=>button.classList.toggle('active',button.dataset.authMode===mode));
    $('#nameField').hidden=mode!=='signup';
    $('#nameInput').required=mode==='signup';
    $('#emailSubmit').textContent=mode==='signup'?'Create account':'Sign in';
    $('#passwordInput').autocomplete=mode==='signup'?'new-password':'current-password';
    $('#forgotPassword').hidden=mode!=='signin';
    $('#passwordStrengthWrap').hidden=mode!=='signup';
    status('');
  }

  function scorePassword(value){
    let score=0;
    if(value.length>=8)score++;
    if(value.length>=12)score++;
    if(/[a-z]/.test(value)&&/[A-Z]/.test(value))score++;
    if(/\d/.test(value))score++;
    if(/[^A-Za-z0-9]/.test(value))score++;
    return Math.min(score,4);
  }

  function updateStrength(input,bar,label){
    if(!input||!bar||!label)return 0;
    const score=scorePassword(input.value);
    bar.dataset.score=String(score);
    label.textContent=['Very weak','Weak','Fair','Strong','Very strong'][score];
    return score;
  }

  async function emailSubmit(event){
    event.preventDefault();
    const auth=window.SportyAuth;
    await auth.ready;
    const client=auth.client;
    if(!client){status('Sign-in is temporarily unavailable.','error');return}
    const email=$('#emailInput').value.trim().toLowerCase();
    const password=$('#passwordInput').value;
    const name=$('#nameInput').value.trim();
    if(!emailPattern.test(email)){status('Enter a valid email address.','error');return}
    if(password.length<8){status('Password must contain at least 8 characters.','error');return}
    if(mode==='signup'&&scorePassword(password)<2){status('Choose a stronger password using a mix of letters, numbers or symbols.','error');return}
    if(mode==='signup'&&name.length<2){status('Enter your name.','error');return}
    setBusy(true);
    try{
      if(mode==='signup'){
        const {data,error}=await client.auth.signUp({
          email,password,
          options:{
            emailRedirectTo:`${location.origin}/login.html?confirmed=1`,
            data:{display_name:name,username:name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,28)}
          }
        });
        if(error)throw error;
        if(data.session){
          status('Account created. You are signed in.','success');
          setTimeout(()=>{location.href=auth.takeNext()},700);
        }else{
          status('Check your email for the sporty.codes confirmation message.','success');
        }
      }else{
        const {error}=await client.auth.signInWithPassword({email,password});
        if(error)throw error;
        status('Signed in successfully.','success');
        setTimeout(()=>{location.href=auth.takeNext()},500);
      }
    }catch(error){status(friendlyError(error),'error')}
    finally{setBusy(false)}
  }

  async function googleSignIn(){
    const auth=window.SportyAuth;
    await auth.ready;
    if(!auth.client){status('Sign-in is temporarily unavailable.','error');return}
    setBusy(true);
    try{
      const {error}=await auth.client.auth.signInWithOAuth({
        provider:'google',
        options:{redirectTo:`${location.origin}/login.html?google=1`,queryParams:{access_type:'offline',prompt:'select_account'}}
      });
      if(error)throw error;
    }catch(error){status(friendlyError(error),'error');setBusy(false)}
  }

  async function forgotPassword(){
    const auth=window.SportyAuth;
    await auth.ready;
    const email=$('#emailInput').value.trim().toLowerCase();
    if(!emailPattern.test(email)){status('Enter your email address above first.','error');return}
    setBusy(true);
    try{
      const {error}=await auth.client.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}/login.html?recovery=1`});
      if(error)throw error;
      status('Password-reset email sent. Check your inbox and spam folder.','success');
    }catch(error){status(friendlyError(error),'error')}
    finally{setBusy(false)}
  }

  function showRecovery(message='Choose a secure new password for your account.'){
    recoveryMode=true;
    $('#authForms').hidden=true;
    $('#accountPanel').hidden=true;
    $('#recoveryPanel').hidden=false;
    $('#recoveryMessage').textContent=message;
    document.title='Create a new password — sporty.codes';
    $('#newPassword')?.focus();
  }

  async function showAccount(){
    const auth=window.SportyAuth;
    await auth.ready;
    if(recoveryMode)return;
    const signedIn=Boolean(auth.session?.user);
    $('#authForms').hidden=signedIn;
    $('#accountPanel').hidden=!signedIn;
    $('#recoveryPanel').hidden=true;
    if(!signedIn)return;
    const name=auth.getDisplayName?.()||'Member';
    $('#accountName').textContent=name;
    auth.renderAvatar?.($('#loginAccountAvatar'),{size:'large',label:name});
    $('#accountEmail').textContent=auth.session.user.email||'';
    $('#accountProvider').textContent=(auth.session.user.app_metadata?.provider||'email').replace(/^./,char=>char.toUpperCase());
  }

  async function updatePassword(){
    const auth=window.SportyAuth;
    await auth.ready;
    if(!auth.client||!auth.session?.user){status('The recovery session is missing or expired. Request a new reset email.','error');return}
    const value=$('#newPassword').value;
    const confirm=$('#confirmPassword').value;
    if(value.length<8){status('New password must contain at least 8 characters.','error');return}
    if(scorePassword(value)<2){status('Use a stronger password with mixed letters, numbers or symbols.','error');return}
    if(value!==confirm){status('The two passwords do not match.','error');return}
    setBusy(true);
    try{
      const {error}=await auth.client.auth.updateUser({password:value});
      if(error)throw error;
      try{await auth.client.auth.signOut({scope:'others'})}catch{}
      recoveryMode=false;
      $('#recoveryPanel').hidden=true;
      $('#accountPanel').hidden=false;
      status('Password changed successfully.','success');
      history.replaceState({},'',location.pathname+'?password=changed');
      await showAccount();
    }catch(error){status(friendlyError(error),'error')}
    finally{setBusy(false)}
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
    const next=params.get('next');
    if(next)window.SportyAuth.setNext(next);
    $$('[data-auth-mode]').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.authMode)));
    $('#emailAuthForm')?.addEventListener('submit',emailSubmit);
    $('#googleSignIn')?.addEventListener('click',googleSignIn);
    $('#forgotPassword')?.addEventListener('click',forgotPassword);
    $('#signOutButton')?.addEventListener('click',()=>window.SportyAuth.signOut());
    $('#updatePassword')?.addEventListener('click',updatePassword);
    bindPasswordToggle();
    $('#passwordInput')?.addEventListener('input',()=>updateStrength($('#passwordInput'),$('#passwordStrength'),$('#passwordStrengthLabel')));
    $('#newPassword')?.addEventListener('input',()=>updateStrength($('#newPassword'),$('#recoveryStrength'),$('#recoveryStrengthLabel')));

    await window.SportyAuth.ready;
    const hash=new URLSearchParams(location.hash.replace(/^#/,''));
    const hintedRecovery=params.get('recovery')==='1'||params.get('type')==='recovery'||hash.get('type')==='recovery';
    if(hintedRecovery&&window.SportyAuth.session?.user)showRecovery();
    else if(hintedRecovery)status('The recovery link is still being verified. If this does not change, request a new reset email.','neutral');
    if(params.get('confirmed')==='1')status('Email confirmed. You can now sign in.','success');
    if(params.get('password')==='changed')status('Your password was changed successfully.','success');
    await showAccount();

    window.SportyAuth.client?.auth.onAuthStateChange((event,newSession)=>{
      if(event==='PASSWORD_RECOVERY'&&newSession?.user)showRecovery();
    });
    document.addEventListener('sportyauthchange',showAccount);
  });
})();
