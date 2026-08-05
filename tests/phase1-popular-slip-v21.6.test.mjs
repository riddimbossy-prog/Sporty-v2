import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __test } from '../server/lib/sportybet-browser.mjs';

const board=await readFile('smart-board.html','utf8');
assert.match(board,/Popular tips for today/);
assert.match(board,/id="intelPopularity"/);
assert.match(board,/src="\/src\/slip-builder\.js\?v=21\.6\.1"/);
assert.match(board,/Prediction builder only/);
assert.match(board,/No real-money staking is processed/);
assert.match(board,/id="eventBoardSection"[^>]*data-mode="disabled"[^>]*hidden/);

const slip=await readFile('src/slip-builder.js','utf8');
assert.match(slip,/sporty_prediction_slip_v2160/);
assert.match(slip,/Practice points/);
assert.match(slip,/No payment, wallet, real-money stake or wager/);
assert.match(slip,/Share branded image/);
assert.match(slip,/pointermove/);

const share=await readFile('src/share.js','utf8');
assert.match(share,/renderSlipCard/);
assert.match(share,/MY PREDICTION SLIP/);
assert.match(share,/session\.type==='slip'/);

const reference=new Date('2026-08-05T10:00:00Z');
assert.equal(__test.coerceKickoff('Today 18:30',reference)?.toISOString(),'2026-08-05T18:30:00.000Z');
assert.equal(__test.coerceKickoff('Tomorrow 09:15',reference)?.toISOString(),'2026-08-06T09:15:00.000Z');
assert.equal(__test.coerceKickoff('Wed 13 Feb',reference)?.toISOString(),'2027-02-13T12:00:00.000Z');
assert.equal(__test.publicCodeKickoff('Wed 13 Feb',reference),null);
assert.equal(__test.publicCodeKickoff('2001-02-13T12:00:00Z',reference),null);
assert.equal(__test.publicCodeKickoff('06/08/2026 14:00',reference)?.toISOString(),'2026-08-06T14:00:00.000Z');

console.log('v21.6 popular tips and prediction-slip Phase 1 test passed');
