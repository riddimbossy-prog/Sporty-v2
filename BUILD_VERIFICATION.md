# Build verification — Sporty.codes v21.4.2

Verified locally:

- Complete inherited application test suite passed.
- Direct SportyBet event response normalization passed.
- Public Code Hub HTML/JSON normalization passed.
- Render build completed.
- Node service started successfully.
- `/api/health` returned v21.4.2.
- `/api/get_upcoming_events` returned two normalized mock SportyBet events with 1X2 odds.
- `/api/get_code_hub_codes` returned one mock public code with two detailed selections.
- `/api/source-status` reported successful event and code collection.
- Smart Board contains the new market-board UI and responsive rules.

The live SportyBet public route could not be contacted from the build environment. Verify it after Render deployment through `/api/source-status`. If SportyBet changes its public URL, update `SPORTYBET_PUBLIC_EVENTS_URL` without changing the application code.
