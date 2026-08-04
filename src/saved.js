(()=>{
  'use strict';

  const GUEST_KEY='sporty_saved_guest_v199';
  const RECENT_KEY='sporty_recent_codes_v199';
  const MAX_RECENT=12;
  let synced=[];
  let recentSynced=[];
  let loading=null;
  let reconciling=false;

  const clean=value=>String(value??'').trim();
  const slug=value=>clean(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,160);
  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

  function readLocal(key){
    try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value:[]}catch{return[]}
  }
  function writeLocal(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
  function notify(){document.dispatchEvent(new CustomEvent('sportysavedchange',{detail:{items:getCached()}}))}

  function normalize(item={}){
    const type=['code','tip','match'].includes(item.item_type)?item.item_type:'tip';
    const payload=item.payload&&typeof item.payload==='object'?item.payload:{};
    const key=clean(item.item_key)||slug(`${type}-${item.title}-${item.subtitle}`);
    return {
      id:item.id||null,
      user_id:item.user_id||null,
      item_type:type,
      item_key:key,
      title:clean(item.title)||'Saved item',
      subtitle:clean(item.subtitle),
      item_status:clean(item.item_status)||'saved',
      payload,
      created_at:item.created_at||new Date().toISOString(),
      updated_at:item.updated_at||new Date().toISOString()
    };
  }

  function codeItem(item={}){
    const code=clean(item.code||item.booking_code||item.bookingCode);
    return normalize({
      item_type:'code',
      item_key:`code:${slug(code||item.title)}`,
      title:clean(item.title)||'Public booking code',
      subtitle:code,
      payload:{
        code,
        odds:Number(item.odds)||0,
        selections:Number(item.selections)||0,
        category:clean(item.category),
        kickoff:item.kickoff||null,
        status:clean(item.status)||'upcoming'
      }
    });
  }

  function tipItem(item={}){
    const fixture=clean(item.fixture);
    const market=clean(item.market);
    const pick=clean(item.pick);
    const kickoff=item.kickoff||null;
    return normalize({
      item_type:'tip',
      item_key:`tip:${slug(`${kickoff||'undated'}-${fixture}-${market}-${pick}`)}`,
      title:fixture||'Saved tip',
      subtitle:[market,pick].filter(Boolean).join(': '),
      payload:{
        fixture,market,pick,kickoff,
        league:clean(item.league),
        category:clean(item.category),
        score:Number(item.score)||0,
        tier:clean(item.tier),
        opposition_share:Number(item.oppositionShare??item.opposition_share)||0,
        average_odds:Number(item.averageOdds??item.average_odds)||0,
        consensus_share:Number(item.share??item.consensus_share)||0,
        source_count:Number(item.uniqueSources??item.source_count)||0
      }
    });
  }

  function getCached(){
    const map=new Map();
    [...readLocal(GUEST_KEY),...synced].map(normalize).forEach(item=>map.set(`${item.item_type}:${item.item_key}`,item));
    return [...map.values()].sort((a,b)=>Date.parse(b.updated_at||0)-Date.parse(a.updated_at||0));
  }

  function isSaved(item){
    const normalized=normalize(item);
    return getCached().some(row=>row.item_type===normalized.item_type&&row.item_key===normalized.item_key);
  }

  async function load({force=false}={}){
    if(loading&&!force)return loading;
    loading=(async()=>{
      const auth=window.SportyAuth;
      if(!auth)return getCached();
      await auth.ready;
      if(!auth.session?.user||!auth.client){synced=[];notify();return getCached()}
      const {data,error}=await auth.client.from('saved_items').select('id,user_id,item_type,item_key,title,subtitle,item_status,payload,created_at,updated_at').order('updated_at',{ascending:false});
      if(error){console.warn('Saved items are temporarily unavailable',error.message);return getCached()}
      synced=(data||[]).map(normalize);
      await migrateGuest();
      notify();
      return getCached();
    })();
    try{return await loading}finally{loading=null}
  }

  async function migrateGuest(){
    const guest=readLocal(GUEST_KEY).map(normalize);
    const auth=window.SportyAuth;
    if(!guest.length||!auth?.session?.user||!auth.client)return;
    const rows=guest.map(item=>({
      user_id:auth.session.user.id,item_type:item.item_type,item_key:item.item_key,title:item.title,
      subtitle:item.subtitle,item_status:item.item_status,payload:item.payload,updated_at:new Date().toISOString()
    }));
    const {data,error}=await auth.client.from('saved_items').upsert(rows,{onConflict:'user_id,item_type,item_key'}).select();
    if(error){console.warn('Guest saves could not be synced',error.message);return}
    writeLocal(GUEST_KEY,[]);
    synced=(data||rows).map(normalize).concat(synced.filter(existing=>!rows.some(row=>row.item_type===existing.item_type&&row.item_key===existing.item_key)));
  }

  async function save(item){
    const value=normalize(item);
    const auth=window.SportyAuth;
    if(auth){await auth.ready}
    if(auth?.session?.user&&auth.client){
      const row={user_id:auth.session.user.id,item_type:value.item_type,item_key:value.item_key,title:value.title,subtitle:value.subtitle,item_status:value.item_status,payload:value.payload,updated_at:new Date().toISOString()};
      const {data,error}=await auth.client.from('saved_items').upsert(row,{onConflict:'user_id,item_type,item_key'}).select().single();
      if(error)throw error;
      synced=[normalize(data),...synced.filter(existing=>!(existing.item_type===value.item_type&&existing.item_key===value.item_key))];
    }else{
      const guest=readLocal(GUEST_KEY).map(normalize).filter(existing=>!(existing.item_type===value.item_type&&existing.item_key===value.item_key));
      guest.unshift({...value,updated_at:new Date().toISOString()});
      writeLocal(GUEST_KEY,guest.slice(0,100));
    }
    notify();
    return value;
  }

  async function remove(item){
    const value=normalize(item);
    const auth=window.SportyAuth;
    if(auth){await auth.ready}
    if(auth?.session?.user&&auth.client){
      const {error}=await auth.client.from('saved_items').delete().eq('item_type',value.item_type).eq('item_key',value.item_key);
      if(error)throw error;
      synced=synced.filter(existing=>!(existing.item_type===value.item_type&&existing.item_key===value.item_key));
    }
    const guest=readLocal(GUEST_KEY).map(normalize).filter(existing=>!(existing.item_type===value.item_type&&existing.item_key===value.item_key));
    writeLocal(GUEST_KEY,guest);
    notify();
  }

  async function toggle(item){
    const value=normalize(item);
    if(isSaved(value)){await remove(value);return false}
    await save(value);return true;
  }

  function button(item,{className='button secondary save-button',compact=false}={}){
    const value=normalize(item);
    const node=document.createElement('button');
    node.type='button';node.className=className;
    const refresh=()=>{
      const active=isSaved(value);
      node.classList.toggle('saved',active);
      node.setAttribute('aria-pressed',active?'true':'false');
      node.textContent=active?(compact?'★':'★ Saved'):(compact?'☆':'☆ Save');
    };
    refresh();
    node.addEventListener('click',async()=>{
      node.disabled=true;
      try{await toggle(value);refresh()}catch(error){console.warn(error);node.textContent='Try again'}finally{node.disabled=false}
    });
    document.addEventListener('sportysavedchange',refresh);
    return node;
  }


  async function reconcileTips(currentRows=[]){
    if(reconciling)return;
    reconciling=true;
    try{
      const current=new Map(currentRows.map(row=>{const item=tipItem(row);return[item.item_key,{row,item}]}));
      const saved=getCached().filter(item=>item.item_type==='tip');
      for(const old of saved){
        const match=current.get(old.item_key);
        if(!match){
          const kickoff=Date.parse(old.payload?.kickoff||'');
          if(Number.isFinite(kickoff)&&kickoff<Date.now()-6*60*60*1000&&old.item_status!=='expired'){
            await save({...old,item_status:'expired',payload:{...old.payload,last_change_note:'The saved fixture is no longer on the active board.',last_checked_at:new Date().toISOString()}});
          }
          continue;
        }
        const fresh=match.item;
        const before=old.payload||{},after=fresh.payload||{};
        const notes=[];
        const oldScore=Number(before.score)||0,newScore=Number(after.score)||0;
        if(oldScore&&newScore&&Math.round(oldScore)!==Math.round(newScore))notes.push(`Tip Strength ${Math.round(oldScore)} → ${Math.round(newScore)}`);
        if(before.tier&&after.tier&&before.tier!==after.tier)notes.push(`${before.tier} → ${after.tier}`);
        const oldOpp=Number(before.opposition_share)||0,newOpp=Number(after.opposition_share)||0;
        if(Math.abs(oldOpp-newOpp)>=5)notes.push(`Opposition ${oldOpp.toFixed(1)}% → ${newOpp.toFixed(1)}%`);
        if(notes.length){
          await save({...old,item_status:'changed',title:fresh.title,subtitle:fresh.subtitle,payload:{...after,previous_snapshot:{score:oldScore,tier:before.tier,opposition_share:oldOpp},last_change_note:notes.join(' · '),last_checked_at:new Date().toISOString()}});
        }else if(old.item_status==='changed'){
          await save({...old,item_status:'saved',payload:{...after,last_change_note:before.last_change_note||null,last_checked_at:new Date().toISOString()}});
        }
      }
    }catch(error){console.warn('Saved-tip refresh skipped',error?.message||error)}
    finally{reconciling=false}
  }

  async function loadRecent(){
    const auth=window.SportyAuth;
    if(auth)await auth.ready;
    if(!auth?.session?.user||!auth.client){recentSynced=[];return recentCodes()}
    const {data,error}=await auth.client.from('recent_items').select('user_id,item_type,item_key,title,subtitle,payload,viewed_at').order('viewed_at',{ascending:false}).limit(MAX_RECENT);
    if(error){console.warn('Recent items are temporarily unavailable',error.message);return recentCodes()}
    recentSynced=(data||[]).map(row=>normalize({...row,updated_at:row.viewed_at,created_at:row.viewed_at}));
    document.dispatchEvent(new CustomEvent('sportyrecentchange',{detail:{items:recentCodes()}}));
    return recentCodes();
  }

  function recordRecentCode(item={}){
    const value=codeItem(item);
    const viewedAt=new Date().toISOString();
    const rows=readLocal(RECENT_KEY).map(normalize).filter(existing=>existing.item_key!==value.item_key);
    rows.unshift({...value,updated_at:viewedAt});
    writeLocal(RECENT_KEY,rows.slice(0,MAX_RECENT));
    document.dispatchEvent(new CustomEvent('sportyrecentchange',{detail:{items:recentCodes()}}));
    const sync=async()=>{
      const auth=window.SportyAuth;if(auth)await auth.ready;
      if(!auth?.session?.user||!auth.client)return;
      const row={user_id:auth.session.user.id,item_type:value.item_type,item_key:value.item_key,title:value.title,subtitle:value.subtitle,payload:value.payload,viewed_at:viewedAt};
      const {data,error}=await auth.client.from('recent_items').upsert(row,{onConflict:'user_id,item_type,item_key'}).select().single();
      if(error){console.warn('Recent code could not be synced',error.message);return}
      recentSynced=[normalize({...data,updated_at:data.viewed_at,created_at:data.viewed_at}),...recentSynced.filter(existing=>existing.item_key!==value.item_key)].slice(0,MAX_RECENT);
      document.dispatchEvent(new CustomEvent('sportyrecentchange',{detail:{items:recentCodes()}}));
    };
    sync();
  }
  function recentCodes(){
    const map=new Map();
    [...readLocal(RECENT_KEY),...recentSynced].map(normalize).forEach(item=>{
      const existing=map.get(item.item_key);
      if(!existing||Date.parse(item.updated_at||0)>Date.parse(existing.updated_at||0))map.set(item.item_key,item);
    });
    return [...map.values()].sort((a,b)=>Date.parse(b.updated_at||0)-Date.parse(a.updated_at||0)).slice(0,MAX_RECENT);
  }

  document.addEventListener('sportyauthchange',event=>{
    if(event.detail?.session?.user){load({force:true});loadRecent()}
    else{synced=[];recentSynced=[];notify()}
  });
  document.addEventListener('DOMContentLoaded',()=>{load();loadRecent()});

  window.SportySaved={normalize,codeItem,tipItem,getCached,isSaved,load,save,remove,toggle,button,reconcileTips,recordRecentCode,recentCodes,loadRecent,esc};
})();
