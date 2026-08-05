-- sporty.codes v21.7.3 auth repair
-- Safe, idempotent account foundation for the custom-API build.
-- This migration intentionally creates no wallet, deposit, payment or wagering tables.

begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Member',
  username text unique,
  verified boolean not null default false,
  role text not null default 'user',
  account_status text not null default 'active',
  status_reason text,
  status_changed_at timestamptz,
  status_changed_by uuid,
  profile_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists display_name text not null default 'Member',
  add column if not exists username text,
  add column if not exists verified boolean not null default false,
  add column if not exists role text not null default 'user',
  add column if not exists account_status text not null default 'active',
  add column if not exists status_reason text,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid,
  add column if not exists profile_updated_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists profiles_username_unique_idx
  on public.profiles(lower(username)) where username is not null;

create table if not exists public.user_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  session_started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  signed_out_at timestamptz,
  current_path text not null default '/',
  timezone text,
  language text,
  device_type text,
  browser_name text,
  os_name text,
  auth_provider text,
  approx_lat numeric(4,1),
  approx_lng numeric(4,1),
  location_permission text not null default 'not_requested',
  updated_at timestamptz not null default now()
);

create table if not exists public.user_signins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  signed_in_at timestamptz not null default now(),
  signed_out_at timestamptz,
  timezone text,
  language text,
  device_type text,
  browser_name text,
  os_name text,
  auth_provider text,
  approx_lat numeric(4,1),
  approx_lng numeric(4,1),
  location_permission text not null default 'not_requested',
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists user_presence_last_seen_idx
  on public.user_presence(last_seen_at desc);
create index if not exists user_signins_user_time_idx
  on public.user_signins(user_id,signed_in_at desc);

create table if not exists public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  favorite_markets text[] not null default '{}',
  favorite_leagues text[] not null default '{}',
  min_tip_strength integer not null default 65,
  max_opposition numeric(5,2) not null default 30,
  min_sources integer not null default 2,
  odds_min numeric(8,2) not null default 1.10,
  odds_max numeric(8,2) not null default 5.00,
  preferred_day text not null default 'all',
  location_opt_in boolean not null default false,
  notifications_opt_in boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_type text not null,
  item_key text not null,
  title text not null,
  subtitle text,
  item_status text not null default 'saved',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,item_type,item_key)
);

create or replace function public.touch_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at=now();
  new.profile_updated_at=now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_profile_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_display_name text;
  v_base text;
  v_username text;
begin
  v_display_name:=coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'),''),
    nullif(trim(new.raw_user_meta_data->>'full_name'),''),
    nullif(split_part(coalesce(new.email,''),'@',1),''),
    'Member'
  );
  v_base:=lower(regexp_replace(coalesce(
    nullif(trim(new.raw_user_meta_data->>'username'),''),
    nullif(split_part(coalesce(new.email,''),'@',1),''),
    'member'
  ),'[^a-zA-Z0-9_]+','_','g'));
  v_base:=trim(both '_' from v_base);
  if v_base='' then v_base:='member'; end if;
  v_username:=left(v_base,18)||'_'||substr(new.id::text,1,7);

  insert into public.profiles(id,display_name,username,role,account_status)
  values(new.id,left(v_display_name,80),left(v_username,28),'user','active')
  on conflict(id) do update set
    display_name=case when public.profiles.display_name in ('Member','New user','') then excluded.display_name else public.profiles.display_name end,
    username=coalesce(public.profiles.username,excluded.username),
    updated_at=now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles(id,display_name,username,role,account_status)
select
  u.id,
  left(coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'),''),nullif(trim(u.raw_user_meta_data->>'full_name'),''),nullif(split_part(coalesce(u.email,''),'@',1),''),'Member'),80),
  left(lower(regexp_replace(coalesce(nullif(split_part(coalesce(u.email,''),'@',1),''),'member'),'[^a-zA-Z0-9_]+','_','g')),18)||'_'||substr(u.id::text,1,7),
  'user',
  'active'
from auth.users u
where not exists(select 1 from public.profiles p where p.id=u.id)
on conflict(id) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin');
$$;

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

  insert into public.profiles(id,display_name,username,role,account_status)
  select
    u.id,
    left(coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'),''),nullif(trim(u.raw_user_meta_data->>'full_name'),''),nullif(split_part(coalesce(u.email,''),'@',1),''),'Member'),80),
    left(lower(regexp_replace(coalesce(nullif(split_part(coalesce(u.email,''),'@',1),''),'member'),'[^a-zA-Z0-9_]+','_','g')),18)||'_'||substr(u.id::text,1,7),
    'user','active'
  from auth.users u where u.id=v_user
  on conflict(id) do nothing;

  select role='admin',coalesce(account_status,'active')
  into v_admin,v_status
  from public.profiles where id=v_user;

  return jsonb_build_object(
    'authenticated',true,
    'is_admin',coalesce(v_admin,false),
    'role',case when coalesce(v_admin,false) then 'admin' else 'user' end,
    'account_status',coalesce(v_status,'active'),
    'is_allowed',(coalesce(v_admin,false) or coalesce(v_status,'active') in ('active','pending_deletion'))
  );
end;
$$;

create or replace function public.record_user_sign_in(
  p_timezone text default null,
  p_language text default null,
  p_device_type text default null,
  p_browser_name text default null,
  p_os_name text default null,
  p_auth_provider text default null,
  p_approx_lat numeric default null,
  p_approx_lng numeric default null,
  p_location_permission text default 'not_requested',
  p_current_path text default '/',
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid:=auth.uid();
  v_signin_id uuid;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  perform public.current_user_access();

  insert into public.user_signins(
    user_id,timezone,language,device_type,browser_name,os_name,auth_provider,
    location_permission,user_agent
  ) values (
    v_user,left(p_timezone,80),left(p_language,40),left(p_device_type,30),left(p_browser_name,40),left(p_os_name,40),left(p_auth_provider,40),
    'not_requested',left(p_user_agent,500)
  ) returning id into v_signin_id;

  insert into public.user_presence(
    user_id,session_started_at,last_seen_at,signed_out_at,current_path,timezone,language,
    device_type,browser_name,os_name,auth_provider,location_permission,updated_at
  ) values (
    v_user,now(),now(),null,left(coalesce(p_current_path,'/'),200),left(p_timezone,80),left(p_language,40),
    left(p_device_type,30),left(p_browser_name,40),left(p_os_name,40),left(p_auth_provider,40),'not_requested',now()
  ) on conflict(user_id) do update set
    session_started_at=excluded.session_started_at,
    last_seen_at=now(),
    signed_out_at=null,
    current_path=excluded.current_path,
    timezone=excluded.timezone,
    language=excluded.language,
    device_type=excluded.device_type,
    browser_name=excluded.browser_name,
    os_name=excluded.os_name,
    auth_provider=excluded.auth_provider,
    location_permission='not_requested',
    updated_at=now();

  return jsonb_build_object('ok',true,'signin_id',v_signin_id);
end;
$$;

create or replace function public.heartbeat_user_presence(
  p_current_path text default '/',
  p_timezone text default null,
  p_language text default null,
  p_device_type text default null,
  p_browser_name text default null,
  p_os_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  perform public.current_user_access();
  insert into public.user_presence(
    user_id,last_seen_at,signed_out_at,current_path,timezone,language,device_type,browser_name,os_name,updated_at
  ) values (
    v_user,now(),null,left(coalesce(p_current_path,'/'),200),left(p_timezone,80),left(p_language,40),left(p_device_type,30),left(p_browser_name,40),left(p_os_name,40),now()
  ) on conflict(user_id) do update set
    last_seen_at=now(),signed_out_at=null,current_path=excluded.current_path,
    timezone=coalesce(excluded.timezone,public.user_presence.timezone),
    language=coalesce(excluded.language,public.user_presence.language),
    device_type=coalesce(excluded.device_type,public.user_presence.device_type),
    browser_name=coalesce(excluded.browser_name,public.user_presence.browser_name),
    os_name=coalesce(excluded.os_name,public.user_presence.os_name),updated_at=now();
  return jsonb_build_object('ok',true,'last_seen_at',now());
end;
$$;

create or replace function public.record_user_sign_out()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid:=auth.uid();
begin
  if v_user is null then return jsonb_build_object('ok',false); end if;
  update public.user_presence set signed_out_at=now(),last_seen_at=now(),updated_at=now() where user_id=v_user;
  update public.user_signins set signed_out_at=now()
  where id=(select id from public.user_signins where user_id=v_user and signed_out_at is null order by signed_in_at desc limit 1);
  return jsonb_build_object('ok',true);
end;
$$;

alter table public.profiles enable row level security;
alter table public.user_presence enable row level security;
alter table public.user_signins enable row level security;
alter table public.user_preferences enable row level security;
alter table public.saved_items enable row level security;

drop policy if exists profiles_read_own_or_admin on public.profiles;
create policy profiles_read_own_or_admin on public.profiles
for select using(id=auth.uid() or public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update using(id=auth.uid()) with check(id=auth.uid());

drop policy if exists presence_read_own_or_admin on public.user_presence;
create policy presence_read_own_or_admin on public.user_presence
for select using(user_id=auth.uid() or public.is_admin());

drop policy if exists presence_write_own on public.user_presence;
create policy presence_write_own on public.user_presence
for all using(user_id=auth.uid()) with check(user_id=auth.uid());

drop policy if exists signins_read_own_or_admin on public.user_signins;
create policy signins_read_own_or_admin on public.user_signins
for select using(user_id=auth.uid() or public.is_admin());

drop policy if exists signins_insert_own on public.user_signins;
create policy signins_insert_own on public.user_signins
for insert with check(user_id=auth.uid());

drop policy if exists preferences_own on public.user_preferences;
create policy preferences_own on public.user_preferences
for all using(user_id=auth.uid()) with check(user_id=auth.uid());

drop policy if exists saved_items_own on public.saved_items;
create policy saved_items_own on public.saved_items
for all using(user_id=auth.uid()) with check(user_id=auth.uid());

revoke all on function public.is_admin() from public;
revoke all on function public.current_user_access() from public;
revoke all on function public.record_user_sign_in(text,text,text,text,text,text,numeric,numeric,text,text,text) from public;
revoke all on function public.heartbeat_user_presence(text,text,text,text,text,text) from public;
revoke all on function public.record_user_sign_out() from public;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_user_access() to authenticated;
grant execute on function public.record_user_sign_in(text,text,text,text,text,text,numeric,numeric,text,text,text) to authenticated;
grant execute on function public.heartbeat_user_presence(text,text,text,text,text,text) to authenticated;
grant execute on function public.record_user_sign_out() to authenticated;

grant select on public.profiles to authenticated;
grant update(display_name,username) on public.profiles to authenticated;
grant select,insert,update on public.user_presence to authenticated;
grant select,insert on public.user_signins to authenticated;
grant select,insert,update,delete on public.user_preferences,public.saved_items to authenticated;

commit;
