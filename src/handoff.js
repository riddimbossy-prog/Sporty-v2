(()=>{
  'use strict';
  const DEFAULT_URL='https://www.sportybet.com/gh/m/code-hub/load-code';
  let timer=null;

  function build(){
    let overlay=document.getElementById('sportyHandoff');
    if(overlay)return overlay;
    overlay=document.createElement('div');
    overlay.id='sportyHandoff';
    overlay.className='sporty-handoff';
    overlay.setAttribute('aria-hidden','true');
    overlay.innerHTML=`
      <div class="sporty-handoff-stage" role="status" aria-live="polite">
        <div class="sporty-handoff-orbit" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="sporty-handoff-logo-wrap">
          <img class="sporty-handoff-mark" src="/assets/logo-mark.webp" width="118" height="118" alt="">
          <img class="sporty-handoff-wordmark" src="/assets/logo-wordmark-dark.webp" width="220" height="49" alt="sporty.codes">
        </div>
        <p class="sporty-handoff-kicker">Code copied</p>
        <strong class="sporty-handoff-code" id="sportyHandoffCode">—</strong>
        <p class="sporty-handoff-copy">Opening the official load-code page…</p>
        <div class="sporty-handoff-progress" aria-hidden="true"><span></span></div>
      </div>`;
    document.body.append(overlay);
    return overlay;
  }

  async function copy(code){
    const value=String(code||'').trim();
    if(!value)return false;
    try{await navigator.clipboard.writeText(value);return true}catch{return false}
  }

  async function open(code,url){
    const value=String(code||'').trim();
    const target=String(url||window.SPORTY_CONFIG?.codeHubLoadUrl||DEFAULT_URL);
    const copied=await copy(value);
    const overlay=build();
    const codeNode=overlay.querySelector('#sportyHandoffCode');
    const kicker=overlay.querySelector('.sporty-handoff-kicker');
    if(codeNode)codeNode.textContent=value||'Ready';
    if(kicker)kicker.textContent=copied?'Code copied':'Continue to SportyBet';
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden','false');
    document.body.classList.add('handoff-active');
    clearTimeout(timer);
    timer=setTimeout(()=>window.location.assign(target),1650);
  }

  function close(){
    clearTimeout(timer);
    const overlay=document.getElementById('sportyHandoff');
    overlay?.classList.remove('show');
    overlay?.setAttribute('aria-hidden','true');
    document.body.classList.remove('handoff-active');
  }

  window.SportyHandoff={open,close,copy};
})();
