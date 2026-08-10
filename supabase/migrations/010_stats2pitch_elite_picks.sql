create table if not exists public.sporty_elite_picks (
  id text primary key,
  source text not null default 'stats2pitch',
  source_fixture_id text,
  prediction_date date not null,
  fixture text not null,
  home_team text,
  away_team text,
  league text,
  country text,
  kickoff timestamptz,
  market text not null,
  pick text not null,
  odds numeric,
  classification text not null default 'elite_supported',
  label text not null default 'Stats2Pitch Elite',
  elite_score numeric,
  engine_rating numeric,
  family_count integer,
  families jsonb not null default '[]'::jsonb,
  contradiction text,
  reason text,
  status text not null default 'upcoming',
  source_generated_at timestamptz,
  imported_at timestamptz not null default now()
);

create index if not exists sporty_elite_picks_date_idx on public.sporty_elite_picks (prediction_date desc, source, status);
create index if not exists sporty_elite_picks_rank_idx on public.sporty_elite_picks (prediction_date desc, engine_rating desc nulls last, family_count desc nulls last);

alter table public.sporty_elite_picks enable row level security;

comment on table public.sporty_elite_picks is 'Private server-side cache of daily Stats2Pitch Elite selections for sporty.codes.';
