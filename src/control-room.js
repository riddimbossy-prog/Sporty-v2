(()=>{
  'use strict';
  const $=selector=>document.querySelector(selector);
  const text=value=>String(value??'').trim();
  const escape=value=>text(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const read=async(path,fallback)=>{try{const response=await fetch(`${path}?v=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`HTTP ${response.status}`);return await response.json()}catch{return fallback}};
  const metric=(label,value,kind='')=>`<div class="control-metric ${kind}"><span>${escape(label)}</span><strong>${escape(value)}</strong></div>`;
  const relative=value=>{const date=value?new Date(value):null;if(!date||!Number.isFinite(date.getTime()))return'Not available';const seconds=Math.max(0,Math.floor((Date.now()-date.getTime())/1000));if(seconds<60)return'Just now';if(seconds<3600)return`${Math.floor(seconds/60)} min ago`;if(seconds<86400)return`${Math.floor(seconds/3600)} hr ago`;return`${Math.floor(seconds/86400)} day${Math.floor(seconds/86400)===1?'':'s'} ago`};
  const friendlyReason=reason=>({invalid_record:'Invalid record',missing_or_invalid_code:'Missing or invalid code',missing_or_invalid_odds:'Missing or invalid odds',missing_selections:'Missing selections',duplicate_code:'Duplicate code',unavailable_status:'Unavailable status',expired:'Expired',expired_match_day:'Past match day',stale_content:'Stale content'}[reason]||text(reason).replaceAll('_',' '));
  const validHttps=value=>/^https:\/\//i.test(text(value));
  let feed={items:[]},history={codes:[]},health={},eliteHealth={},eliteFeed={items:[]},ledger={entries:[]},summary={},draft={version:2,updated_at:null,overrides:[]};

  function setHealth(){
    const state=text(health.state||'preparing');const banner=$('#feedHealthBanner');if(banner)banner.dataset.state=state;
    const title=$('#feedHealthTitle');const copy=$('#feedHealthCopy');const age=$('#feedHealthAge');const badge=$('#qualityBadge');
    const published=Number(health.published_count??health.fresh_count??feed.items?.length??0);
    const labels={healthy:'Feed healthy',degraded:'Feed needs attention',poor_quality:'Feed quality is low',failed:'Latest update failed',preparing:'Feed preparing'};
    if(title)title.textContent=labels[state]||'Feed status available';
    if(copy){if(state==='failed')copy.textContent=health.last_error||'The previous public feed was preserved.';else copy.textContent=`${published} current code${published===1?'':'s'} published after validation. ${Number(summary.verified_total||0)} verified settlement${Number(summary.verified_total||0)===1?'':'s'} recorded.`}
    if(age)age.textContent=health.last_successful_at?`Last success ${relative(health.last_successful_at)}`:'No successful update yet';
    if(badge){badge.textContent=state==='healthy'?'Healthy':state==='degraded'?'Degraded':state==='failed'?'Failed':state==='poor_quality'?'Low quality':'Preparing';badge.dataset.state=state}
  }

  function draftReviewCount(){return draft.overrides.filter(row=>['won','lost','void'].includes(text(row.result).toLowerCase())&&row.verified!==true).length}
  function renderMetrics(){
    const box=$('#controlMetrics');if(!box)return;
    box.innerHTML=[
      metric('Published',health.published_count??health.fresh_count??feed.items?.length??0,'good'),
      metric('Verified results',summary.verified_total??health.verified_results_count??0,'good'),
      metric('Needs review',Math.max(Number(summary.needs_review||0),draftReviewCount()),draftReviewCount()>0?'bad':''),
      metric('Manual verified',health.manual_verified_count??0),
      metric('Hidden by admin',health.hidden_count??draft.overrides.filter(row=>row.hidden===true).length),
      metric('Incomplete',health.incomplete_count??0),
      metric('Expired / stale',health.expired_count??0),
      metric('Duplicates',health.duplicate_count??0),
      metric('Quality score',`${Number(health.quality_score||0)}%`,Number(health.quality_score||0)>=70?'good':Number(health.quality_score||0)<35?'bad':''),
      metric('Mapped tips',health.mapped_tips??0),
      metric('Source response',Number.isFinite(Number(health.source_latency_ms))?`${Number(health.source_latency_ms)} ms`:'Not available'),
      metric('Consecutive failures',health.consecutive_failures??0,Number(health.consecutive_failures)>0?'bad':'good')
    ].join('');
  }

  function renderReasons(){
    const root=$('#qualityReasons');if(!root)return;const rows=Object.entries(health.rejected_by_reason||{}).filter(([,count])=>Number(count)>0).sort((a,b)=>Number(b[1])-Number(a[1]));
    root.innerHTML=rows.length?rows.map(([reason,count])=>`<li><span>${escape(friendlyReason(reason))}</span><strong>${escape(count)}</strong></li>`).join(''):'<li><span>No quality exceptions recorded</span><strong>0</strong></li>';
  }

  function renderEliteHealth(){
    const badge=$('#eliteHealthBadge');const metrics=$('#eliteControlMetrics');const timeline=$('#eliteTimeline');const state=text(eliteHealth.state||'preparing');
    if(badge){badge.textContent=state==='healthy'?'Healthy':state==='degraded'?'Degraded':state==='awaiting_configuration'?'Needs API key':state==='failed'?'Failed':'Preparing';badge.dataset.state=state}
    if(metrics)metrics.innerHTML=[
      metric('Candidates',Number(eliteHealth.candidate_count||0)),metric('Published',Number(eliteHealth.published_count||eliteFeed.items?.length||0)),metric('Elite Verified',Number(eliteHealth.elite_verified||0),'good'),metric('Elite Supported',Number(eliteHealth.elite_supported||0)),metric('Trending',Number(eliteHealth.trending||0)),metric('Rejected',Number(eliteHealth.rejected_count||0),'bad'),metric('Credits used',`${Number(eliteHealth.credits_used||0)} / ${Number(eliteHealth.run_credit_budget||0)}`),metric('Cache entries',Number(eliteHealth.cache_entries||0))
    ].join('');
    if(timeline){const rows=[['Last attempt',eliteHealth.last_attempt_at?`${new Date(eliteHealth.last_attempt_at).toLocaleString()} · ${relative(eliteHealth.last_attempt_at)}`:'Not available'],['Last success',eliteHealth.last_successful_at?`${new Date(eliteHealth.last_successful_at).toLocaleString()} · ${relative(eliteHealth.last_successful_at)}`:'Not available'],['Mapping pending',Number(eliteHealth.mapping_pending||0)],['Average API latency',Number.isFinite(Number(eliteHealth.average_api_latency_ms))?`${Number(eliteHealth.average_api_latency_ms)} ms`:'Not available'],['Latest error',eliteHealth.last_error||'None']];timeline.innerHTML=rows.map(([label,value])=>`<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}
  }

  function renderTimeline(){
    const root=$('#feedTimeline');if(!root)return;const entries=[
      ['Schedule',health.schedule||'Hourly'],['Last attempt',health.last_attempt_at?`${new Date(health.last_attempt_at).toLocaleString()} · ${relative(health.last_attempt_at)}`:'Not available'],['Last success',health.last_successful_at?`${new Date(health.last_successful_at).toLocaleString()} · ${relative(health.last_successful_at)}`:'Not available'],['Latest verified result',summary.latest_verified_at?`${new Date(summary.latest_verified_at).toLocaleString()} · ${relative(summary.latest_verified_at)}`:'None recorded'],['Last failure',health.last_failure_at?`${new Date(health.last_failure_at).toLocaleString()} · ${relative(health.last_failure_at)}`:'None recorded'],['Run time',Number.isFinite(Number(health.run_duration_ms))?`${Number(health.run_duration_ms)} ms`:'Not available'],['Latest error',health.last_error||'None']
    ];root.innerHTML=entries.map(([label,value])=>`<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('');
  }

  function overrideFor(code){return draft.overrides.find(row=>text(row.code).toUpperCase()===text(code).toUpperCase())}
  function upsertOverride(code,patch){const key=text(code).toUpperCase();if(!key)return;const index=draft.overrides.findIndex(row=>text(row.code).toUpperCase()===key);const next={...(index>=0?draft.overrides[index]:{code:text(code)}),...patch,code:text(code),updated_at:new Date().toISOString()};if(index>=0)draft.overrides[index]=next;else draft.overrides.push(next);draft.updated_at=new Date().toISOString();markDraft()}
  function markDraft(message='Override file has unsaved changes.'){const node=$('#draftStatus');if(node){node.textContent=message;node.classList.add('changed')}}

  function renderVisibility(){
    const root=$('#visibilityList');if(!root)return;
    const rows=[];const seen=new Set();
    for(const item of feed.items||[]){const code=text(item.code);if(!code||seen.has(code.toUpperCase()))continue;seen.add(code.toUpperCase());rows.push({code,title:text(item.title)||'Free public code',odds:item.odds,selections:item.selections,hidden:Boolean(overrideFor(code)?.hidden)})}
    for(const row of draft.overrides||[]){const code=text(row.code);if(!code||!row.hidden||seen.has(code.toUpperCase()))continue;seen.add(code.toUpperCase());rows.push({code,title:'Previously hidden code',odds:null,selections:null,hidden:true})}
    if(!rows.length){root.innerHTML='<div class="control-empty">No current or hidden codes are available.</div>';return}
    root.innerHTML=rows.map(row=>`<article class="visibility-row ${row.hidden?'is-hidden':''}"><div class="visibility-code"><strong>${escape(row.code)}</strong><span>${escape(row.title)}</span></div><div class="visibility-meta"><span>${row.odds?`${escape(Number(row.odds).toLocaleString(undefined,{maximumFractionDigits:2}))} odds`:'—'}</span><span>${row.selections?`${escape(row.selections)} selections`:'—'}</span></div><span class="visibility-state">${row.hidden?'Hidden':'Published'}</span><button class="button ${row.hidden?'secondary':'danger'} compact visibility-toggle" type="button" data-code="${escape(row.code)}" data-hidden="${row.hidden?'true':'false'}">${row.hidden?'Restore':'Hide'}</button></article>`).join('');
  }

  function renderSettlementReview(){
    const root=$('#settlementReviewList');const badge=$('#settlementReviewBadge');if(!root)return;
    const rows=[];const seen=new Set();
    for(const row of draft.overrides||[]){
      const result=text(row.result).toLowerCase();if(!['won','lost','void'].includes(result))continue;const code=text(row.code).toUpperCase();if(!code)continue;seen.add(code);rows.push({code,result,status:row.verified===true?'verified':'needs_review',method:row.verified===true?'Manual verified':'Manual review',evidence:row.evidence_url,updated:row.verified_at||row.updated_at,note:row.note});
    }
    for(const row of ledger.entries||[]){
      const code=text(row.code).toUpperCase();if(!code||seen.has(code))continue;rows.push({code,result:row.result||'—',status:row.verification_status||'pending',method:row.method||'Source feed',evidence:row.evidence_url,updated:row.verified_at||row.last_confirmed_at,proof:row.proof_id});
    }
    rows.sort((a,b)=>String(b.updated||'').localeCompare(String(a.updated||'')));
    const review=rows.filter(row=>row.status==='needs_review').length;
    if(badge){badge.textContent=review?`${review} needs review`:`${rows.filter(row=>row.status==='verified').length} verified`;badge.dataset.state=review?'failed':'healthy'}
    if(!rows.length){root.innerHTML='<div class="control-empty">No settlement records yet.</div>';return}
    root.innerHTML=rows.slice(0,80).map(row=>`<article class="settlement-review-row ${row.status==='verified'?'is-verified':'needs-review'}"><div><strong>${escape(row.code)}</strong><span>${escape(row.result.toUpperCase())} · ${escape(row.method)}</span></div><span class="settlement-state">${row.status==='verified'?'Verified':'Needs review'}</span><div class="settlement-proof">${row.proof?`Proof ${escape(row.proof)}`:row.note?escape(row.note):'No public proof ID yet'}</div>${validHttps(row.evidence)?`<a href="${escape(row.evidence)}" target="_blank" rel="noopener noreferrer">Evidence</a>`:'<span>—</span>'}</article>`).join('');
  }

  function renderCodeSelect(){const select=$('#overrideCode');if(!select)return;const rows=[...(feed.items||[]),...(history.codes||[])].filter((row,index,array)=>row.code&&array.findIndex(other=>text(other.code).toUpperCase()===text(row.code).toUpperCase())===index);select.innerHTML='<option value="">Choose code</option>'+rows.map(row=>`<option value="${escape(row.code)}">${escape(row.code)} — ${escape(row.title||'Public code')}</option>`).join('')}

  async function load(){
    const auth=window.SportyAuth;await auth.ready;
    if(!auth.session){location.replace('/admin-login.html?next=/control-room.html');return}
    await auth.refreshAccess();if(!auth.isAdmin()){$('#controlGate').hidden=false;$('#controlApp').hidden=true;return}
    $('#controlGate').hidden=true;$('#controlApp').hidden=false;
    [health,eliteHealth,eliteFeed,feed,history,draft,ledger,summary]=await Promise.all([
      read('/data/feed-health.json',{}),read('/data/elite-feed-health.json',{}),read('/data/elite-picks.json',{items:[]}),read('/data/codehub-banner.json',{items:[]}),read('/data/tip-history.json',{tips:[],codes:[]}),read('/data/manual-overrides.json',{version:2,updated_at:null,overrides:[]}),read('/data/settlement-ledger.json',{entries:[]}),read('/data/results-summary.json',{})
    ]);
    if(!Array.isArray(feed.items))feed.items=[];if(!Array.isArray(history.codes))history.codes=[];if(!Array.isArray(ledger.entries))ledger.entries=[];if(!Array.isArray(draft.overrides))draft={version:2,updated_at:null,overrides:[]};
    setHealth();renderMetrics();renderReasons();renderTimeline();renderEliteHealth();renderVisibility();renderSettlementReview();renderCodeSelect();const status=$('#draftStatus');if(status){status.textContent='No unsaved override changes.';status.classList.remove('changed')}
  }

  function toggleVisibility(code,isHidden){upsertOverride(code,{hidden:!isHidden});renderVisibility();renderMetrics()}
  function addResult(){
    const code=text($('#overrideCode')?.value);const result=text($('#overrideResult')?.value).toLowerCase();const verified=$('#overrideVerified')?.checked===true;const evidence=text($('#overrideEvidence')?.value);const note=text($('#overrideNote')?.value);
    if(!code||!result){alert('Choose a code and a result first.');return}
    if(evidence&&!validHttps(evidence)){alert('Evidence links must begin with https://');return}
    if(verified&&result!=='pending'&&!evidence&&note.length<10){alert('Add an HTTPS evidence link or a clear verification note before marking this result verified.');return}
    const now=new Date().toISOString();upsertOverride(code,{result,settled_at:result==='pending'?null:now,verified:result==='pending'?false:verified,verified_at:verified&&result!=='pending'?now:null,evidence_url:evidence||null,note:note||null});markDraft(verified&&result!=='pending'?`Verified result for ${code} added to the override file.`:`Result for ${code} added to the review queue.`);renderSettlementReview();renderMetrics();
  }
  function download(){
    draft.updated_at=new Date().toISOString();const cleaned={version:2,updated_at:draft.updated_at,verification_policy:'Manual settlements publish only when verified is true.',overrides:draft.overrides.filter(row=>text(row.code)).map(row=>({code:text(row.code),hidden:row.hidden===true,result:['won','lost','void','pending'].includes(text(row.result).toLowerCase())?text(row.result).toLowerCase():undefined,settled_at:row.settled_at||undefined,verified:row.verified===true,verified_at:row.verified_at||undefined,evidence_url:validHttps(row.evidence_url)?text(row.evidence_url):undefined,note:text(row.note)||undefined,updated_at:row.updated_at||draft.updated_at}))};
    const blob=new Blob([JSON.stringify(cleaned,null,2)+'\n'],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='manual-overrides.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);const node=$('#draftStatus');if(node){node.textContent='Override file downloaded. Upload it to data/manual-overrides.json.';node.classList.remove('changed')}
  }

  document.addEventListener('DOMContentLoaded',()=>{
    $('#refreshControl')?.addEventListener('click',load);$('#downloadOverrides')?.addEventListener('click',download);$('#addResultOverride')?.addEventListener('click',addResult);
    $('#visibilityList')?.addEventListener('click',event=>{const button=event.target.closest('.visibility-toggle');if(!button)return;toggleVisibility(button.dataset.code,button.dataset.hidden==='true')});load();
  });
})();
