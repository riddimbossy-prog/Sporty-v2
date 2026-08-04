-- sporty.codes v20.5.0
-- Member onboarding, preference matching, in-app digest controls and synced recent codes.
-- Run after 005_remove_member_location_data.sql.

begin;

alter table public.user_preferences
  add column if not exists selections_min integer not null default 1,
  add column if not exists selections_max integer not null default 20,
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists age_confirmed_at timestamptz,
  add column if not exists digest_frequency text not null default 'off',
  add column if not exists last_digest_seen_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='user_preferences_selection_range_check'
      and conrelid='public.user_preferences'::regclass
  ) then
    alter table public.user_preferences
      add constraint user_preferences_selection_range_check
      check (
        selections_min between 1 and 100
        and selections_max between selections_min and 100
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='user_preferences_digest_frequency_check'
      and conrelid='public.user_preferences'::regclass
  ) then
    alter table public.user_preferences
      add constraint user_preferences_digest_frequency_check
      check (digest_frequency in ('off','daily','weekly'));
  end if;
end $$;

create table if not exists public.recent_items (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_type text not null default 'code' check (item_type in ('code','tip','match')),
  item_key text not null,
  title text not null,
  subtitle text,
  payload jsonb not null default '{}'::jsonb,
  viewed_at timestamptz not null default now(),
  primary key(user_id,item_type,item_key)
);

create index if not exists recent_items_user_viewed_idx
  on public.recent_items(user_id,viewed_at desc);

alter table public.recent_items enable row level security;

drop policy if exists recent_items_own on public.recent_items;
create policy recent_items_own on public.recent_items
for all using (user_id=auth.uid()) with check (user_id=auth.uid());

revoke all on public.recent_items from anon;
grant select,insert,update,delete on public.recent_items to authenticated;

commit;
