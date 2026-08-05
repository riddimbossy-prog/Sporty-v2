# Sporty.codes v21.7.2 build verification

## Root cause
- Verified Code Hub selections were stored before kickoff enrichment.
- The custom upcoming-events feed can be temporarily empty.
- The Smart Board filtered undated repeated selections out of the Today view, creating a blank board despite 24 source slips.

## Permanent corrections
- Enrich verified selections with the custom SportyBet upcoming-events feed before Supabase storage.
- Use strict fixture-name confidence matching; unmatched fixtures remain undated.
- Persist recovered kickoff, league and event id in Supabase.
- Show repeated undated tips under a clear Date pending fallback instead of an empty board.
- Keep API-Football fallback disabled by default.

## Validation
- Full npm test suite passed.
- New server-side enrichment regression test passed.
- Render build passed.
- Local API health smoke test passed.
