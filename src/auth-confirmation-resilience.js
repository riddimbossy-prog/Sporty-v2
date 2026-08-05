(()=>{
  'use strict';

  const PENDING_KEY='sporty_pending_confirmation_email_v1';
  const $=selector=>document.querySelector(selector);
  const clean=value=>String(value??'').trim();

  function rememberEmail(value){
    const email=clean(value).toLowerCase();
    if(!email)return'';
    try{sessionStorage.setItem(PENDING_KEY,email)}catch{}
    return email;
  }

  function pendingEmail(){
    const input=clean($('#emailInput')?.value).toLowerCase();
    if(input)return input;
    try{return clean(sessionStorage.getItem(PENDING_KEY)).toLowerCase()}catch{return''}
  }

  function errorDetails(error){
    const source=error&&typeof error==='object'?error:{};
    const message=clean(source.message||source.error_description||source.msg||source.error||error);
    const code=clean(source.code||source.error_code||source.name);
    const status=Number(source.status||source.statusCode||0)||null;
    return {message,code,status,raw:`${message} ${code}`.toLowerCase()};
  }

  function classify(error){
    const detail=errorDetails(error);
    const raw=detail.raw;
    if(raw.includes('already registered')||raw.includes('user_already_exists')||raw.includes('already exists'))return 'exists';
    if(raw.includes('over_email_send_rate_limit')||raw.includes('email rate')||raw.includes('rate limit'))return 'rate';
    if(raw.includes('smtp')||raw.includes('confirmation email')||raw.includes('sending email')||raw.includes('email delivery')||raw.includes('mailer'))return 'delivery';
    if(raw.includes('database error')||raw.includes('saving new user')||raw.includes('unexpected_failure'))return 'database';
    if(raw.includes('captcha'))return 'captcha';
    return 'unknown';
  }

  function messageFor(error){
    const detail=errorDetails(error);
    switch(classify(error)){
      case'exists':return'An account already exists for this email. Sign in or reset the password.';
      case'rate':return'Your account may already exist, but confirmation email sending is temporarily rate-limited. Use Resend confirmation later, or sign in if email confirmation is disabled.';
      case'delivery':return'Your account may already exist, but the confirmation email service could not send the message. Use Resend confirmation after email delivery is restored.';
      case'database':return'The authentication account was not completed because the profile database rejected the signup. Run the latest auth repair migration and retry.';
      case'captcha':return'The signup security check failed. Refresh the page and try again.';
      default:{
        const suffix=[detail.code,detail.status?`HTTP ${detail.status}`:''].filter(Boolean).join(' · ');
        return detail.message?`${detail.message}${suffix?` (${suffix})`:''}`:'The account request could not be completed. Try again or use Sign in.';
      }
    }
  }

  function setStatus(message,tone='neutral'){
    const box=$('#authStatus');
    if(!box)return;
    box.textContent=message;
    box.dataset.tone=tone;
    box.hidden=!message;
  }

  function ensureActions(){
    let wrap=$('#confirmationRecoveryActions');
    if(wrap)return wrap;
    const status=$('#authStatus');
    if(!status)return null;
    wrap=document.createElement('div');
    wrap.id='confirmationRecoveryActions';
    wrap.hidden=true;
    wrap.style.cssText='display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:12px auto 0;max-width:488px';
    wrap.innerHTML='<button class="button secondary compact" id="resendConfirmation" type="button">Resend confirmation</button><button class="text-button" id="confirmationSignIn" type="button">Sign in instead</button>';
    status.insertAdjacentElement('afterend',wrap);
    return wrap;
  }

  function showActions({resend=true,signin=true}={}){
    const wrap=ensureActions();
    if(!wrap)return;
    wrap.hidden=false;
    const resendButton=$('#resendConfirmation');
    const signinButton=$('#confirmationSignIn');
    if(resendButton)resendButton.hidden=!resend;
    if(signinButton)signinButton.hidden=!signin;
  }

  function hideActions(){
    const wrap=$('#confirmationRecoveryActions');
    if(wrap)wrap.hidden=true;
  }

  async function resendConfirmation(){
    const email=rememberEmail(pendingEmail());
    if(!email){setStatus('Enter the email address used for signup first.','error');return}
    const auth=window.SportyAuth;
    await auth?.ready;
    if(!auth?.client){setStatus('The account service is temporarily unavailable.','error');return}
    const button=$('#resendConfirmation');
    if(button){button.disabled=true;button.textContent='Sending…'}
    try{
      const {error}=await auth.client.auth.resend({
        type:'signup',
        email,
        options:{emailRedirectTo:`${location.origin}/login.html?confirmed=1`}
      });
      if(error)throw error;
      setStatus('Confirmation email sent. Check your inbox and spam folder.','success');
      showActions({resend:true,signin:true});
    }catch(error){
      window.__sportyLastConfirmationError=errorDetails(error);
      setStatus(messageFor(error),'error');
      showActions({resend:true,signin:true});
    }finally{
      if(button){button.disabled=false;button.textContent='Resend confirmation'}
    }
  }

  function switchToSignIn(){
    const tab=document.querySelector('[data-auth-mode="signin"]');
    tab?.click();
    setTimeout(()=>$('#passwordInput')?.focus(),0);
    hideActions();
  }

  function observeStatus(){
    const box=$('#authStatus');
    if(!box)return;
    const apply=()=>{
      const text=clean(box.textContent);
      const lower=text.toLowerCase();
      if(!text){hideActions();return}
      if(text==='{}'||text==='[object Object]'){
        const error=window.__sportyLastSignupError||{};
        setStatus(messageFor(error),'error');
        showActions({resend:true,signin:true});
        return;
      }
      if(lower.includes('check your email')||lower.includes('confirmation email')){
        rememberEmail(pendingEmail());
        showActions({resend:true,signin:true});
      }else if(lower.includes('already exists')||lower.includes('already registered')){
        rememberEmail(pendingEmail());
        showActions({resend:true,signin:true});
      }
    };
    new MutationObserver(apply).observe(box,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['hidden','data-tone']});
    apply();
  }

  async function instrumentSignup(){
    const auth=window.SportyAuth;
    await auth?.ready;
    const client=auth?.client;
    if(!client?.auth?.signUp||client.auth.signUp.__sportyWrapped)return;
    const original=client.auth.signUp.bind(client.auth);
    const wrapped=async(...args)=>{
      rememberEmail(args?.[0]?.email||pendingEmail());
      const result=await original(...args);
      if(result?.error){
        window.__sportyLastSignupError=errorDetails(result.error);
        try{sessionStorage.setItem('sporty_last_signup_error_v1',JSON.stringify(window.__sportyLastSignupError))}catch{}
      }else{
        window.__sportyLastSignupError=null;
      }
      return result;
    };
    wrapped.__sportyWrapped=true;
    client.auth.signUp=wrapped;
  }

  document.addEventListener('DOMContentLoaded',()=>{
    ensureActions();
    observeStatus();
    $('#resendConfirmation')?.addEventListener('click',resendConfirmation);
    $('#confirmationSignIn')?.addEventListener('click',switchToSignIn);
    $('#emailInput')?.addEventListener('input',event=>rememberEmail(event.target.value));
    const params=new URLSearchParams(location.search);
    if(params.get('confirmed')==='1'){
      try{sessionStorage.removeItem(PENDING_KEY)}catch{}
      hideActions();
    }
    instrumentSignup().catch(()=>{});
  });
})();
