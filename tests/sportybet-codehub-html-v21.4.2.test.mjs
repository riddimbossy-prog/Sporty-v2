import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __test } from '../server/lib/sportybet-public.mjs';

const html = await readFile(new URL('./fixtures/sportybet-codehub-live-page.html', import.meta.url), 'utf8');
const embedded = __test.jsonCandidates(html, 'text/html');
const embeddedCodes = embedded.flatMap((row) => __test.collectCodesFromObject(row));
const htmlCodes = __test.collectCodesFromHtml(html);
const all = new Map([...embeddedCodes, ...htmlCodes].map((row) => [row.code, row]));

assert.equal(all.has('DZKVXA'), true, 'data-booking-code should be parsed');
assert.equal(all.get('DZKVXA').odds, 5377.05);
assert.equal(all.get('DZKVXA').selections, 47);
assert.equal(all.has('918J1X'), true, '__INITIAL_STATE__ code should be parsed');
assert.equal(all.get('918J1X').selections, 8);
assert.equal(all.has('A5582T'), true, 'JSON.parse embedded code should be parsed');
console.log('SportyBet Code Hub HTML parser test passed');
