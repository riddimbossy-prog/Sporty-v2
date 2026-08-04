-- sporty.codes v19.7 account, presence and admin audience dashboard
-- Run after 001_marketplace.sql. Safe to run more than once.

create extension if not exists pgcrypto;

-- Ensure the role column exists on older projects.
alter table public.profiles
  add column if not exists role text not null default 'user';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('user','admin'));
  end if;
end $$;

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
  location_permission text not null default 'not_requested'
    check (location_permission in ('granted','denied','not_requested','unavailable')),
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
  location_permission text not null default 'not_requested'
    check (location_permission in ('granted','denied','not_requested','unavailable')),
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists user_presence_last_seen_idx
  on public.user_presence(last_seen_at desc);
create index if not exists user_signins_user_time_idx
  on public.user_signins(user_id,signed_in_at desc);
create index if not exists user_signins_time_idx
  on public.user_signins(signed_in_at desc);

alter table public.user_presence enable row level security;
alter table public.user_signins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Replace the old public profile policy with account-private access.
drop policy if exists profiles_public_read on public.profiles;
drop policy if exists profiles_read_own_or_admin on public.profiles;
create policy profiles_read_own_or_admin on public.profiles
for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update using (id = auth.uid()) with check (id = auth.uid());

-- Users may edit public-facing profile fields, but can never promote their own role.
revoke update on public.profiles from anon, authenticated;
grant update(display_name,username) on public.profiles to authenticated;

drop policy if exists presence_read_own_or_admin on public.user_presence;
create policy presence_read_own_or_admin on public.user_presence
for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists presence_write_own on public.user_presence;
create policy presence_write_own on public.user_presence
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists signins_read_own_or_admin on public.user_signins;
create policy signins_read_own_or_admin on public.user_signins
for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists signins_insert_own on public.user_signins;
create policy signins_insert_own on public.user_signins
for insert with check (user_id = auth.uid());

-- Records one new authenticated session and updates current presence.
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
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_signin_id uuid;
  v_permission text;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  v_permission := case when p_location_permission in ('granted','denied','not_requested','unavailable')
    then p_location_permission else 'not_requested' end;

  insert into public.user_signins(
    user_id,timezone,language,device_type,browser_name,os_name,auth_provider,
    approx_lat,approx_lng,location_permission,user_agent
  ) values (
    v_user,left(p_timezone,80),left(p_language,40),left(p_device_type,30),left(p_browser_name,40),left(p_os_name,40),left(p_auth_provider,40),
    case when p_approx_lat between -90 and 90 then round(p_approx_lat,1) else null end,
    case when p_approx_lng between -180 and 180 then round(p_approx_lng,1) else null end,
    v_permission,left(p_user_agent,500)
  ) returning id into v_signin_id;

  insert into public.user_presence(
    user_id,session_started_at,last_seen_at,signed_out_at,current_path,timezone,language,
    device_type,browser_name,os_name,auth_provider,approx_lat,approx_lng,location_permission,updated_at
  ) values (
    v_user,now(),now(),null,left(coalesce(p_current_path,'/'),200),left(p_timezone,80),left(p_language,40),
    left(p_device_type,30),left(p_browser_name,40),left(p_os_name,40),left(p_auth_provider,40),
    case when p_approx_lat between -90 and 90 then round(p_approx_lat,1) else null end,
    case when p_approx_lng between -180 and 180 then round(p_approx_lng,1) else null end,
    v_permission,now()
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
    approx_lat=coalesce(excluded.approx_lat,public.user_presence.approx_lat),
    approx_lng=coalesce(excluded.approx_lng,public.user_presence.approx_lng),
    location_permission=excluded.location_permission,
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
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
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
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then return jsonb_build_object('ok',false); end if;
  update public.user_presence set signed_out_at=now(),last_seen_at=now(),updated_at=now() where user_id=v_user;
  update public.user_signins set signed_out_at=now()
  where id=(select id from public.user_signins where user_id=v_user and signed_out_at is null order by signed_in_at desc limit 1);
  return jsonb_build_object('ok',true);
end;
$$;

-- Admin-only summary. Exact email is visible only to an authenticated admin.
create or replace function public.admin_presence_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;

  select jsonb_build_object(
    'generated_at',now(),
    'online_window_seconds',120,
    'total_users',(select count(*) from public.profiles),
    'online_users',(select count(*) from public.user_presence where signed_out_at is null and last_seen_at > now()-interval '120 seconds'),
    'signed_in_today',(select count(distinct user_id) from public.user_signins where signed_in_at >= date_trunc('day',now())),
    'new_users_7d',(select count(*) from public.profiles where created_at >= now()-interval '7 days'),
    'users',coalesce((
      select jsonb_agg(row_to_json(x) order by x.is_online desc,x.last_seen_at desc nulls last,x.created_at desc)
      from (
        select
          p.id,
          p.display_name,
          u.email,
          p.role,
          p.created_at,
          pr.session_started_at,
          pr.last_seen_at,
          pr.signed_out_at,
          (pr.signed_out_at is null and pr.last_seen_at > now()-interval '120 seconds') as is_online,
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
          (select count(*) from public.user_signins s where s.user_id=p.id) as sign_in_count
        from public.profiles p
        join auth.users u on u.id=p.id
        left join public.user_presence pr on pr.user_id=p.id
      ) x
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.record_user_sign_in(text,text,text,text,text,text,numeric,numeric,text,text,text) from public;
revoke all on function public.heartbeat_user_presence(text,text,text,text,text,text) from public;
revoke all on function public.record_user_sign_out() from public;
revoke all on function public.admin_presence_dashboard() from public;

grant execute on function public.record_user_sign_in(text,text,text,text,text,text,numeric,numeric,text,text,text) to authenticated;
grant execute on function public.heartbeat_user_presence(text,text,text,text,text,text) to authenticated;
grant execute on function public.record_user_sign_out() to authenticated;
grant execute on function public.admin_presence_dashboard() to authenticated;

grant select,insert,update on public.user_presence to authenticated;
grant select,insert on public.user_signins to authenticated;
