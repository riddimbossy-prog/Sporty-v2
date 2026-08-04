(()=>{
  'use strict';
  const $=selector=>document.querySelector(selector);
  let dashboard=null,timer=null,selected=null,pendingAction='';
  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const date=value=>value?new Date(value).toLocaleString():'Never';
  const ago=value=>{if(!value)return'Never';const seconds=Math.max(0,Math.round((Date.now()-Date.parse(value))/1000));if(seconds<60)return`${seconds}s ago`;if(seconds<3600)return`${Math.floor(seconds/60)}m ago`;if(seconds<86400)return`${Math.floor(seconds/3600)}h ago`;return`${Math.floor(seconds/86400)}d ago`};
  const maskEmail=email=>{const [name,domain]=String(email||'').split('@');if(!domain)return'';return`${name.slice(0,2)}***@${domain}`};

  function status(message,tone='neutral'){const box=$('#adminStatus');box.textContent=message;box.dataset.tone=tone;box.hidden=!message}
  function isRecentAdminSession(){const stamp=Date.parse(window.SportyAuth?.session?.user?.last_sign_in_at||'');return Number.isFinite(stamp)&&Date.now()-stamp<20*60*1000}

  function metrics(data){
    $('#adminMetrics').innerHTML=[
      ['Online now',data.online_users||0,'green'],['Registered',data.total_users||0,''],['Active today',data.signed_in_today||0,''],['New in 7 days',data.new_users_7d||0,''],['Suspended',data.suspended_users||0,'amber'],['Deletion requests',data.pending_deletions||0,'red']
    ].map(([label,value,tone])=>`<article class="audience-metric ${tone}"><span>${label}</span><strong>${value}</strong></article>`).join('');
    $('#lastAdminRefresh').textContent=`Updated ${new Date(data.generated_at||Date.now()).toLocaleTimeString()}`;
  }

  function filteredUsers(){
    const query=$('#userSearch').value.trim().toLowerCase();
    const presence=$('#presenceFilter').value;
    const account=$('#accountFilter').value;
    return(dashboard?.users||[]).filter(user=>{
      if(presence==='online'&&!user.is_online)return false;if(presence==='offline'&&user.is_online)return false;
      if(account!=='all'&&String(user.account_status||'active')!==account)return false;
      if(!query)return true;
      return[user.display_name,user.email,user.timezone,user.device_type,user.browser_name,user.os_name,user.account_status].some(value=>String(value||'').toLowerCase().includes(query));
    });
  }

  function actionButton(label,action,tone='secondary'){return`<button class="button ${tone} compact" type="button" data-user-action="${action}">${label}</button>`}

  function renderUsers(){
    const rows=filteredUsers();$('#userCountLabel').textContent=`${rows.length} shown`;
    $('#audienceRows').innerHTML=rows.length?rows.map(user=>{
      const state=user.account_status||'active';
      const controls=state==='active'?`${actionButton('Suspend','suspend','warning-outline')}${actionButton('Disable','disable','danger-outline')}`:`${actionButton('Restore','restore','secondary')}`;
      const deletionControls=['pending','reviewing'].includes(user.deletion_status)?`${actionButton('Review request','review_deletion','secondary')}${actionButton('Reject request','reject_deletion','danger-outline')}`:'';
      return`<article class="audience-row admin-user-row" data-user-id="${esc(user.id)}" data-user-email="${esc(user.email)}">
        <div class="audience-person"><span class="presence-dot ${user.is_online?'online':'offline'}"></span><div><strong>${esc(user.display_name||'Member')}</strong><span>${esc(user.email||'')}</span><em class="account-state state-${esc(state)}">${esc(state.replaceAll('_',' '))}</em></div></div>
        <div><span class="audience-label">Status</span><strong>${user.is_online?'Online':'Offline'}</strong><small>${user.is_online?'Active now':ago(user.last_seen_at)}</small></div>
        <div><span class="audience-label">Activity</span><strong>${esc(user.current_path||'/')}</strong><small>${esc(user.timezone||'Time zone unavailable')}</small></div>
        <div><span class="audience-label">Device</span><strong>${esc(user.device_type||'Unknown')}</strong><small>${esc([user.browser_name,user.os_name].filter(Boolean).join(' · ')||'Not available')}</small></div>
        <div><span class="audience-label">Saved</span><strong>${Number(user.saved_count||0)}</strong><small>${user.deletion_status?`Deletion: ${esc(user.deletion_status)}`:'No deletion request'}</small></div>
        <details><summary>Manage</summary><div class="audience-more"><span>Provider <b>${esc(user.auth_provider||'email')}</b></span><span>Sign-ins <b>${Number(user.sign_in_count||0)}</b></span><span>Joined <b>${date(user.created_at)}</b></span><span>Last sign-in <b>${date(user.last_sign_in_at)}</b></span><span>Latest page <b>${esc(user.current_path||'/')}</b></span></div><div class="admin-user-actions">${controls}${actionButton('Revoke sessions','revoke_sessions','secondary')}${deletionControls}${actionButton('Erase app data','erase_app_data','danger')}</div></details>
      </article>`;
    }).join(''):'<div class="empty">No users match this view.</div>';
    document.querySelectorAll('[data-user-action]').forEach(button=>button.addEventListener('click',()=>openAction(button.closest('[data-user-id]'),button.dataset.userAction)));
  }

  function openAction(row,action){
    const user=(dashboard?.users||[]).find(item=>item.id===row?.dataset.userId);if(!user)return;
    selected=user;pendingAction=action;
    const labels={suspend:'Suspend account',restore:'Restore account',disable:'Disable account',revoke_sessions:'Revoke all sessions',erase_app_data:'Erase application data',review_deletion:'Mark deletion request as reviewing',reject_deletion:'Reject deletion request'};
    $('#actionTitle').textContent=labels[action]||'Account action';
    $('#actionUser').textContent=`${user.display_name||'Member'} · ${user.email}`;
    $('#actionReason').value='';$('#actionConfirmEmail').value='';
    $('#confirmEmailWrap').hidden=action!=='erase_app_data';
    $('#actionWarning').textContent=action==='erase_app_data'?'This removes saved items, preferences and activity records, disables the account and cannot be undone from this dashboard. The authentication record is retained for operator review.':action==='revoke_sessions'?'This signs the member out on all known devices.':'This action is recorded in the administrator audit log.';
    $('#adminActionDialog').showModal();
  }

  async function confirmAction(){
    if(!selected||!pendingAction)return;
    const needsFresh=['suspend','disable','revoke_sessions','erase_app_data'].includes(pendingAction);
    if(needsFresh&&!isRecentAdminSession()){status('For this sensitive action, sign out of the admin account and sign in again, then retry.','error');$('#adminActionDialog').close();return}
    if(pendingAction==='erase_app_data'&&$('#actionConfirmEmail').value.trim().toLowerCase()!==String(selected.email||'').toLowerCase()){status('Enter the member email exactly before erasing app data.','error');return}
    const reason=$('#actionReason').value.trim();
    if(['suspend','disable','reject_deletion'].includes(pendingAction)&&reason.length<4){status('Add a short reason for this action.','error');return}
    $('#confirmAdminAction').disabled=true;
    try{
      const {data,error}=await window.SportyAuth.client.rpc('admin_user_control',{p_target_user:selected.id,p_action:pendingAction,p_reason:reason||null});
      if(error)throw error;
      status('Account action completed.','success');$('#adminActionDialog').close();await load();
    }catch(error){status(error.message||'The account action could not be completed.','error')}
    finally{$('#confirmAdminAction').disabled=false}
  }

  async function load(){
    const auth=window.SportyAuth;await auth.ready;
    if(!auth.session){location.replace(`/admin-login.html?next=${encodeURIComponent('/admin-users.html')}`);return}
    await auth.refreshAccess();
    if(!auth.isAdmin()){$('#adminGate').hidden=false;$('#adminApp').hidden=true;return}
    $('#adminGate').hidden=true;$('#adminApp').hidden=false;
    const {data,error}=await auth.client.rpc('admin_presence_dashboard');
    if(error){status(error.message||'Audience data is unavailable.','error');return}
    dashboard=data||{};metrics(dashboard);renderUsers();
  }

  function exportCsv(){
    const users=filteredUsers();
    const columns=['name','masked_email','account_status','online','last_seen','timezone','device','browser','os','provider','saved_count','deletion_status'];
    const csv=[columns.join(','),...users.map(user=>[user.display_name,maskEmail(user.email),user.account_status,user.is_online,date(user.last_seen_at),user.timezone,user.device_type,user.browser_name,user.os_name,user.auth_provider,user.saved_count,user.deletion_status].map(value=>`"${String(value??'').replaceAll('"','""')}"`).join(','))].join('\n');
    const blob=new Blob([csv],{type:'text/csv'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`sporty-users-sanitized-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  document.addEventListener('DOMContentLoaded',()=>{
    $('#userSearch')?.addEventListener('input',renderUsers);$('#presenceFilter')?.addEventListener('change',renderUsers);$('#accountFilter')?.addEventListener('change',renderUsers);
    $('#refreshAudience')?.addEventListener('click',load);$('#exportAudience')?.addEventListener('click',exportCsv);
    $('#cancelAdminAction')?.addEventListener('click',()=>$('#adminActionDialog').close());$('#confirmAdminAction')?.addEventListener('click',confirmAction);
    load();timer=setInterval(load,20000);
  });
  addEventListener('pagehide',()=>clearInterval(timer));
})();
