import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const css=read('styles.css');
const experience=read('src/experience.js');
const elite=read('src/elite.js');
const html=read('elite-picks.html');
const sw=read('service-worker.js');

assert.match(css,/\[hidden\]\{display:none!important\}/,'the native hidden attribute must win over grid and section display rules');
assert.match(css,/data-elite-availability-ready/,'Elite navigation must stay hidden until availability is known');
assert.match(experience,/sporty_elite_availability_v2/,'availability result must use a short session cache');
assert.match(experience,/a\[href="\/elite-picks\.html"\]/,'all Elite navigation links must be toggled together');
assert.match(experience,/location\.replace\(destination\)/,'a directly opened empty Elite route must leave the empty page');
assert.match(experience,/allowed=new Set\(\['elite_verified','elite_supported','trending'\]\)/,'only public Elite classifications may make the page available');
assert.match(elite,/setSection\('#eliteEmpty',false\)/,'the full-page empty state must not be shown publicly');
assert.match(elite,/card\.hidden=value<=0/,'zero-value Elite statistic cards must be hidden');
assert.match(elite,/filter\.hidden=value<=0/,'empty Elite classification filters must be hidden');
assert.match(elite,/SportyEliteAvailability\?\.loadData/,'Elite rendering and navigation must share one feed request');
assert.doesNotMatch(elite,/toast\('Elite verification is temporarily unavailable\.'/,'feed failure must not expose a broken empty section');
assert.match(html,/styles\.css\?v=21\.0\.2/,'Elite page must load cache-busted styles');
assert.match(html,/src\/elite\.js\?v=21\.0\.2/,'Elite page must load cache-busted Elite logic');
assert.match(sw,/sporty-codes-v21\.0\.2/,'the PWA cache must be bumped');
console.log('v21.0.2 Elite empty-state visibility checks passed');
