import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { __test } from '../server/lib/sportybet-browser.mjs';

const reference = new Date('2026-08-05T10:00:00Z');
assert.equal(__test.coerceKickoff('Today 18:30', reference)?.toISOString(), '2026-08-05T18:30:00.000Z');
assert.equal(__test.coerceKickoff('Tomorrow 09:15', reference)?.toISOString(), '2026-08-06T09:15:00.000Z');
assert.equal(__test.coerceKickoff('06/08/2026 14:00', reference)?.toISOString(), '2026-08-06T14:00:00.000Z');
assert.equal(__test.coerceKickoff(1785942000000, reference)?.toISOString(), new Date(1785942000000).toISOString());

const tips = __test.scanTips({
  selections:[
    {eventName:'Home FC vs Away FC',marketName:'1X2',selectionName:'Home',odd:'1.55',eventDate:'Tomorrow 20:00'},
  ],
});
assert.equal(tips.length,1);
assert.equal(tips[0].kickoff,'2026-08-06T20:00:00.000Z');

const mvp = readFileSync(new URL('../src/mvp.js', import.meta.url),'utf8');
assert.match(mvp,/Today \+ Tomorrow/);
assert.match(mvp,/matchDaySummary\(item\)/);
assert.match(mvp,/dayFilterMatchesCode\(item/);

console.log('match-day labels v21.7.2 test passed');
