import assert from 'node:assert/strict';
import { __test } from '../server/lib/sportybet-browser.mjs';

const unverified = __test.verifiedCollectedItems([
  { code:'AP97PW', odds:799.75, selections:0, tips:[] },
  { code:'E5UPF9', odds:133.4071, selections:0, tips:[] },
]);
assert.equal(unverified.length,0,'candidate tokens without expanded selections must never be published');

const verified = __test.verifiedCollectedItems([
  {
    code:'GH1234',
    odds:2.7,
    selections:2,
    tips:[
      {fixture:'Arsenal vs Chelsea',market:'Over/Under',pick:'Over 1.5',odds:1.5},
      {fixture:'Milan vs Inter',market:'Double Chance',pick:'1X',odds:1.8},
    ],
  },
]);
assert.equal(verified.length,1);
assert.equal(verified[0].code,'GH1234');
assert.equal(verified[0].tips.length,2);
assert.equal(verified[0].selections,2);
assert.equal(verified[0].odds,2.7);

const formScript=__test.LOAD_FORM_SCRIPT('GH1234');
assert.match(formScript,/_valueTracker/,'React-controlled input tracker must be updated');
assert.match(formScript,/requestSubmit/,'form submission fallback must be present');
assert.match(formScript,/InputEvent/,'native input event must be dispatched');

console.log('browser verified-slip gate v21.5.4 test passed');
