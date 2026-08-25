import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {accraWeek} from '../server/lib/week.mjs';
import {toPublicEliteItem} from '../server/lib/elite-feed.mjs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const page=read('elite-picks.html');
const home=read('index.html');
const boardJs=read('src/elite-board-v2.js');
const feed=read('server/lib/elite-feed.mjs');
const sync=read('scripts/sync-stats2pitch-elite.mjs');
const server=read('server/index.mjs');

const week=accraWeek(new Date('2026-08-26T15:00:00Z'));
assert.equal(week.monday,'2026-08-24');
assert.equal(week.sunday,'2026-08-30');
assert.equal(week.dates.length,7);

const publicItem=toPublicEliteItem({
  id:'row-1',
  fixture:'Home FC vs Away FC',
  home_team:'Home FC',
  away_team:'Away FC',
  home_logo:'https://cdn.example/home.png',
  away_logo:'https://cdn.example/away.png',
  league_logo:'https://cdn.example/league.png',
  league:'Test League',
  country:'England',
  kickoff:'2026-08-26T18:00:00Z',
  market:'Both Teams To Score',
  pick:'BTTS · Yes',
  odds:1.45,
  classification:'elite_strong',
  label:'Away-Fav Streak',
  engine:'away-fav-streak-v1',
  elite_score:91,
  engine_rating:91,
  family_count:3,
  families:['Streak 2+','Team Goals'],
  contradiction:'LOW',
  reason:'Goals Streak 2+ Yes 1.22 is inside the 1.10–1.49 universe.',
  source_generated_at:'2026-08-26T09:00:00Z'
});

assert.equal(publicItem.fixture,'Home FC vs Away FC');
assert.equal(publicItem.home_team,'Home FC');
assert.equal(publicItem.away_team,'Away FC');
assert.equal(publicItem.market,'Both Teams To Score');
assert.equal(publicItem.pick,'BTTS · Yes');
assert.equal(publicItem.average_odds,1.45);
assert.equal(publicItem.reason,undefined);
assert.equal(publicItem.engine,undefined);
assert.equal(publicItem.elite_score,undefined);
assert.equal(publicItem.classification,undefined);
assert.equal(publicItem.label,undefined);
assert.equal(publicItem.evidence,undefined);
assert.equal(publicItem.families,undefined);
assert.equal(publicItem.slip_item.pick,'BTTS · Yes');
assert.equal(publicItem.slip_item.home_logo,'https://cdn.example/home.png');

for(const source of [page,home,boardJs]){
  assert.doesNotMatch(source,/Goals Streak 2\+/);
  assert.doesNotMatch(source,/1\.10\s*[–-]\s*1\.49/);
  assert.doesNotMatch(source,/Away-Fav Streak/);
  assert.doesNotMatch(source,/up to ten a day/i);
  assert.doesNotMatch(source,/max ten a day/i);
}

assert.doesNotMatch(boardJs,/items\.slice\(0,10\)/);
assert.doesNotMatch(feed,/\blimit=10\b/);
assert.doesNotMatch(feed,/max:10/);
assert.doesNotMatch(sync,/\.slice\(0,10\)/);
assert.doesNotMatch(sync,/limit:'10'/);
assert.doesNotMatch(server,/getStats2PitchElite\(\{limit:10\}\)/);
assert.match(feed,/accraWeek/);
assert.match(sync,/accraWeek/);
assert.match(page,/This week/);
assert.match(home,/This week/);

console.log('Elite weekly public board checks passed');
