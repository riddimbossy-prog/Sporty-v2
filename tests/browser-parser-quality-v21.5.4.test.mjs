import assert from 'node:assert/strict';
import { __test } from '../server/lib/sportybet-browser.mjs';

assert.equal(__test.normalizeCode({ code:'AB12CD' }), '');
assert.equal(__test.normalizeCode('OBJECTOBJECT'), '');
assert.equal(__test.normalizeCode('89PHX'), '89PHX');
assert.equal(__test.normalizeCode('ABCD'), '');
assert.equal(__test.normalizeCode('123456'), '');

const noise=__test.scanObjects({
  response:{ code:{ value:'AB12CD' }, odds:99906.4569 },
  error:{ code:'ERROR', selectionCount:2, totalOdds:4.2 },
  status:{ code:'SUCCESS', selectionCount:2, totalOdds:4.2 },
},'https://www.sportybet.com/gh/m/code-hub/codes');
assert.equal(noise.length,0,'generic application/error codes must not become booking codes');

const real=__test.scanObjects({
  data:{ rows:[
    { code:'89PHX', totalOdds:2.5366, selections:[
      {fixture:'Arsenal vs Chelsea',market:'1X2',selection:'Home',odds:1.4},
      {fixture:'Milan vs Inter',market:'Double Chance',selection:'1X',odds:1.8},
    ] },
    { bookingCode:'8P45FN', selectionCount:2, totalOdds:174585.8033 },
  ]}
},'https://www.sportybet.com/gh/m/code-hub/codes');
assert.equal(real.length,2);
assert.equal(real.find(row=>row.code==='89PHX')?.odds,2.5366);
assert.equal(real.find(row=>row.code==='8P45FN')?.odds,null,'impossible two-leg total must be rejected');

const cleaned=__test.sanitizeCollectedItem({
  code:'F4RD61',
  odds:99906.4569,
  selections:2,
  tips:[
    {fixture:'Arsenal vs Chelsea',market:'Over/Under',pick:'Over 1.5',odds:1.5},
    {fixture:'Milan vs Inter',market:'Double Chance',pick:'1X',odds:1.8},
  ],
});
assert.ok(cleaned);
assert.equal(cleaned.code,'F4RD61');
assert.equal(cleaned.selections,2);
assert.equal(cleaned.odds,2.7,'valid leg product should replace unrelated scraped number');
assert.equal(cleaned.tips.length,2);

assert.equal(__test.sanitizeCollectedItem({code:'OBJECTOBJECT',odds:2.2,selections:2,tips:[]}),null);
console.log('browser parser quality v21.5.4 test passed');
