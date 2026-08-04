import assert from 'node:assert/strict';
import { normalizeCodeHubPayload } from '../scripts/codehub-normalizer.mjs';

const payload={items:[
  {code:'AAA111',title:'Weekend goals',total_odds:'4.50',status:'upcoming',selections_detail:[
    {fixture:'Team A vs Team B',market:'Over/Under 2.5',pick:'Over 2.5',odds:'1.70',league:'Test League'},
    {fixture:'Team C vs Team D',market:'1X2',pick:'Home Win',odds:1.55}
  ]},
  {code:'BBB222',title:'Another slip',odds:6.2,status:'upcoming',tips:[
    {event:'Team A vs Team B',market_name:'Over/Under 2.5',selection:'Over 2.5',price:1.72},
    {event:'Team E vs Team F',market_name:'BTTS',selection:'Yes',price:1.8}
  ]},
  {code:'WIN333',title:'Settled winner',odds:3.1,status:'won',result:'won',legs:[
    {match:'Team G vs Team H',bet_type:'Double Chance',choice:'1X'}
  ]}
]};
const out=normalizeCodeHubPayload(payload,{now:'2026-07-31T19:00:00Z',maxItems:20});
assert.equal(out.version,6);
assert.equal(out.count,3);
assert.equal(out.slips_with_tips,3);
assert.equal(out.total_tips,5);
assert.equal(out.items[0].tips[0].fixture,'Team A vs Team B');
assert.equal(out.items[0].tips[0].pick,'Over 2.5');
assert.equal(out.items[2].result,'won');
console.log('codehub normalizer v3 tests passed');

const permissive=normalizeCodeHubPayload({items:[
  {code:'SYNC44',title:'Fresh sync item',status:'success',expires_at:1680000000,total_odds:2.4,selections_count:2},
  {code:'EXPD44',status:'expired'}
]},{now:'2026-07-31T19:00:00Z'});
assert.equal(permissive.count,1,'generic API success and implausible legacy expiry must not empty the feed');
assert.equal(permissive.items[0].code,'SYNC44');
assert.equal(permissive.items[0].result,null,'API success must not be treated as a verified win');
