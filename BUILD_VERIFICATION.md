# Build verification — v21.3.0

Verified on 2026-08-04:

- Complete inherited application test suite passed.
- Fresh-start repository tests passed.
- Static reference and schema validation passed.
- Setup-mode Render build passed without Supabase or provider secrets.
- Local Node server smoke test passed.
- `/api/health` returned HTTP 200 with safe readiness fields.
- Homepage, deployment checker, upcoming-events route, and Code Hub route returned successfully.
- No production `CNAME` is included.
- Only `.github/workflows/validate.yml` is included.
- Old cached fixtures, booking codes, tip history, and Elite history are reset.
- No retired paid collector references or obvious secret values were found.

Live upstream data was not called because private API keys are intentionally not bundled.
