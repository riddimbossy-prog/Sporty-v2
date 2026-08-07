-- sporty.codes v21.7.3 admin access repair
-- Restores the official-admin identity lock after the auth-repair migration.
-- Safe and idempotent. The confirmed official email is the source of truth.

begin;

-- Ensure the official account has a profile row when it already exists in Auth.
insert into public.profiles(id,display_name,role,account_status)
select
  u.id,
  left(coalesce(
    nullif(trim(u.raw_user_meta_data->>'display_name'),''),
    nullif(trim(u.raw_user_meta_data->>'full_name'),''),
    nullif(split_part(coalesce(u.email,''),'@',1),''),
    'sporty.codes administrator'
  ),80),
  'admin',
  'active'
from auth.users u
where lower(coalesce(u.email,''))='sportycodesofficial@gmail.com'
  and u.email_confirmed_at is not null
on conflict(id) do update set
  role='admin',
  updated_at=now();

-- Keep the single-official-admin model: no other profile may retain admin role.
update public.profiles p
set role='user',updated_at=now()
where p.role='admin'
  and not exists(
    select 1
    from auth.users u
    where u.id=p.id
      and lower(coalesce(u.email,''))='sportycodesofficial@gmail.com'
      and u.email_confirmed_at is not null
  );

-- Admin authorization must not depend on a mutable profile role. It is derived
-- directly from the currently authenticated, confirmed Auth identity.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path=public,auth
as $$
  select exists(
    select 1
    from auth.users u
    where u.id=auth.uid()
      and lower(coalesce(u.email,''))='sportycodesofficial@gmail.com'
      and u.email_confirmed_at is not null
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Rebuild the access RPC so it both recognizes the official identity and keeps
-- the profile role synchronized for the rest of the admin UI/RLS policies.
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
    return jsonb_build_object(
      'authenticated',false,
      'is_admin',false,
      'role','guest',
      'account_status','guest',
      'is_allowed',false
    );
  end if;

  -- Backfill a missing profile without granting admin from profile data.
  insert into public.profiles(id,display_name,role,account_status)
  select
    u.id,
    left(coalesce(
      nullif(trim(u.raw_user_meta_data->>'display_name'),''),
      nullif(trim(u.raw_user_meta_data->>'full_name'),''),
      nullif(split_part(coalesce(u.email,''),'@',1),''),
      'Member'
    ),80),
    'user',
    'active'
  from auth.users u
  where u.id=v_user
  on conflict(id) do nothing;

  v_admin:=public.is_admin();

  select coalesce(account_status,'active')
  into v_status
  from public.profiles
  where id=v_user;

  if v_status is null then v_status:='active'; end if;

  update public.profiles
  set role=case when v_admin then 'admin' else 'user' end,
      profile_updated_at=now(),
      updated_at=now()
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

commit;
