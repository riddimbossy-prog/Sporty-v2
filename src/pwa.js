
(()=>{
  'use strict';
  const RELEASE='21.7.3-p5';
  const MOBILE_NAV_RELEASE='21.7.3-p5';

  if(!document.querySelector('link[data-mobile-nav-polish]')){
    const mobileNavStyle=document.createElement('link');
    mobileNavStyle.rel='stylesheet';
    mobileNavStyle.href=`/mobile-nav.css?v=${MOBILE_NAV_RELEASE}`;
    mobileNavStyle.dataset.mobileNavPolish='true';
    document.head.append(mobileNavStyle);
  }

  const isStandalone=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  let deferredPrompt=null;
  const install=document.createElement('aside');
  install.className='pwa-install'; install.id='pwaInstallPrompt';
  install.innerHTML='<img class="pwa-install-icon" src="/icons/icon-192.png" alt=""><div class="pwa-install-copy"><strong>Install sporty.codes</strong><span>Fast access, app-style navigation and a branded launch screen.</span></div><div class="pwa-install-actions"><button class="pwa-install-button" type="button">Install app</button><button class="pwa-dismiss" type="button" aria-label="Dismiss install prompt">×</button></div>';
  const ios=document.createElement('div'); ios.className='pwa-ios-sheet'; ios.setAttribute('aria-hidden','true');
  ios.innerHTML='<section class="pwa-ios-card" role="dialog" aria-modal="true" aria-labelledby="pwaIosTitle"><img src="/icons/icon-96.png" width="56" height="56" alt=""><h2 id="pwaIosTitle">Add sporty.codes to your Home Screen</h2><p>Install it like an app on your iPhone or iPad.</p><div class="pwa-ios-steps"><div class="pwa-ios-step"><b>1</b><span>Tap the <strong>Share</strong> button in Safari.</span></div><div class="pwa-ios-step"><b>2</b><span>Choose <strong>Add to Home Screen</strong>.</span></div><div class="pwa-ios-step"><b>3</b><span>Tap <strong>Add</strong> to finish.</span></div></div><button class="pwa-ios-close" type="button">Got it</button></section>';
  const update=document.createElement('div'); update.className='pwa-update'; update.innerHTML='<span>A new version is ready.</span><button type="button">Update</button>';
  document.body.append(install,ios,update);
  const dismissed=Number(localStorage.getItem('sporty_pwa_dismissed')||0);
  const canShow=()=>!isStandalone && Date.now()-dismissed>3*24*60*60*1000;
  const showInstall=()=>{if(canShow())install.classList.add('show')};
  install.querySelector('.pwa-dismiss').addEventListener('click',()=>{install.classList.remove('show');localStorage.setItem('sporty_pwa_dismissed',String(Date.now()))});
  install.querySelector('.pwa-install-button').addEventListener('click',async()=>{
    if(deferredPrompt){deferredPrompt.prompt();const result=await deferredPrompt.userChoice.catch(()=>null);deferredPrompt=null;install.classList.remove('show');if(result?.outcome==='accepted')localStorage.removeItem('sporty_pwa_dismissed');return;}
    if(isIOS){ios.classList.add('show');ios.setAttribute('aria-hidden','false');return;}
    location.href='/install.html';
  });
  ios.querySelector('.pwa-ios-close').addEventListener('click',()=>{ios.classList.remove('show');ios.setAttribute('aria-hidden','true')});
  ios.addEventListener('click',e=>{if(e.target===ios)ios.querySelector('.pwa-ios-close').click()});
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;setTimeout(showInstall,1400)});
  window.addEventListener('appinstalled',()=>{install.classList.remove('show');deferredPrompt=null;localStorage.setItem('sporty_pwa_installed','1')});
  if(isIOS&&canShow())setTimeout(showInstall,2600);
  if('serviceWorker' in navigator){
    window.addEventListener('load',async()=>{
      try{
        const registration=await navigator.serviceWorker.register('/service-worker.js?v='+RELEASE,{scope:'/'});
        const updateKey='sporty_sw_update_checked_v209';
        const lastUpdate=Number(localStorage.getItem(updateKey)||0);
        if(Date.now()-lastUpdate>6*60*60*1000){localStorage.setItem(updateKey,String(Date.now()));registration.update().catch(()=>{})}
        if(registration.waiting)update.classList.add('show');
        registration.addEventListener('updatefound',()=>{const worker=registration.installing;if(!worker)return;worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)update.classList.add('show')})});
        update.querySelector('button').addEventListener('click',()=>{registration.waiting?.postMessage({type:'SKIP_WAITING'})});
        navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload());
      }catch(error){console.warn('PWA registration unavailable',error)}
    });
  }

  if(document.body?.dataset.page==='login'&&!document.querySelector('script[data-confirmation-recovery]')){
    const recovery=document.createElement('script');
    recovery.src='/src/auth-confirmation-resilience.js?v=21.7.3-p4';
    recovery.defer=true;
    recovery.dataset.confirmationRecovery='true';
    document.head.append(recovery);
  }
})();
