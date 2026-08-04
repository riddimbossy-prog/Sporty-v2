-- sporty.codes v19.9.0
-- Saved items, account preferences, deletion requests and official-admin controls.
-- Run after 003_official_admin_lockdown.sql.

begin;

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists account_status text not null default 'active',
  add column if not exists status_reason text,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid,
  add column if not exists profile_updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='profiles_account_status_check'
      and conrelid='public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_account_status_check
      check (account_status in ('active','suspended','disabled','pending_deletion','deleted'));
  end if;
end $$;

create table if not exists public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  favorite_markets text[] not null default '{}',
  favorite_leagues text[] not null default '{}',
  min_tip_strength integer not null default 65 check (min_tip_strength between 0 and 100),
  max_opposition numeric(5,2) not null default 30 check (max_opposition between 0 and 100),
  min_sources integer not null default 2 check (min_sources between 1 and 20),
  odds_min numeric(8,2) not null default 1.10 check (odds_min >= 1),
  odds_max numeric(8,2) not null default 5.00 check (odds_max >= odds_min),
  preferred_day text not null default 'all' check (preferred_day in ('all','today','tomorrow','week')),
  location_opt_in boolean not null default false,
  notifications_opt_in boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_type text not null check (item_type in ('code','tip','match')),
  item_key text not null,
  title text not null,
  subtitle text,
  item_status text not null default 'saved',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,item_type,item_key)
);

create index if not exists saved_items_user_updated_idx
  on public.saved_items(user_id,updated_at desc);
create index if not exists saved_items_type_idx
  on public.saved_items(user_id,item_type,updated_at desc);

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','reviewing','cancelled','completed','rejected')),
  reason text,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text
);

create unique index if not exists deletion_request_one_open_idx
  on public.account_deletion_requests(user_id)
  where status in ('pending','reviewing');

create table if not exists public.admin_action_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null,
  target_user_id uuid not null,
  action text not null,
  reason text,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_action_target_idx
  on public.admin_action_log(target_user_id,created_at desc);

alter table public.user_preferences enable row level security;
alter table public.saved_items enable row level security;
alter table public.account_deletion_requests enable row level security;
alter table public.admin_action_log enable row level security;

drop policy if exists preferences_own on public.user_preferences;
create policy preferences_own on public.user_preferences
for all using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists saved_items_own on public.saved_items;
create policy saved_items_own on public.saved_items
for all using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists deletion_requests_own_read on public.account_deletion_requests;
create policy deletion_requests_own_read on public.account_deletion_requests
for select using (user_id=auth.uid() or public.is_admin());

drop policy if exists deletion_requests_own_insert on public.account_deletion_requests;
create policy deletion_requests_own_insert on public.account_deletion_requests
for insert with check (user_id=auth.uid());

drop policy if exists deletion_requests_own_update on public.account_deletion_requests;
create policy deletion_requests_own_update on public.account_deletion_requests
for update using (user_id=auth.uid() or public.is_admin())
with check (user_id=auth.uid() or public.is_admin());

drop policy if exists admin_action_log_admin_read on public.admin_action_log;
create policy admin_action_log_admin_read on public.admin_action_log
for select using (public.is_admin());

revoke all on public.user_preferences,public.saved_items,public.account_deletion_requests,public.admin_action_log from anon;
grant select,insert,update,delete on public.user_preferences,public.saved_items to authenticated;
grant select on public.account_deletion_requests to authenticated;
grant select on public.admin_action_log to authenticated;

create or replace function public.current_user_access()
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_user uuid:=auth.uid();
  v_admin boolean:=false;
  v_status text:='active';
begin
  if v_user is null then
    return jsonb_build_object('authenticated',false,'is_admin',false,'role','guest','account_status','guest','is_allowed',false);
  end if;

  v_admin:=public.is_admin();
  select coalesce(account_status,'active') into v_status
  from public.profiles where id=v_user;
  if v_status is null then v_status:='active'; end if;

  update public.profiles
  set role=case when v_admin then 'admin' else 'user' end,
      profile_updated_at=now()
  where id=v_user
    and role is distinct from case when v_admin then 'admin' else 'user' end;

  return jsonb_build_object(
    'authenticated',true,
    'is_admin',v_admin,
    'role',case when v_admin then 'admin' else 'user' end,
    'account_status',v_status,
    'is_allowed',(v_admin or v_status in ('active','pending_deletion'))
  );
end;
$$;

revoke all on function public.current_user_access() from public;
grant execute on function public.current_user_access() to authenticated;

create or replace function public.request_account_deletion(p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid:=auth.uid();
  v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;

  insert into public.account_deletion_requests(user_id,reason,status,updated_at)
  values(v_user,left(nullif(trim(p_reason),''),1000),'pending',now())
  on conflict (user_id) where status in ('pending','reviewing')
  do update set reason=excluded.reason,updated_at=now()
  returning id into v_id;

  update public.profiles
  set account_status='pending_deletion',status_changed_at=now(),status_reason='Deletion requested by account owner'
  where id=v_user and account_status='active';

  return jsonb_build_object('ok',true,'request_id',v_id,'status','pending');
end;
$$;

create or replace function public.cancel_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  update public.account_deletion_requests
  set status='cancelled',updated_at=now(),resolved_at=now(),resolution_note='Cancelled by account owner'
  where user_id=v_user and status in ('pending','reviewing');
  update public.profiles
  set account_status='active',status_changed_at=now(),status_reason=null
  where id=v_user and account_status='pending_deletion';
  return jsonb_build_object('ok',true,'status','cancelled');
end;
$$;

revoke all on function public.request_account_deletion(text) from public;
revoke all on function public.cancel_account_deletion() from public;
grant execute on function public.request_account_deletion(text) to authenticated;
grant execute on function public.cancel_account_deletion() to authenticated;

create or replace function public.admin_presence_dashboard()
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;

  select jsonb_build_object(
    'generated_at',now(),
    'online_window_seconds',120,
    'total_users',(select count(*) from public.profiles where account_status<>'deleted'),
    'online_users',(select count(*) from public.user_presence pr join public.profiles p on p.id=pr.user_id where p.account_status='active' and pr.signed_out_at is null and pr.last_seen_at>now()-interval '120 seconds'),
    'signed_in_today',(select count(distinct s.user_id) from public.user_signins s where s.signed_in_at>=date_trunc('day',now())),
    'new_users_7d',(select count(*) from public.profiles where created_at>=now()-interval '7 days'),
    'suspended_users',(select count(*) from public.profiles where account_status='suspended'),
    'pending_deletions',(select count(*) from public.account_deletion_requests where status in ('pending','reviewing')),
    'users',coalesce((
      select jsonb_agg(row_to_json(x) order by x.is_online desc,x.last_seen_at desc nulls last,x.created_at desc)
      from (
        select
          p.id,
          p.display_name,
          u.email,
          p.role,
          p.account_status,
          p.status_reason,
          p.status_changed_at,
          p.created_at,
          pr.session_started_at,
          pr.last_seen_at,
          pr.signed_out_at,
          (p.account_status='active' and pr.signed_out_at is null and pr.last_seen_at>now()-interval '120 seconds') as is_online,
          pr.current_path,
          pr.timezone,
          pr.language,
          pr.device_type,
          pr.browser_name,
          pr.os_name,
          pr.auth_provider,
          pr.approx_lat,
          pr.approx_lng,
          pr.location_permission,
          (select max(s.signed_in_at) from public.user_signins s where s.user_id=p.id) as last_sign_in_at,
          (select count(*) from public.user_signins s where s.user_id=p.id) as sign_in_count,
          (select count(*) from public.saved_items si where si.user_id=p.id) as saved_count,
          (select dr.status from public.account_deletion_requests dr where dr.user_id=p.id order by dr.requested_at desc limit 1) as deletion_status,
          (select dr.requested_at from public.account_deletion_requests dr where dr.user_id=p.id order by dr.requested_at desc limit 1) as deletion_requested_at
        from public.profiles p
        join auth.users u on u.id=p.id
        left join public.user_presence pr on pr.user_id=p.id
        where p.account_status<>'deleted'
      ) x
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.admin_presence_dashboard() from public;
grant execute on function public.admin_presence_dashboard() to authenticated;

create or replace function public.admin_user_control(
  p_target_user uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_admin uuid:=auth.uid();
  v_action text:=lower(trim(coalesce(p_action,'')));
  v_reason text:=left(nullif(trim(p_reason),''),1000);
  v_target_email text;
  v_admin_last_sign_in timestamptz;
  v_result jsonb;
  v_revoked boolean:=false;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if p_target_user is null then raise exception 'Target user is required.'; end if;
  if p_target_user=v_admin then raise exception 'The official administrator account cannot be changed here.'; end if;

  select last_sign_in_at into v_admin_last_sign_in from auth.users where id=v_admin;
  if v_action in ('suspend','disable','revoke_sessions','erase_app_data')
     and (v_admin_last_sign_in is null or v_admin_last_sign_in < now()-interval '20 minutes') then
    raise exception 'Recent administrator sign-in required.';
  end if;

  select lower(coalesce(email,'')) into v_target_email from auth.users where id=p_target_user;
  if v_target_email is null then raise exception 'User not found.'; end if;
  if v_target_email='sportycodesofficial@gmail.com' then raise exception 'The official administrator account is protected.'; end if;

  if v_action='suspend' then
    update public.profiles set account_status='suspended',status_reason=coalesce(v_reason,'Suspended by administrator'),status_changed_at=now(),status_changed_by=v_admin where id=p_target_user;
  elsif v_action='restore' then
    update public.profiles set account_status='active',status_reason=null,status_changed_at=now(),status_changed_by=v_admin where id=p_target_user;
  elsif v_action='disable' then
    update public.profiles set account_status='disabled',status_reason=coalesce(v_reason,'Disabled by administrator'),status_changed_at=now(),status_changed_by=v_admin where id=p_target_user;
  elsif v_action='revoke_sessions' then
    null;
  elsif v_action='erase_app_data' then
    delete from public.saved_items where user_id=p_target_user;
    delete from public.user_preferences where user_id=p_target_user;
    delete from public.user_signins where user_id=p_target_user;
    delete from public.user_presence where user_id=p_target_user;
    update public.account_deletion_requests
      set status='completed',resolved_at=now(),updated_at=now(),resolved_by=v_admin,resolution_note=coalesce(v_reason,'Application data erased by administrator')
      where user_id=p_target_user and status in ('pending','reviewing');
    update public.profiles
      set display_name='Deleted member',username=null,account_status='deleted',status_reason='Application data erased',status_changed_at=now(),status_changed_by=v_admin
      where id=p_target_user;
  elsif v_action='review_deletion' then
    update public.account_deletion_requests
      set status='reviewing',updated_at=now(),resolved_by=v_admin,resolution_note=v_reason
      where user_id=p_target_user and status='pending';
  elsif v_action='reject_deletion' then
    update public.account_deletion_requests
      set status='rejected',updated_at=now(),resolved_at=now(),resolved_by=v_admin,resolution_note=v_reason
      where user_id=p_target_user and status in ('pending','reviewing');
    update public.profiles set account_status='active',status_reason=null,status_changed_at=now(),status_changed_by=v_admin where id=p_target_user and account_status='pending_deletion';
  else
    raise exception 'Unsupported action.';
  end if;

  if v_action in ('suspend','disable','revoke_sessions','erase_app_data') then
    update public.user_presence set signed_out_at=now(),last_seen_at=now(),updated_at=now() where user_id=p_target_user;
    begin
      delete from auth.sessions where user_id=p_target_user;
      v_revoked:=true;
    exception when others then
      v_revoked:=false;
    end;
  end if;

  v_result:=jsonb_build_object('ok',true,'action',v_action,'sessions_revoked',v_revoked,'target_user',p_target_user);
  insert into public.admin_action_log(admin_user_id,target_user_id,action,reason,result)
  values(v_admin,p_target_user,v_action,v_reason,v_result);
  return v_result;
end;
$$;

revoke all on function public.admin_user_control(uuid,text,text) from public;
grant execute on function public.admin_user_control(uuid,text,text) to authenticated;


create or replace function public.update_presence_location(
  p_approx_lat numeric default null,
  p_approx_lng numeric default null,
  p_location_permission text default 'not_requested'
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid:=auth.uid();
  v_permission text;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  v_permission:=case when p_location_permission in ('granted','denied','not_requested','unavailable') then p_location_permission else 'not_requested' end;
  update public.user_presence
  set approx_lat=case when p_approx_lat between -90 and 90 then round(p_approx_lat,1) else null end,
      approx_lng=case when p_approx_lng between -180 and 180 then round(p_approx_lng,1) else null end,
      location_permission=v_permission,
      updated_at=now()
  where user_id=v_user;
  insert into public.user_preferences(user_id,location_opt_in,updated_at)
  values(v_user,(v_permission='granted'),now())
  on conflict(user_id) do update
  set location_opt_in=excluded.location_opt_in,updated_at=now();
  return jsonb_build_object('ok',true,'permission',v_permission);
end;
$$;

revoke all on function public.update_presence_location(numeric,numeric,text) from public;
grant execute on function public.update_presence_location(numeric,numeric,text) to authenticated;

commit;
