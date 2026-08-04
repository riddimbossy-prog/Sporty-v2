# sporty.codes v21.4.1 build verification

Verified on 2026-08-04.

## Passed

- Complete inherited `npm test` suite
- JavaScript syntax checks
- Render production build
- Direct collector route simulation
- Live SportyBet-style schema regression
- `homeTeamName` / `awayTeamName` parsing
- `estimateStartTime` parsing
- `tournamentList` / `tournamentName` / `categoryName` parsing
- `desc` / `odd` 1X2 parsing
- Safe source diagnostics
- Smart Board empty-feed explanation

## End-to-end simulated route result

`GET /api/get_upcoming_events?days=3` returned:

- source: `sportybet-public-direct`
- count: 1
- Home: 1.72
- Draw: 3.55
- Away: 4.60

No Supabase migration is required for this hotfix.
