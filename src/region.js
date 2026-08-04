(()=>{
  'use strict';

  const REGION_KEY='sporty_region_preference_v1';
  const COUNTRY_KEY='sporty_country_preference_v1';
  const GHANA='GH';
  const INTERNATIONAL='international';
  const GHANA_REGION='ghana';
  const config=window.SPORTY_CONFIG||{};
  const countries={
    GH:'Ghana',NG:'Nigeria',KE:'Kenya',TZ:'Tanzania',ZM:'Zambia',UG:'Uganda',ZA:'South Africa',BR:'Brazil',INTL:'International'
  };
  const supported=['NG','KE','TZ','ZM','UG','ZA','BR'];

  const safeStorage={
    get(key){try{return localStorage.getItem(key)}catch{return null}},
    set(key,value){try{localStorage.setItem(key,value)}catch{}},
    remove(key){try{localStorage.removeItem(key)}catch{}}
  };
  const clean=value=>String(value||'').trim();
  const normalizeCountry=value=>{
    const code=clean(value).toUpperCase().replace(/[^A-Z]/g,'');
    return countries[code]?code:(code==='GLOBAL'||code==='WORLD'||code==='OTHER'?'INTL':'');
  };
  const normalizeRegion=value=>{
    const region=clean(value).toLowerCase();
    if(['gh','ghana','local'].includes(region))return GHANA_REGION;
    if(['international','intl','global','world'].includes(region))return INTERNATIONAL;
    return '';
  };
  const pageIsInternational=()=>document.body?.dataset?.region==='international'||/\/international(?:\.html)?\/?$/i.test(location.pathname);
  const query=()=>new URLSearchParams(location.search);

  function localeCountry(){
    const values=[...(navigator.languages||[]),navigator.language].filter(Boolean);
    for(const value of values){
      const match=String(value).match(/[-_]([A-Za-z]{2})$/);
      const code=normalizeCountry(match?.[1]);
      if(code)return code;
    }
    return '';
  }

  function timezoneCountryHint(){
    let zone='';
    try{zone=Intl.DateTimeFormat().resolvedOptions().timeZone||''}catch{}
    if(zone==='Africa/Accra')return GHANA;
    if(['UTC','Etc/UTC','Etc/GMT','GMT','Africa/Abidjan'].includes(zone))return '';
    return zone?'INTL':'';
  }

  function detectedCountry(){
    const explicit=normalizeCountry(query().get('country'));
    if(explicit)return explicit;
    const stored=normalizeCountry(safeStorage.get(COUNTRY_KEY));
    if(stored)return stored;
    const locale=localeCountry();
    const zone=timezoneCountryHint();
    if(zone===GHANA||locale===GHANA)return GHANA;
    if(zone==='INTL')return locale&&locale!==GHANA?locale:'INTL';
    return '';
  }

  function storedRegion(){return normalizeRegion(safeStorage.get(REGION_KEY))}
  function currentRegion(){
    const explicit=normalizeRegion(query().get('region'));
    if(explicit)return explicit;
    const stored=storedRegion();
    if(stored)return stored;
    if(pageIsInternational())return INTERNATIONAL;
    return detectedCountry()&&detectedCountry()!==GHANA?INTERNATIONAL:GHANA_REGION;
  }
  function currentCountry(){
    const code=normalizeCountry(query().get('country'))||normalizeCountry(safeStorage.get(COUNTRY_KEY))||detectedCountry();
    return currentRegion()===GHANA_REGION?GHANA:(code&&code!==GHANA?code:'INTL');
  }
  function countryName(code=currentCountry()){return countries[normalizeCountry(code)]||'International'}
  function isInternational(){return currentRegion()===INTERNATIONAL}

  function officialSiteUrl(code=currentCountry()){
    const normalized=normalizeCountry(code)||'INTL';
    const map=config.regionalSites&&typeof config.regionalSites==='object'?config.regionalSites:{};
    return clean(map[normalized]||config.sportyOfficialUrl)||'https://www.sportybet.com/';
  }
  function getLoadUrl(){
    if(!isInternational())return clean(config.codeHubLoadUrl)||'https://www.sportybet.com/gh/m/code-hub/load-code';
    return officialSiteUrl();
  }

  function destination(region){return region===GHANA_REGION?'/':'/international.html'}
  function setCountry(code){
    const normalized=normalizeCountry(code)||'INTL';
    safeStorage.set(COUNTRY_KEY,normalized);
    document.documentElement.dataset.sportyCountry=normalized;
    syncRegionControls();
    window.dispatchEvent(new CustomEvent('sporty:country-change',{detail:{country:normalized,name:countryName(normalized)}}));
    return normalized;
  }
  function setRegion(region,options={}){
    const normalized=normalizeRegion(region)||GHANA_REGION;
    safeStorage.set(REGION_KEY,normalized);
    if(normalized===GHANA_REGION)setCountry(GHANA);
    else if(options.country)setCountry(options.country);
    if(options.navigate!==false){
      const url=new URL(destination(normalized),location.origin);
      if(normalized===INTERNATIONAL&&currentCountry()!=='INTL')url.searchParams.set('country',currentCountry());
      location.assign(`${url.pathname}${url.search}`);
    }
    return normalized;
  }

  function highConfidenceOutsideGhana(){
    const code=detectedCountry();
    return Boolean(code&&code!==GHANA);
  }
  function isBot(){return /bot|crawler|spider|crawling|headless/i.test(navigator.userAgent||'')}
  function maybeAutoRoute(){
    const path=location.pathname.replace(/\/+$/,'')||'/';
    if(!['/','/index.html'].includes(path)||pageIsInternational()||isBot())return false;
    if(query().has('no-region-redirect')||query().get('source')==='preview')return false;
    const explicit=normalizeRegion(query().get('region'));
    if(explicit){safeStorage.set(REGION_KEY,explicit);if(explicit===INTERNATIONAL){location.replace('/international.html');return true}return false}
    const stored=storedRegion();
    if(stored===INTERNATIONAL){location.replace('/international.html');return true}
    if(stored===GHANA_REGION)return false;
    if(highConfidenceOutsideGhana()){
      const code=detectedCountry();
      safeStorage.set(REGION_KEY,INTERNATIONAL);
      if(code)safeStorage.set(COUNTRY_KEY,code);
      const suffix=code&&code!=='INTL'?`?country=${encodeURIComponent(code)}&detected=1`:'?detected=1';
      location.replace(`/international.html${suffix}`);
      return true;
    }
    return false;
  }

  function buttonLabel(){
    if(!isInternational())return '🇬🇭 Ghana';
    const code=currentCountry();
    return code==='INTL'?'🌍 International':`🌍 ${code}`;
  }
  function syncRegionControls(){
    document.documentElement.dataset.sportyRegion=currentRegion();
    document.documentElement.dataset.sportyCountry=currentCountry();
    document.querySelectorAll('[data-region-button]').forEach(button=>{
      button.textContent=buttonLabel();
      button.setAttribute('aria-label',`Region: ${isInternational()?countryName():'Ghana'}. Change region`);
    });
    document.querySelectorAll('[data-country-name]').forEach(node=>node.textContent=countryName());
    document.querySelectorAll('[data-region-name]').forEach(node=>node.textContent=isInternational()?'International':'Ghana');
    const select=document.querySelector('#internationalCountry');
    if(select&&[...select.options].some(option=>option.value===currentCountry()))select.value=currentCountry();
  }

  function closeDialog(dialog){dialog?.remove();document.body.classList.remove('region-dialog-open')}
  function openRegionDialog(){
    document.querySelector('.region-dialog-backdrop')?.remove();
    const backdrop=document.createElement('div');backdrop.className='region-dialog-backdrop';backdrop.setAttribute('role','presentation');
    const dialog=document.createElement('section');dialog.className='region-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','regionDialogTitle');
    dialog.innerHTML=`
      <div class="region-dialog-head"><div><span class="eyebrow">Choose your experience</span><h2 id="regionDialogTitle">Where are you using sporty.codes?</h2></div><button class="region-dialog-close" type="button" aria-label="Close">×</button></div>
      <p class="region-dialog-copy">Ghana booking codes remain on the original site. Outside Ghana, use the international page to review the selections and rebuild the slip on your local platform.</p>
      <div class="region-choice-grid">
        <button class="region-choice${!isInternational()?' active':''}" type="button" data-region-choice="ghana"><b>🇬🇭 Ghana</b><span>Keep the existing Ghana code flow and direct load page.</span></button>
        <button class="region-choice${isInternational()?' active':''}" type="button" data-region-choice="international"><b>🌍 International</b><span>Choose your country and rebuild from the listed selections.</span></button>
      </div>
      <label class="region-country-field">Your country
        <select data-region-country>
          <option value="INTL">Other / not listed</option>
          <option value="NG">Nigeria</option><option value="KE">Kenya</option><option value="TZ">Tanzania</option>
          <option value="ZM">Zambia</option><option value="UG">Uganda</option><option value="ZA">South Africa</option><option value="BR">Brazil</option>
        </select>
      </label>
      <div class="region-dialog-actions"><button class="button secondary" type="button" data-region-cancel>Cancel</button><button class="button primary" type="button" data-region-continue>Save and continue</button></div>
      <small>We save only your chosen region and country on this device. 18+ only.</small>`;
    backdrop.append(dialog);document.body.append(backdrop);document.body.classList.add('region-dialog-open');
    let choice=isInternational()?INTERNATIONAL:GHANA_REGION;
    const countrySelect=dialog.querySelector('[data-region-country]');
    countrySelect.value=currentCountry()==='GH'? 'INTL':currentCountry();
    countrySelect.disabled=choice===GHANA_REGION;
    dialog.querySelectorAll('[data-region-choice]').forEach(button=>button.addEventListener('click',()=>{
      choice=button.dataset.regionChoice;
      dialog.querySelectorAll('[data-region-choice]').forEach(node=>node.classList.toggle('active',node===button));
      countrySelect.disabled=choice===GHANA_REGION;
    }));
    dialog.querySelector('.region-dialog-close').addEventListener('click',()=>closeDialog(backdrop));
    dialog.querySelector('[data-region-cancel]').addEventListener('click',()=>closeDialog(backdrop));
    backdrop.addEventListener('click',event=>{if(event.target===backdrop)closeDialog(backdrop)});
    dialog.querySelector('[data-region-continue]').addEventListener('click',()=>{
      if(choice===INTERNATIONAL)setCountry(countrySelect.value||'INTL');
      setRegion(choice,{country:countrySelect.value||'INTL'});
    });
    dialog.addEventListener('keydown',event=>{if(event.key==='Escape')closeDialog(backdrop)});
    dialog.querySelector('.region-dialog-close').focus();
  }

  function injectSwitcher(){
    const actions=document.querySelector('.top-actions');
    if(!actions||actions.querySelector('[data-region-button]'))return;
    const button=document.createElement('button');button.type='button';button.className='region-button';button.dataset.regionButton='';button.addEventListener('click',openRegionDialog);
    actions.insertBefore(button,actions.firstChild);syncRegionControls();
  }

  function injectContextBanner(){
    if(!isInternational()||pageIsInternational())return;
    const main=document.querySelector('main');
    if(!main||main.querySelector('.region-context-banner'))return;
    const banner=document.createElement('aside');banner.className='region-context-banner';
    banner.innerHTML=`<div><strong>International mode is active</strong><span>Ghana booking codes may not load in ${countryName()}. Use the international page to review and rebuild selections.</span></div><a class="button secondary" href="/international.html">Open international page</a>`;
    main.prepend(banner);
  }

  const redirected=maybeAutoRoute();
  window.SportyRegion={
    GHANA,GHANA_REGION,INTERNATIONAL,supported,countries,
    currentRegion,currentCountry,countryName,isInternational,detectedCountry,
    getLoadUrl,officialSiteUrl,setCountry,setRegion,openRegionDialog,syncRegionControls
  };
  if(!redirected){
    document.addEventListener('DOMContentLoaded',()=>{
      if(pageIsInternational()){
        safeStorage.set(REGION_KEY,INTERNATIONAL);
        const explicit=normalizeCountry(query().get('country'));if(explicit&&explicit!==GHANA)safeStorage.set(COUNTRY_KEY,explicit);
      }
      injectSwitcher();injectContextBanner();syncRegionControls();
    },{once:true});
  }
})();
