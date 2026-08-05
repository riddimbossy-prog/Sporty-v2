# Build verification — v21.7.3

## Root cause fixed

The live feed used the generic author label `SportyBet Code Hub` for every verified booking code. The Smart Board therefore counted all public slips as one source and rejected every repeated tip under source-diversity rules. Saved account filters were also enabled by default and could silently hide the remaining candidates.

## Changes

- Generic Code Hub labels no longer collapse every booking code into one source identity.
- Each verified booking code contributes one public-slip source identity.
- Near-duplicate slip clustering remains active.
- Popularity visibility is separated from strict quality grading.
- Repeated tips may appear as `Trending` even when they are not Strong/Supported, provided they pass hard safety checks.
- Strong opposition, corrupt odds, extreme duplication, badly incomplete data, and already-started fixtures remain blocked.
- Saved account filters are opt-in and cannot silently empty the board.
- The custom SportyBet-backed API, date recovery, simulated prediction slip, and branded sharing are preserved.

## Validation

- Full `npm test` suite passed.
- Render build passed.
- Local API smoke test passed.
- New public-slip source and board-visibility regression test passed.
