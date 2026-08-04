-- sporty.codes v21.4.0
-- Parse-free custom API cache, booking-code store and request controls.
-- Run after 006_member_personalization.sql.

begin;

create table if not exists public.api_cache (
  cache_key text primary key,
  payload jsonb not null default '{}'::jsonb,
  source text not null default 'custom-api',
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists api_cache_expiry_idx on public.api_cache(expires_at);

create table if not exists public.booking_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null default 'Public code',
  total_odds numeric(12,2),
  selections_count integer not null default 0 check (selections_count between 0 and 100),
  author text not null default 'sporty.codes',
  category text not null default 'Code Hub',
  status text not null default 'draft' check (status in ('draft','published','expired','hidden')),
  result text check (result is null or result in ('won','lost','void','pending')),
  source_url text,
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists booking_codes_public_idx on public.booking_codes(status,published_at desc,created_at desc);

create table if not exists public.booking_code_selections (
  id uuid primary key default gen_random_uuid(),
  booking_code_id uuid not null references public.booking_codes(id) on delete cascade,
  position integer not null default 1,
  fixture text not null,
  market text not null,
  pick text not null,
  odds numeric(10,2),
  league text,
  kickoff timestamptz,
  result text,
  created_at timestamptz not null default now(),
  unique(booking_code_id,position)
);
create index if not exists booking_code_selections_code_idx on public.booking_code_selections(booking_code_id,position);

create table if not exists public.api_request_usage (
  usage_day date not null,
  provider text not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key(usage_day,provider)
);

alter table public.api_cache enable row level security;
alter table public.booking_codes enable row level security;
alter table public.booking_code_selections enable row level security;
alter table public.api_request_usage enable row level security;

create or replace function public.reserve_api_request(
  p_provider text,
  p_cost integer,
  p_daily_limit integer
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count integer;
begin
  if p_provider is null or trim(p_provider)='' then raise exception 'Provider is required.'; end if;
  if p_cost is null or p_cost<1 then raise exception 'Cost must be positive.'; end if;
  if p_daily_limit is null or p_daily_limit<1 then raise exception 'Daily limit must be positive.'; end if;

  insert into public.api_request_usage(usage_day,provider,request_count,updated_at)
  values(current_date,lower(trim(p_provider)),0,now())
  on conflict (usage_day,provider) do nothing;

  update public.api_request_usage
  set request_count=request_count+p_cost,updated_at=now()
  where usage_day=current_date
    and provider=lower(trim(p_provider))
    and request_count+p_cost<=p_daily_limit
  returning request_count into v_count;

  return v_count is not null;
end;
$$;

revoke all on function public.reserve_api_request(text,integer,integer) from public,anon,authenticated;

-- Public clients may read only published code content. The custom server uses
-- the service-role key for cache writes, admin writes and usage accounting.
drop policy if exists booking_codes_public_read on public.booking_codes;
create policy booking_codes_public_read on public.booking_codes
for select using (status='published' and (expires_at is null or expires_at>now()));

drop policy if exists booking_code_selections_public_read on public.booking_code_selections;
create policy booking_code_selections_public_read on public.booking_code_selections
for select using (
  exists(
    select 1 from public.booking_codes c
    where c.id=booking_code_id
      and c.status='published'
      and (c.expires_at is null or c.expires_at>now())
  )
);

revoke all on public.api_cache,public.api_request_usage from anon,authenticated;
grant select on public.booking_codes,public.booking_code_selections to anon,authenticated;

create or replace function public.touch_booking_code_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at=now();
  return new;
end;
$$;

drop trigger if exists booking_codes_touch_updated_at on public.booking_codes;
create trigger booking_codes_touch_updated_at
before update on public.booking_codes
for each row execute function public.touch_booking_code_updated_at();

commit;
