import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const css=read('styles.css');
const experience=read('src/experience.js');
const elite=read('src/elite.js');
const home=read('index.html');
const page=read('elite-picks.html');
const sw=read('service-worker.js');

assert.match(css,/\[hidden\]\{display:none!important\}/,'native hidden must continue to hide empty homepage sections');
assert.doesNotMatch(css,/data-elite-availability-ready.*elite-picks/,'Elite navigation must not be hidden by availability CSS');
assert.doesNotMatch(experience,/link\.hidden=!available/,'Elite links must remain visible with zero candidates');
assert.doesNotMatch(experience,/location\.replace\(destination\)/,'empty Elite page must not redirect away');
assert.match(experience,/dataset\.eliteAvailable/,'availability may still be exposed for populated previews');
assert.match(elite,/setSection\('#eliteEmpty',!state\.loading&&!hasItems\)/,'completed empty state must be shown on the Elite page');
assert.match(elite,/setSection\('#eliteLoading',state\.loading\)/,'loader must disappear when loading finishes');
assert.match(elite,/if\(section\)section\.hidden=!rows\.length/,'empty homepage Elite preview must stay hidden');
assert.match(home,/href="\/elite-picks\.html"><b>◆<\/b><span>Elite<\/span>/,'mobile home navigation must include Elite');
assert.match(page,/No qualified Elite Picks right now/,'direct Elite page must explain an empty board');
assert.match(page,/styles\.css\?v=21\.5\.3/,'Elite page must load fresh styles');
assert.match(sw,/sporty-codes-v21\.5\.3/,'PWA cache must be bumped');
console.log('v21.5.3 persistent Elite navigation checks passed');
