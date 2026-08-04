-- sporty.codes v15 marketplace foundation
-- Run in Supabase SQL Editor on a new project.
-- This migration uses DEMO wallet credits only. Do not use demo_top_up in production.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'New user',
  username text not null unique,
  verified boolean not null default false,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  currency text not null default 'GHS',
  balance numeric(14,2) not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.seller_wallets (
  seller_id uuid primary key references public.profiles(id) on delete cascade,
  currency text not null default 'GHS',
  pending_balance numeric(14,2) not null default 0 check (pending_balance >= 0),
  available_balance numeric(14,2) not null default 0 check (available_balance >= 0),
  lifetime_earned numeric(14,2) not null default 0 check (lifetime_earned >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  source text not null default 'marketplace' check (source in ('official','marketplace')),
  title text not null check (char_length(title) between 3 and 80),
  category text not null default 'Other',
  odds numeric(10,2) not null check (odds between 1.01 and 1000),
  selections integer not null check (selections between 1 and 40),
  hit_probability numeric(5,2) not null default 0 check (hit_probability between 0 and 100),
  avg_odds_per_leg numeric(10,2) not null default 0,
  edge numeric(7,2) not null default 0,
  note text not null default '' check (char_length(note) <= 300),
  price numeric(12,2) not null default 0 check (price >= 0),
  currency text not null default 'GHS',
  status text not null default 'approved' check (status in ('draft','pending','approved','rejected','suspended','expired')),
  matches_status text not null default 'upcoming' check (matches_status in ('upcoming','live','settled','expired')),
  expires_at timestamptz not null,
  purchase_count integer not null default 0 check (purchase_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listing_secrets (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  booking_code text not null check (char_length(booking_code) between 4 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  listing_id uuid not null references public.listings(id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  price numeric(12,2) not null check (price >= 0),
  currency text not null default 'GHS',
  platform_fee numeric(12,2) not null default 0 check (platform_fee >= 0),
  seller_earning numeric(12,2) not null default 0 check (seller_earning >= 0),
  created_at timestamptz not null default now(),
  unique (buyer_id, listing_id)
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('demo_credit','deposit','purchase','refund','adjustment')),
  amount numeric(14,2) not null,
  balance_after numeric(14,2) not null check (balance_after >= 0),
  reference_type text,
  reference_id uuid,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists listings_status_expires_idx on public.listings(status,matches_status,expires_at);
create index if not exists listings_seller_idx on public.listings(seller_id,created_at desc);
create index if not exists purchases_buyer_idx on public.purchases(buyer_id,created_at desc);
create index if not exists purchases_seller_idx on public.purchases(seller_id,created_at desc);
create index if not exists wallet_transactions_user_idx on public.wallet_transactions(user_id,created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists listings_touch_updated_at on public.listings;
create trigger listings_touch_updated_at before update on public.listings
for each row execute function public.touch_updated_at();

drop trigger if exists listing_secrets_touch_updated_at on public.listing_secrets;
create trigger listing_secrets_touch_updated_at before update on public.listing_secrets
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
  v_username text;
begin
  v_display_name := coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''), split_part(new.email,'@',1), 'New user');
  v_username := lower(regexp_replace(coalesce(nullif(trim(new.raw_user_meta_data->>'username'),''), split_part(new.email,'@',1), 'user'), '[^a-zA-Z0-9_]+', '_', 'g'));
  v_username := trim(both '_' from v_username);
  if v_username = '' then v_username := 'user'; end if;
  if exists(select 1 from public.profiles where username=v_username) then
    v_username := left(v_username,20) || '_' || substr(new.id::text,1,7);
  end if;

  insert into public.profiles(id,display_name,username)
  values(new.id,left(v_display_name,80),left(v_username,28));

  insert into public.wallets(user_id,currency,balance) values(new.id,'GHS',0);
  insert into public.seller_wallets(seller_id,currency) values(new.id,'GHS');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.seller_wallets enable row level security;
alter table public.listings enable row level security;
alter table public.listing_secrets enable row level security;
alter table public.purchases enable row level security;
alter table public.wallet_transactions enable row level security;

-- Re-runnable policy definitions.
drop policy if exists profiles_public_read on public.profiles;
create policy profiles_public_read on public.profiles for select using (true);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update using (auth.uid()=id) with check (auth.uid()=id);

drop policy if exists wallets_read_own on public.wallets;
create policy wallets_read_own on public.wallets for select using (auth.uid()=user_id);

drop policy if exists seller_wallets_read_own on public.seller_wallets;
create policy seller_wallets_read_own on public.seller_wallets for select using (auth.uid()=seller_id);

drop policy if exists listings_public_and_owner_read on public.listings;
create policy listings_public_and_owner_read on public.listings for select using (
  status='approved' or seller_id=auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
);

drop policy if exists purchases_participant_read on public.purchases;
create policy purchases_participant_read on public.purchases for select using (
  buyer_id=auth.uid() or seller_id=auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
);

drop policy if exists wallet_transactions_read_own on public.wallet_transactions;
create policy wallet_transactions_read_own on public.wallet_transactions for select using (auth.uid()=user_id);

-- listing_secrets intentionally has no direct read policy.
-- Codes can only be returned by reveal_listing_code().

grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.listings to anon, authenticated;
grant select on public.wallets, public.seller_wallets, public.purchases, public.wallet_transactions to authenticated;
revoke all on public.listing_secrets from anon, authenticated;

create or replace function public.demo_top_up(p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_balance numeric(14,2);
begin
  if v_user is null then raise exception 'Sign in to add demo credit.'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 5000 then raise exception 'Demo top-up must be between GH₵1 and GH₵5,000.'; end if;

  insert into public.wallets(user_id,currency,balance) values(v_user,'GHS',0)
  on conflict(user_id) do nothing;

  select balance into v_balance from public.wallets where user_id=v_user for update;
  v_balance := round(v_balance + p_amount,2);
  update public.wallets set balance=v_balance,updated_at=now() where user_id=v_user;

  insert into public.wallet_transactions(user_id,kind,amount,balance_after,note)
  values(v_user,'demo_credit',round(p_amount,2),v_balance,'Prototype wallet credit');

  return jsonb_build_object('balance',v_balance);
end;
$$;

create or replace function public.create_listing(
  p_title text,
  p_category text,
  p_odds numeric,
  p_selections integer,
  p_price numeric,
  p_expires_at timestamptz,
  p_code text,
  p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_listing_id uuid;
  v_average numeric(10,2);
begin
  if v_user is null then raise exception 'Sign in to publish a listing.'; end if;
  if char_length(trim(coalesce(p_title,''))) not between 3 and 80 then raise exception 'Title must contain 3 to 80 characters.'; end if;
  if p_odds is null or p_odds < 1.01 or p_odds > 1000 then raise exception 'Odds must be between 1.01 and 1000.'; end if;
  if p_selections is null or p_selections < 1 or p_selections > 40 then raise exception 'Selections must be between 1 and 40.'; end if;
  if p_price is null or p_price < 0 or p_price > 10000 then raise exception 'Price must be between GH₵0 and GH₵10,000.'; end if;
  if p_expires_at is null or p_expires_at <= now() then raise exception 'Expiry must be in the future.'; end if;
  if char_length(trim(coalesce(p_code,''))) not between 4 and 40 then raise exception 'Booking code must contain 4 to 40 characters.'; end if;
  if char_length(coalesce(p_note,'')) > 300 then raise exception 'Buyer note is too long.'; end if;

  v_average := round(power(p_odds::numeric,1.0/p_selections)::numeric,2);

  insert into public.listings(
    seller_id,source,title,category,odds,selections,avg_odds_per_leg,note,price,currency,status,matches_status,expires_at
  ) values(
    v_user,'marketplace',trim(p_title),coalesce(nullif(trim(p_category),''),'Other'),round(p_odds,2),p_selections,v_average,
    trim(coalesce(p_note,'')),round(p_price,2),'GHS','approved','upcoming',p_expires_at
  ) returning id into v_listing_id;

  insert into public.listing_secrets(listing_id,booking_code) values(v_listing_id,trim(p_code));
  return v_listing_id;
end;
$$;

create or replace function public.purchase_listing(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_listing public.listings%rowtype;
  v_balance numeric(14,2);
  v_price numeric(12,2);
  v_fee numeric(12,2);
  v_earning numeric(12,2);
  v_purchase_id uuid;
begin
  if v_user is null then raise exception 'Sign in to buy a code.'; end if;

  select * into v_listing from public.listings where id=p_listing_id for update;
  if not found then raise exception 'Listing not found.'; end if;
  if v_listing.status <> 'approved' or v_listing.matches_status <> 'upcoming' or v_listing.expires_at <= now() then
    raise exception 'This listing is no longer available.';
  end if;
  if v_listing.seller_id=v_user then raise exception 'You cannot buy your own listing.'; end if;

  select id into v_purchase_id from public.purchases where buyer_id=v_user and listing_id=p_listing_id;
  if v_purchase_id is not null then
    select balance into v_balance from public.wallets where user_id=v_user;
    return jsonb_build_object('purchase_id',v_purchase_id,'balance',coalesce(v_balance,0),'already_owned',true);
  end if;

  insert into public.wallets(user_id,currency,balance) values(v_user,'GHS',0)
  on conflict(user_id) do nothing;
  select balance into v_balance from public.wallets where user_id=v_user for update;

  v_price := round(v_listing.price,2);
  if v_balance < v_price then raise exception 'Your wallet balance is too low.'; end if;
  v_fee := round(v_price*0.10,2);
  v_earning := round(v_price-v_fee,2);
  v_balance := round(v_balance-v_price,2);

  update public.wallets set balance=v_balance,updated_at=now() where user_id=v_user;

  insert into public.purchases(buyer_id,listing_id,seller_id,price,currency,platform_fee,seller_earning)
  values(v_user,v_listing.id,v_listing.seller_id,v_price,v_listing.currency,v_fee,v_earning)
  returning id into v_purchase_id;

  insert into public.seller_wallets(seller_id,currency,available_balance,lifetime_earned)
  values(v_listing.seller_id,v_listing.currency,v_earning,v_earning)
  on conflict(seller_id) do update set
    available_balance=public.seller_wallets.available_balance+excluded.available_balance,
    lifetime_earned=public.seller_wallets.lifetime_earned+excluded.lifetime_earned,
    updated_at=now();

  update public.listings set purchase_count=purchase_count+1 where id=v_listing.id;

  insert into public.wallet_transactions(user_id,kind,amount,balance_after,reference_type,reference_id,note)
  values(v_user,'purchase',-v_price,v_balance,'purchase',v_purchase_id,'Purchased '||v_listing.title);

  return jsonb_build_object('purchase_id',v_purchase_id,'balance',v_balance,'already_owned',false);
end;
$$;

create or replace function public.reveal_listing_code(p_listing_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_listing public.listings%rowtype;
  v_code text;
  v_allowed boolean;
begin
  if v_user is null then raise exception 'Sign in to reveal a code.'; end if;
  select * into v_listing from public.listings where id=p_listing_id;
  if not found then raise exception 'Listing not found.'; end if;
  if v_listing.status <> 'approved' or v_listing.matches_status <> 'upcoming' or v_listing.expires_at <= now() then
    raise exception 'This code is no longer active.';
  end if;

  v_allowed := v_listing.price=0 or v_listing.seller_id=v_user or exists(
    select 1 from public.purchases where buyer_id=v_user and listing_id=p_listing_id
  );
  if not v_allowed then raise exception 'Purchase this code before revealing it.'; end if;

  select booking_code into v_code from public.listing_secrets where listing_id=p_listing_id;
  if v_code is null then raise exception 'Booking code is unavailable.'; end if;
  return v_code;
end;
$$;

revoke all on function public.demo_top_up(numeric) from public, anon;
revoke all on function public.create_listing(text,text,numeric,integer,numeric,timestamptz,text,text) from public, anon;
revoke all on function public.purchase_listing(uuid) from public, anon;
revoke all on function public.reveal_listing_code(uuid) from public, anon;

grant execute on function public.demo_top_up(numeric) to authenticated;
grant execute on function public.create_listing(text,text,numeric,integer,numeric,timestamptz,text,text) to authenticated;
grant execute on function public.purchase_listing(uuid) to authenticated;
grant execute on function public.reveal_listing_code(uuid) to authenticated;
