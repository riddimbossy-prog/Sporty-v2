# Sporty.codes v21.7.3-P1 — Today status animation patch

This is a small overlay patch for the working v21.7.3 build.

## Replaces

- `styles.css`
- `smart-board.html`
- `smart-board/index.html`
- `service-worker.js`

## Change

The rotating Today orbit has been removed. The badge now uses:

- a one-time fade-up entrance;
- a static double ring;
- a slow breathing glow;
- a gentle red beacon pulse.

It no longer looks like a page loader. Reduced-motion preferences are respected. No collector, API, ranking, date, or prediction-slip logic is changed.

## Install

Copy these files over the matching files in the repository, commit, push, and let Render deploy. Then open `/cache-reset.html` once or hard refresh the Smart Board.
