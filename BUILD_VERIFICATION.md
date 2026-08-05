# Build verification — Sporty.codes v21.5.1

Completed in the packaging environment:

- Full inherited Sporty.codes test suite passed.
- New Chromium DevTools browser-agent unit and DOM workflow tests passed.
- Render build script passed.
- Browser code discovery parser passed.
- Public load-code form filling test passed.
- Booking-selection normalization test passed.
- Same-domain API and Supabase persistence paths passed.
- Empty rediscovery no longer erases previously expanded selections.
- Dockerfile and Render Blueprint are included.

Live SportyBet collection was not called from the packaging environment because live web access is unavailable. The first Render manual collector run is the production verification step.
- Local server smoke test passed for `/api/health`, `/api/collector-status`, and runtime-generated `/config.js`.
