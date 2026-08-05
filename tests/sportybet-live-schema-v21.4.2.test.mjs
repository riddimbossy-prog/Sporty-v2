import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __test } from '../server/lib/sportybet-public.mjs';

const payload = JSON.parse(await readFile('tests/fixtures/sportybet-live-schema.json', 'utf8'));
const rows = __test.collectEventsFromObject(payload);
assert.equal(rows.length, 1);
assert.equal(rows[0].home_team, 'Home United');
assert.equal(rows[0].away_team, 'Away City');
assert.equal(rows[0].league, 'Premier League');
assert.equal(rows[0].country, 'England');
assert.equal(rows[0].oddsHome, 1.72);
assert.equal(rows[0].oddsDraw, 3.55);
assert.equal(rows[0].oddsAway, 4.60);
assert.equal(rows[0].provider_fixture_id, 'sr:match:998877');
console.log('sportybet live schema v21.7.3 test passed');
