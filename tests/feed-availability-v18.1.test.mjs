import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../src/mvp.js',import.meta.url),'utf8');
const sandbox={
  window:{SPORTY_CONFIG:{}},
  document:{body:{dataset:{}},addEventListener(){}},
  console,
  setTimeout,clearTimeout,setInterval,clearInterval,
  URLSearchParams,
  navigator:{},
  location:{search:''},
  localStorage:{getItem(){return null},setItem(){}},
  matchMedia(){return{matches:false}}
};
vm.createContext(sandbox);
vm.runInContext(source,sandbox);
const api=sandbox.window.__SPORTY_FEED_TEST__;
assert.ok(api,'front-end test API should be available');

const alias=api.normalizedFeedItem({booking_code:'ABCD12',total_odds:'5.50',selections_count:4,status:'success'});
assert.equal(alias.code,'ABCD12');
assert.equal(alias.odds,5.5);
assert.equal(alias.selections,4);
assert.equal(api.isAvailable(alias),true,'generic API success must not hide a public code');
assert.equal(api.isAvailable({code:'ABCD12',status:'expired'}),false);
assert.equal(api.isAvailable({code:'ABCD12',result:'won',status:'upcoming'}),false);
assert.equal(api.isAvailable({code:'ABCD12',status:'upcoming',expires_at:1680000000}),true,'implausibly old timestamp must not blank a newly synced feed');
assert.equal(api.isWon({code:'ABCD12',status:'success'}),false,'generic success is not a verified win');
assert.equal(api.isWon({code:'ABCD12',result:'won'}),false,'unverified wins are not public proof');
assert.equal(api.isWon({code:'ABCD12',result:'won',settlement:{verification_status:'verified'}}),true);
console.log('feed availability v18.1 tests passed');
