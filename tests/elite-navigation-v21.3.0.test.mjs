import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const globalCss=read('styles.css');
const page=read('elite-picks.html');
const boardJs=read('src/elite-board-v2.js');
const boardCss=read('elite-board-v2.css');
const home=read('index.html');
const server=read('server/index.mjs');

assert.match(globalCss,/\[hidden\]\{display:none!important\}/,'native hidden must continue to hide empty sections');
assert.match(home,/href="\/elite-picks\.html"><b>◆<\/b><span>Elite<\/span>/,'mobile home navigation must include Elite');
assert.match(page,/data-page="elite-v2"/,'Elite page must use the standalone v2 surface');
assert.match(page,/Elite Board\./,'new Elite Board hero must be present');
assert.match(page,/elite-board-v2\.css\?v=22\.0\.0/,'Elite page must load its dedicated v2 stylesheet');
assert.match(page,/elite-board-v2\.js\?v=22\.0\.0/,'Elite page must load its dedicated v2 renderer');
assert.doesNotMatch(page,/src\/elite\.js/,'discarded legacy Elite renderer must not be loaded by the page');
assert.doesNotMatch(page,/elite-stats2pitch-bridge\.js/,'discarded Elite bridge must not be loaded by the page');
assert.match(page,/STATS2PITCH_ELITE_BOOTSTRAP/,'Elite page must retain the server bootstrap insertion point');
assert.match(boardJs,/\/api\/elite-picks\?limit=10&ts=/,'v2 renderer must read the persisted Stats2Pitch API directly');
assert.match(boardJs,/embedded\.items\.length/,'v2 renderer may use a non-empty server bootstrap without an extra request');
assert.match(boardJs,/data-elite-v2-filter/,'v2 renderer must support market filtering');
assert.match(boardCss,/@media\(max-width:600px\)/,'v2 Elite Board must include phone/Z Fold responsive rules');
assert.match(server,/elitePagePaths/,'server must intercept Elite page requests');
assert.match(server,/__SPORTY_ELITE_BOOTSTRAP__/,'server must embed the persisted Stats2Pitch Elite payload in the HTML response');
console.log('Elite Board v2 standalone checks passed');
