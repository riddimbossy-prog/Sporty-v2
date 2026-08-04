-- sporty.codes v19.8.2
-- Locks all administrator authorization to the verified official account.
-- Run after 002_auth_presence_admin.sql.

begin;

alter table public.profiles
  add column if not exists role text not null default 'user';

-- Remove any earlier test administrators. The approved account is promoted
-- immediately when it already exists; otherwise current_user_access() syncs it
-- on the first successful sign-in.
update public.profiles set role='user' where role='admin';

update public.profiles p
set role='admin'
from auth.users u
where p.id=u.id
  and lower(coalesce(u.email,''))='sportycodesofficial@gmail.com'
  and u.email_confirmed_at is not null;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
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

create or replace function public.current_user_access()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_admin boolean := false;
begin
  if v_user is null then
    return jsonb_build_object('authenticated',false,'is_admin',false,'role','guest');
  end if;

  v_admin := public.is_admin();

  update public.profiles
  set role=case when v_admin then 'admin' else 'user' end
  where id=v_user
    and role is distinct from case when v_admin then 'admin' else 'user' end;

  return jsonb_build_object(
    'authenticated',true,
    'is_admin',v_admin,
    'role',case when v_admin then 'admin' else 'user' end
  );
end;
$$;

revoke all on function public.current_user_access() from public;
grant execute on function public.current_user_access() to authenticated;

commit;
