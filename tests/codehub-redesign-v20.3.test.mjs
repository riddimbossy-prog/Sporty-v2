import assert from 'node:assert/strict';
import fs from 'node:fs';

const home=fs.readFileSync('index.html','utf8');
const market=fs.readFileSync('marketplace.html','utf8');
const js=fs.readFileSync('src/mvp.js','utf8');
const css=fs.readFileSync('styles.css','utf8');
const responsive=fs.readFileSync('responsive.css','utf8');

assert.match(home,/codehub-banner-v203/);
assert.match(home,/View all free codes/);
assert.match(home,/Swipe through the latest free codes/);
assert.match(market,/id="codeSort"/);
assert.match(market,/Compact slips first/);
assert.match(market,/code-grid-v203/);

assert.match(js,/codehub-card codehub-card-v203/);
assert.match(js,/Booking code/);
assert.match(js,/codehub-load-v203/);
assert.match(js,/codehub-support-actions/);
assert.match(js,/formatOdds/);
assert.match(js,/state\.codeFilters\.sort/);
assert.doesNotMatch(js,/tips mapped`\)\);card\.append\(pills\)/);

assert.match(css,/v20\.3 — premium Code Hub redesign/);
assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
assert.match(css,/codehub-code-panel code/);
assert.match(css,/codehub-load-v203/);
assert.match(responsive,/Folded Z Fold and extra-narrow Android widths/);
assert.match(responsive,/Tablets and unfolded foldables/);
assert.match(responsive,/v20\.3 light-theme precedence/);

console.log('v20.3 Code Hub redesign checks passed');
