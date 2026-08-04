import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeCodeHubPayload } from '../scripts/codehub-normalizer.mjs';

const fixture=JSON.parse(await readFile(new URL('./fixtures/provider-sample.json',import.meta.url),'utf8'));
const result=normalizeCodeHubPayload(fixture,{now:'2026-07-30T18:00:00Z'});
assert.equal(result.status,'ok');
assert.equal(result.count,1);
assert.equal(result.items[0].code,'GH1234');
assert.equal(result.items[0].title,'Weekend goals mix');
assert.equal(result.items[0].odds,4.8);
assert.equal(result.items[0].selections,3);
assert.equal(result.items[0].author,'Code Hub Ghana');
assert.equal(result.items[0].tag,'Goals');
assert.equal(result.items[0].status,'upcoming');
assert.equal(result.generated_at,'2026-07-30T18:00:00.000Z');

const custom=normalizeCodeHubPayload({payload:{rows:[{coupon:'ABCD9',total:'2.25',count:2}]}},{
  itemsPath:'payload.rows',
  fieldMap:{code:'coupon',odds:'total',selections:'count'}
});
assert.equal(custom.count,1);
assert.equal(custom.items[0].code,'ABCD9');
assert.equal(custom.items[0].odds,2.25);
assert.equal(custom.items[0].selections,2);

// Legacy provider-compatible response shape.
const agentShape=normalizeCodeHubPayload({
  items:[
    {
      code:'LIVE123',
      title:'Agent-created listing',
      total_odds:3.75,
      selections_count:4,
      tipster:'Public tipster',
      category:'Safe',
      expires_at:'2030-08-01T18:00:00Z',
      status:'upcoming',
      source_url:'https://example.com/codehub',
      scraped_at:'2026-07-31T06:00:00Z'
    },
    {code:'OLD123',status:'expired'},
    {code:'START1',status:'live'}
  ],
  count:3
},{now:'2026-07-31T06:10:00Z'});
assert.equal(agentShape.count,1);
assert.equal(agentShape.items[0].code,'LIVE123');
assert.equal(agentShape.items[0].selections,4);
assert.equal(agentShape.items[0].created_at,'2026-07-31T06:00:00.000Z');

// A provider may wrap the endpoint output as a JSON string.
const wrapped=normalizeCodeHubPayload({body:JSON.stringify({items:[{code:'WRAP44',total_odds:'2.10'}]})});
assert.equal(wrapped.count,1);
assert.equal(wrapped.items[0].code,'WRAP44');
assert.equal(wrapped.items[0].odds,2.1);

console.log('Code Hub normalizer tests passed.');
