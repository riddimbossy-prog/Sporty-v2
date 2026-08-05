import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __test } from '../server/lib/sportybet-public.mjs';

const eventsPayload=JSON.parse(await readFile('tests/fixtures/sportybet-public-events.json','utf8'));
const events=__test.collectEventsFromObject(eventsPayload);
assert.equal(events.length,2);
assert.equal(events[0].event_id,'sportybet:evt-1001');
assert.equal(events[0].home_team,'North City');
assert.equal(events[0].oddsHome,1.85);
assert.equal(events[0].oddsDraw,3.4);
assert.equal(events[0].oddsAway,4.2);
assert.equal(events[0].source,'sportybet-public');

const html=await readFile('tests/fixtures/sportybet-public-codehub.html','utf8');
const candidates=__test.jsonCandidates(html,'text/html');
assert.equal(candidates.length,1);
const codes=__test.collectCodesFromObject(candidates[0]);
assert.equal(codes.length,1);
assert.equal(codes[0].code,'GH7788');
assert.equal(codes[0].tips.length,2);
assert.equal(codes[0].tips[0].pick,'Over 1.5');

const url=__test.renderTemplate('https://www.sportybet.com/api/{country}/events?page={page}',{country:'gh',page:2});
assert.equal(url,'https://www.sportybet.com/api/gh/events?page=2');

const moduleSource=await readFile('server/lib/sportybet-public.mjs','utf8');
assert.doesNotMatch(moduleSource,/Cookie\s*:/i);
assert.doesNotMatch(moduleSource,/Authorization\s*:/i);
assert.doesNotMatch(moduleSource,/captcha/i);
const board=await readFile('smart-board.html','utf8');
assert.match(board,/id="eventBoardSection"/);
assert.match(board,/src="\/src\/market-board\.js\?v=21\.6\.0"/);
const client=await readFile('src/market-board.js','utf8');
assert.match(client,/\/api\/get_upcoming_events\?days=3/);
console.log('v21.4 direct public SportyBet collector tests passed.');
