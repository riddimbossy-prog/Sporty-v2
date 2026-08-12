alter table public.sporty_elite_picks
  add column if not exists home_logo text,
  add column if not exists away_logo text,
  add column if not exists league_logo text;

comment on column public.sporty_elite_picks.home_logo is 'Stats2Pitch/API-Football home-team crest URL.';
comment on column public.sporty_elite_picks.away_logo is 'Stats2Pitch/API-Football away-team crest URL.';
comment on column public.sporty_elite_picks.league_logo is 'Stats2Pitch/API-Football competition logo URL.';
