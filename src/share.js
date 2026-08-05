(()=>{
  'use strict';

  const SITE_URL='https://sporty.codes';
  const LOGO_URL='/assets/logo-wordmark-dark.png';
  let logoPromise=null;
  let activeSession=null;
  let modal=null;

  const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
  const num=value=>{const n=Number(String(value??'').replace(/,/g,''));return Number.isFinite(n)?n:0};
  const safeName=value=>clean(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'sporty-codes-share';
  const isCoarsePointer=()=>matchMedia?.('(pointer:coarse)')?.matches===true;
  const isIOSLike=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const currentShareUrl=()=>{
    const canonical=document.querySelector('link[rel="canonical"]')?.href;
    return canonical||location.href.split('#')[0];
  };

  const icons={
    share:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>',
    download:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/></svg>',
    caption:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 10h16M4 15h10M4 20h7"/></svg>',
    link:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1"/></svg>',
    close:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };
  const icon=name=>icons[name]||'';

  function toast(message){
    const node=document.getElementById('toast');
    if(!node)return;
    node.textContent=message;
    node.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer=setTimeout(()=>node.classList.remove('show'),2800);
  }

  function loadLogo(){
    if(logoPromise)return logoPromise;
    logoPromise=new Promise(resolve=>{
      const image=new Image();
      image.decoding='async';
      image.onload=()=>resolve(image);
      image.onerror=()=>resolve(null);
      image.src=LOGO_URL;
    });
    return logoPromise;
  }

  function roundedRect(ctx,x,y,w,h,r){
    const radius=Math.min(r,w/2,h/2);
    ctx.beginPath();
    ctx.moveTo(x+radius,y);
    ctx.arcTo(x+w,y,x+w,y+h,radius);
    ctx.arcTo(x+w,y+h,x,y+h,radius);
    ctx.arcTo(x,y+h,x,y,radius);
    ctx.arcTo(x,y,x+w,y,radius);
    ctx.closePath();
  }

  function fillRounded(ctx,x,y,w,h,r,fill,stroke=null,lineWidth=1){
    roundedRect(ctx,x,y,w,h,r);
    ctx.fillStyle=fill;
    ctx.fill();
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke()}
  }

  function fitText(ctx,text,maxWidth,startSize,minSize=24,weight=800){
    let size=startSize;
    while(size>minSize){
      ctx.font=`${weight} ${size}px Arial, Helvetica, sans-serif`;
      if(ctx.measureText(text).width<=maxWidth)break;
      size-=2;
    }
    return size;
  }

  function ellipsizeText(ctx,value,maxWidth){
    const source=clean(value);
    if(ctx.measureText(source).width<=maxWidth)return source;
    let low=0,high=source.length,best='';
    while(low<=high){
      const mid=Math.floor((low+high)/2);const candidate=`${source.slice(0,mid).trimEnd()}…`;
      if(ctx.measureText(candidate).width<=maxWidth){best=candidate;low=mid+1}else high=mid-1;
    }
    return best||'…';
  }

  function isAtomicShareItem(item={}){
    if(window.SportyMVP?.isAtomicTip)return window.SportyMVP.isAtomicTip(item);
    const fixture=clean(item.fixture),market=clean(item.market),pick=clean(item.pick);
    if(!fixture||!market||!pick||fixture.length>180||market.length>90||pick.length>120)return false;
    if((fixture.match(/\b(?:vs?|versus)\b|\s[-–—]\s/gi)||[]).length>1)return false;
    if((fixture.match(/\b(?:over\/under|double chance|draw no bet|match winner|both teams to score|team total|1x2)\b/gi)||[]).length>1)return false;
    return true;
  }

  function wrapText(ctx,text,x,y,maxWidth,lineHeight,maxLines=4){
    const words=clean(text).split(' ').filter(Boolean);
    const lines=[];
    let line='';
    for(const word of words){
      const test=line?`${line} ${word}`:word;
      if(ctx.measureText(test).width>maxWidth&&line){
        lines.push(line);
        line=word;
        if(lines.length===maxLines-1)break;
      }else line=test;
    }
    if(line&&lines.length<maxLines)lines.push(line);
    const consumed=lines.join(' ').split(' ').length;
    if(consumed<words.length&&lines.length){
      let last=lines[lines.length-1];
      while(ctx.measureText(`${last}…`).width>maxWidth&&last.includes(' '))last=last.split(' ').slice(0,-1).join(' ');
      lines[lines.length-1]=`${last}…`;
    }
    lines.forEach((value,index)=>ctx.fillText(value,x,y+(index*lineHeight)));
    return y+(lines.length*lineHeight);
  }

  function drawBackdrop(ctx,w,h){
    const base=ctx.createLinearGradient(0,0,w,h);
    base.addColorStop(0,'#08090d');
    base.addColorStop(.58,'#10131a');
    base.addColorStop(1,'#220b12');
    ctx.fillStyle=base;
    ctx.fillRect(0,0,w,h);

    const glow=ctx.createRadialGradient(w*.9,h*.08,10,w*.9,h*.08,w*.62);
    glow.addColorStop(0,'rgba(255,54,74,.46)');
    glow.addColorStop(.38,'rgba(255,54,74,.12)');
    glow.addColorStop(1,'rgba(255,54,74,0)');
    ctx.fillStyle=glow;
    ctx.fillRect(0,0,w,h);

    ctx.save();
    ctx.translate(w*.84,h*.19);
    ctx.rotate(-.34);
    for(let i=-2;i<5;i++)fillRounded(ctx,i*94,-300,48,1040,28,'rgba(255,55,74,.10)');
    ctx.restore();

    ctx.strokeStyle='rgba(255,255,255,.07)';
    ctx.lineWidth=2;
    roundedRect(ctx,42,42,w-84,h-84,34);
    ctx.stroke();
  }

  async function drawBrand(ctx){
    const logo=await loadLogo();
    if(logo){
      const targetW=350;
      const targetH=targetW*(logo.naturalHeight/logo.naturalWidth);
      ctx.drawImage(logo,74,72,targetW,targetH);
      return;
    }
    ctx.font='900 46px Arial, Helvetica, sans-serif';
    ctx.fillStyle='#ff3847';
    ctx.fillText('sporty',74,118);
    ctx.fillStyle='#ffffff';
    ctx.fillText('.codes',220,118);
  }

  function drawBadge(ctx,text,x,y){
    ctx.font='900 26px Arial, Helvetica, sans-serif';
    const width=ctx.measureText(text).width+44;
    fillRounded(ctx,x,y,width,52,26,'rgba(255,56,71,.15)','rgba(255,85,99,.42)',2);
    ctx.fillStyle='#ff6673';
    ctx.fillText(text,x+22,y+35);
    return width;
  }

  function drawMetric(ctx,x,y,w,label,value){
    fillRounded(ctx,x,y,w,116,22,'rgba(255,255,255,.055)','rgba(255,255,255,.11)',2);
    ctx.fillStyle='rgba(255,255,255,.58)';
    ctx.font='800 21px Arial, Helvetica, sans-serif';
    ctx.fillText(label.toUpperCase(),x+24,y+36);
    ctx.fillStyle='#ffffff';
    ctx.font='900 34px Arial, Helvetica, sans-serif';
    ctx.fillText(clean(value)||'—',x+24,y+82);
  }

  function drawFooter(ctx,w,h){
    fillRounded(ctx,66,h-208,w-132,126,28,'rgba(255,56,71,.12)','rgba(255,72,88,.36)',2);
    ctx.fillStyle='#ffffff';
    ctx.font='900 34px Arial, Helvetica, sans-serif';
    ctx.fillText('I found this free on sporty.codes',96,h-150);
    ctx.fillStyle='rgba(255,255,255,.66)';
    ctx.font='700 22px Arial, Helvetica, sans-serif';
    ctx.fillText('Prediction planning • No real-money stake is processed',96,h-112);
  }

  async function renderCodeCard(payload={}){
    const canvas=document.createElement('canvas');
    canvas.width=1080;canvas.height=1350;
    const ctx=canvas.getContext('2d');
    drawBackdrop(ctx,canvas.width,canvas.height);
    await drawBrand(ctx);
    drawBadge(ctx,'FREE SPORTYBET CODE',74,174);

    ctx.fillStyle='#ffffff';
    ctx.font='900 66px Arial, Helvetica, sans-serif';
    let y=292;
    y=wrapText(ctx,clean(payload.title)||'Free public code',74,y,930,76,3)+22;

    fillRounded(ctx,66,y,948,236,32,'rgba(4,5,8,.72)','rgba(255,255,255,.11)',2);
    ctx.fillStyle='rgba(255,255,255,.58)';
    ctx.font='800 24px Arial, Helvetica, sans-serif';
    ctx.fillText('BOOKING CODE',98,y+55);
    const code=clean(payload.code)||'CODE';
    const size=fitText(ctx,code,880,96,44,950);
    ctx.font=`950 ${size}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle='#ffffff';
    ctx.fillText(code,98,y+150);
    ctx.fillStyle='#ff4252';
    ctx.fillRect(98,y+174,310,8);

    const metricsY=y+278;
    const gap=18;
    const boxW=(948-gap)/2;
    drawMetric(ctx,66,metricsY,boxW,'Total odds',num(payload.odds)>0?num(payload.odds).toFixed(2):'Check app');
    drawMetric(ctx,66+boxW+gap,metricsY,boxW,'Selections',num(payload.selections)>0?Math.floor(num(payload.selections)):'Check app');
    drawMetric(ctx,66,metricsY+134,boxW,'Category',clean(payload.category)||'Public code');
    drawMetric(ctx,66+boxW+gap,metricsY+134,boxW,'Availability',clean(payload.day)||'Current feed');

    ctx.fillStyle='rgba(255,255,255,.67)';
    ctx.font='700 24px Arial, Helvetica, sans-serif';
    wrapText(ctx,'Open sporty.codes to copy the code, review the slip and continue to the official load-code page.',74,metricsY+326,920,34,3);
    drawFooter(ctx,canvas.width,canvas.height);
    return canvas;
  }

  async function renderTipCard(payload={}){
    const canvas=document.createElement('canvas');
    canvas.width=1080;canvas.height=1350;
    const ctx=canvas.getContext('2d');
    drawBackdrop(ctx,canvas.width,canvas.height);
    await drawBrand(ctx);
    drawBadge(ctx,'FREE TIP SNAPSHOT',74,174);

    ctx.fillStyle='#ffffff';
    ctx.font='900 62px Arial, Helvetica, sans-serif';
    let y=292;
    y=wrapText(ctx,clean(payload.fixture)||'Match tip',74,y,930,72,3)+22;

    fillRounded(ctx,66,y,948,254,32,'rgba(4,5,8,.72)','rgba(255,255,255,.11)',2);
    ctx.fillStyle='rgba(255,255,255,.58)';
    ctx.font='800 23px Arial, Helvetica, sans-serif';
    ctx.fillText('MARKET & DIRECTION',98,y+54);
    ctx.fillStyle='#ffffff';
    ctx.font='900 38px Arial, Helvetica, sans-serif';
    wrapText(ctx,`${clean(payload.market)||'Market'}: ${clean(payload.pick)||'Selection'}`,98,y+105,860,48,3);

    const metricsY=y+296;
    const gap=18;
    const boxW=(948-gap)/2;
    drawMetric(ctx,66,metricsY,boxW,'Board label',clean(payload.tier)||'Review');
    drawMetric(ctx,66+boxW+gap,metricsY,boxW,'Tip Strength',num(payload.score)>0?`${Math.round(num(payload.score))}/100`:'—');
    drawMetric(ctx,66,metricsY+134,boxW,'Average odds',num(payload.odds)>0?num(payload.odds).toFixed(2):'—');
    drawMetric(ctx,66+boxW+gap,metricsY+134,boxW,'Day',clean(payload.day)||'See site');

    ctx.fillStyle='rgba(255,255,255,.67)';
    ctx.font='700 24px Arial, Helvetica, sans-serif';
    wrapText(ctx,'Tip Strength is a ranking score, not a win probability. Review the full card on sporty.codes.',74,metricsY+326,920,34,3);
    drawFooter(ctx,canvas.width,canvas.height);
    return canvas;
  }

  async function renderSlipCard(payload={}){
    const canvas=document.createElement('canvas');
    canvas.width=1080;canvas.height=1350;
    const ctx=canvas.getContext('2d');
    drawBackdrop(ctx,canvas.width,canvas.height);
    await drawBrand(ctx);
    drawBadge(ctx,'MY PREDICTION SLIP',74,174);

    ctx.fillStyle='#ffffff';
    ctx.font='900 60px Arial, Helvetica, sans-serif';
    let y=286;
    y=wrapText(ctx,clean(payload.title)||'My sporty.codes prediction slip',74,y,930,70,2)+18;

    const allItems=(Array.isArray(payload.items)?payload.items:[]).filter(isAtomicShareItem);
    const items=allItems.slice(0,4);
    const rowH=92;
    const listY=y;
    const listH=Math.max(170,items.length*rowH+34+(allItems.length>4?42:0));
    fillRounded(ctx,66,listY,948,listH,30,'rgba(4,5,8,.72)','rgba(255,255,255,.11)',2);
    let rowY=listY+28;
    items.forEach((item,index)=>{
      if(index>0){ctx.strokeStyle='rgba(255,255,255,.09)';ctx.beginPath();ctx.moveTo(94,rowY-12);ctx.lineTo(986,rowY-12);ctx.stroke()}
      ctx.fillStyle='#ff5b68';ctx.font='900 24px Arial, Helvetica, sans-serif';ctx.fillText(String(index+1).padStart(2,'0'),94,rowY+22);
      ctx.fillStyle='#ffffff';ctx.font='900 27px Arial, Helvetica, sans-serif';
      const fixture=clean(item.fixture)||'Match';
      const size=fitText(ctx,fixture,650,27,20,900);ctx.font=`900 ${size}px Arial, Helvetica, sans-serif`;ctx.fillText(ellipsizeText(ctx,fixture,650),148,rowY+20);
      ctx.fillStyle='rgba(255,255,255,.62)';ctx.font='700 21px Arial, Helvetica, sans-serif';
      const direction=`${clean(item.market)||'Market'}: ${clean(item.pick)||'Selection'}`;
      ctx.fillText(ellipsizeText(ctx,direction,650),148,rowY+54);
      ctx.fillStyle='#ffffff';ctx.font='900 27px Arial, Helvetica, sans-serif';ctx.textAlign='right';ctx.fillText(num(item.odds)>1?num(item.odds).toFixed(2):'—',970,rowY+33);ctx.textAlign='left';
      ctx.fillStyle='rgba(255,255,255,.48)';ctx.font='700 18px Arial, Helvetica, sans-serif';ctx.fillText(clean(item.day)||clean(payload.day)||'See site',148,rowY+82);
      rowY+=rowH;
    });
    if(allItems.length>4){ctx.fillStyle='rgba(255,255,255,.62)';ctx.font='800 20px Arial, Helvetica, sans-serif';ctx.fillText(`+ ${allItems.length-4} more selections on sporty.codes`,94,listY+listH-20)}

    const metricsY=listY+listH+26;
    const gap=18,boxW=(948-gap)/2;
    const combined=allItems.reduce((total,item)=>{const odds=num(item.odds);return total*(odds>1&&odds<=1000?odds:1)},1);
    const practice=num(payload.practicePoints);
    drawMetric(ctx,66,metricsY,boxW,'Combined odds',allItems.length?combined.toFixed(2):'—');
    drawMetric(ctx,66+boxW+gap,metricsY,boxW,'Selections',String(allItems.length));
    drawMetric(ctx,66,metricsY+134,boxW,'Practice points',practice.toFixed(2));
    drawMetric(ctx,66+boxW+gap,metricsY+134,boxW,'Projected points',(practice*combined).toFixed(2));

    ctx.fillStyle='rgba(255,255,255,.65)';ctx.font='700 22px Arial, Helvetica, sans-serif';
    wrapText(ctx,'Prediction planning only. No deposit, wallet, payment or real-money wager is processed by sporty.codes.',74,metricsY+300,920,32,3);
    drawFooter(ctx,canvas.width,canvas.height);
    return canvas;
  }

  function canvasBlob(canvas){
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Image export failed')),'image/png',.95));
  }

  async function copyText(text){
    try{
      if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return true}
    }catch{}
    const area=document.createElement('textarea');
    area.value=text;
    area.setAttribute('readonly','');
    area.style.cssText='position:fixed;left:-9999px;top:0;opacity:0';
    document.body.append(area);
    area.select();
    let copied=false;
    try{copied=document.execCommand('copy')}catch{}
    area.remove();
    return copied;
  }

  function downloadBlob(blob,name){
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;
    link.download=name;
    link.rel='noopener';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),8000);
  }

  function canNativeShare(){return typeof navigator.share==='function'}
  function canNativeShareFile(file){
    if(!canNativeShare()||!file||typeof navigator.canShare!=='function')return false;
    try{return navigator.canShare({files:[file]})===true}catch{return false}
  }

  function getCaption(payload,type,url){
    if(type==='slip')return `My sporty.codes prediction slip — ${Array.isArray(payload.items)?payload.items.length:0} selections\nPrediction planning only\n${url}`;
    return type==='tip'
      ?`${clean(payload.fixture)} — ${clean(payload.market)}: ${clean(payload.pick)}\nFound free on sporty.codes\n${url}`
      :`Free SportyBet code: ${clean(payload.code)}\nFound free on sporty.codes\n${url}`;
  }

  function ensureModal(){
    if(modal)return modal;
    const shell=document.createElement('div');
    shell.className='share-dialog-shell';
    shell.hidden=true;
    shell.innerHTML=`
      <div class="share-dialog-backdrop" data-share-close></div>
      <section class="share-dialog" role="dialog" aria-modal="true" aria-labelledby="shareDialogTitle">
        <button class="share-dialog-close" type="button" aria-label="Close sharing options" data-share-close>${icon('close')}</button>
        <div class="share-dialog-head">
          <div class="eyebrow">Share from sporty.codes</div>
          <h2 id="shareDialogTitle">Ready to share</h2>
          <p>Your branded image keeps the prediction clear and credits sporty.codes.</p>
        </div>
        <div class="share-dialog-body">
          <div class="share-dialog-preview-wrap">
            <div class="share-dialog-loader" aria-live="polite">
              <span class="share-spinner" aria-hidden="true"></span>
              <strong>Creating your branded image…</strong>
            </div>
            <img class="share-dialog-preview" alt="sporty.codes branded share card preview" hidden>
          </div>
          <aside class="share-dialog-controls" aria-label="Sharing options">
            <div class="share-dialog-ready">
              <span class="share-ready-dot" aria-hidden="true"></span>
              <span>Choose an action below</span>
            </div>
            <div class="share-dialog-actions">
              <button class="button primary share-native-action" type="button" disabled>
                ${icon('share')}<span>Share image</span>
              </button>
              <button class="button secondary share-save-action" type="button" disabled>
                ${icon('download')}<span>Save image</span>
              </button>
              <button class="button secondary share-copy-caption" type="button">
                ${icon('caption')}<span>Copy caption</span>
              </button>
              <button class="button secondary share-copy-link" type="button">
                ${icon('link')}<span>Copy link</span>
              </button>
            </div>
            <p class="share-dialog-note">On mobile, <strong>Share image</strong> opens WhatsApp, Telegram, Messages and other installed apps.</p>
          </aside>
        </div>
      </section>`;
    document.body.append(shell);

    shell.querySelectorAll('[data-share-close]').forEach(node=>node.addEventListener('click',closeModal));
    shell.querySelector('.share-copy-caption').addEventListener('click',async()=>{
      const copied=await copyText(activeSession?.caption||'');
      toast(copied?'Caption copied.':'Could not copy the caption.');
    });
    shell.querySelector('.share-copy-link').addEventListener('click',async()=>{
      const copied=await copyText(activeSession?.url||SITE_URL);
      toast(copied?'Link copied.':'Could not copy the link.');
    });
    shell.querySelector('.share-save-action').addEventListener('click',()=>{
      if(!activeSession?.blob)return;
      if(isIOSLike()&&activeSession.previewUrl){
        const opened=window.open(activeSession.previewUrl,'_blank','noopener,noreferrer');
        toast(opened?'Press and hold the image to save it.':'Allow pop-ups, then try again.');
        return;
      }
      downloadBlob(activeSession.blob,activeSession.fileName);
      toast(isCoarsePointer()?'Image saved to your downloads.':'Branded image downloaded.');
    });
    shell.querySelector('.share-native-action').addEventListener('click',nativeShareFromModal);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!shell.hidden)closeModal()});
    modal=shell;
    return shell;
  }

  function closeModal(){
    if(!modal)return;
    modal.hidden=true;
    document.documentElement.classList.remove('share-dialog-open');
    if(activeSession?.previewUrl)URL.revokeObjectURL(activeSession.previewUrl);
    activeSession=null;
  }

  function openModal(payload={}){
    const type=payload.type==='slip'?'slip':payload.type==='tip'?'tip':'code';
    const url=clean(payload.url)||currentShareUrl();
    const caption=getCaption(payload,type,url);
    const title=type==='slip'?'sporty.codes prediction slip':type==='tip'?'sporty.codes tip snapshot':'Free code from sporty.codes';
    const fileName=`${safeName(type==='slip'?(payload.title||'prediction-slip'):type==='tip'?payload.fixture:payload.code)}-sporty-codes.png`;
    const shell=ensureModal();
    if(activeSession?.previewUrl)URL.revokeObjectURL(activeSession.previewUrl);
    activeSession={payload,type,url,caption,title,fileName,blob:null,file:null,previewUrl:null};

    const preview=shell.querySelector('.share-dialog-preview');
    const loader=shell.querySelector('.share-dialog-loader');
    const nativeButton=shell.querySelector('.share-native-action');
    const nativeLabel=nativeButton.querySelector('span:last-child');
    const saveButton=shell.querySelector('.share-save-action');
    const saveLabel=saveButton.querySelector('span:last-child');
    if(saveLabel)saveLabel.textContent=isIOSLike()?'Open image':'Save image';
    preview.hidden=true;
    preview.removeAttribute('src');
    loader.hidden=false;
    loader.querySelector('strong').textContent='Creating your branded image…';
    nativeButton.disabled=true;
    saveButton.disabled=true;
    nativeLabel.textContent='Share image';

    shell.hidden=false;
    document.documentElement.classList.add('share-dialog-open');
    requestAnimationFrame(()=>shell.querySelector('.share-dialog-close')?.focus({preventScroll:true}));

    buildSessionImage(activeSession).catch(error=>{
      console.error(error);
      if(activeSession){
        loader.hidden=false;
        loader.querySelector('.share-spinner').hidden=true;
        loader.querySelector('strong').textContent='Could not create the image. You can still share the link.';
        nativeButton.disabled=!canNativeShare();
        nativeLabel.textContent='Share link';
      }
    });
    return {opened:true};
  }

  async function buildSessionImage(session){
    const canvas=session.type==='slip'?await renderSlipCard(session.payload):session.type==='tip'?await renderTipCard(session.payload):await renderCodeCard(session.payload);
    if(activeSession!==session)return;
    const blob=await canvasBlob(canvas);
    if(activeSession!==session)return;
    let file=null;
    try{file=new File([blob],session.fileName,{type:'image/png'})}catch{}
    const previewUrl=URL.createObjectURL(blob);
    Object.assign(session,{blob,file,previewUrl});

    const shell=ensureModal();
    const preview=shell.querySelector('.share-dialog-preview');
    const loader=shell.querySelector('.share-dialog-loader');
    const nativeButton=shell.querySelector('.share-native-action');
    const nativeLabel=nativeButton.querySelector('span:last-child');
    const saveButton=shell.querySelector('.share-save-action');
    preview.src=previewUrl;
    preview.hidden=false;
    loader.hidden=true;
    saveButton.disabled=false;
    nativeButton.disabled=false;
    if(canNativeShareFile(file))nativeLabel.textContent='Share image';
    else if(canNativeShare())nativeLabel.textContent='Share link';
    else nativeLabel.textContent='Download image';
  }

  function nativeShareFromModal(){
    const session=activeSession;
    if(!session)return;
    if(canNativeShareFile(session.file)){
      // Keep the share call directly inside this click event so mobile browsers
      // preserve the required user activation.
      navigator.share({title:session.title,text:session.caption,files:[session.file]})
        .then(()=>{toast('Shared from sporty.codes.');closeModal()})
        .catch(error=>{if(error?.name!=='AbortError'){console.error(error);toast('Sharing was blocked. Try Save image instead.')}});
      return;
    }
    if(canNativeShare()){
      navigator.share({title:session.title,text:session.caption,url:session.url})
        .then(()=>{toast('Share sheet opened.');closeModal()})
        .catch(error=>{if(error?.name!=='AbortError'){console.error(error);toast('Sharing was blocked. Copy the link instead.')}});
      return;
    }
    if(session.blob){downloadBlob(session.blob,session.fileName);toast('Branded image downloaded.')}
  }

  async function share(payload={}){return openModal(payload)}

  function button(payload,{className='button secondary share-button',compact=false,label='Share'}={}){
    const node=document.createElement('button');
    node.type='button';
    node.className=className;
    node.innerHTML=compact?`${icon('share')}<span class="sr-only">Share</span>`:`${icon('share')}<span>Share</span>`;
    node.setAttribute('aria-label',label);
    node.addEventListener('click',()=>share(payload));
    return node;
  }

  window.SportyShare={share,button,renderCodeCard,renderTipCard,renderSlipCard,close:closeModal};
  document.addEventListener('DOMContentLoaded',()=>{loadLogo();ensureModal()});
})();
