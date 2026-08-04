import fs from 'node:fs';
import assert from 'node:assert/strict';
import { normalizeCodeHubPayload } from '../scripts/codehub-normalizer.mjs';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const now='2026-08-02T17:00:00Z';
const out=normalizeCodeHubPayload({items:[
  {code:'GOOD44',total_odds:4.2,selections_count:3,status:'upcoming',created_at:'2026-08-02T15:00:00Z'},
  {code:'NOODDS',selections_count:2,status:'upcoming'},
  {code:'NOSELS',total_odds:2.2,status:'upcoming'},
  {code:'GOOD44',total_odds:3.0,selections_count:2,status:'upcoming'},
  {code:'STALE9',total_odds:2.5,selections_count:2,status:'upcoming',created_at:'2026-07-29T10:00:00Z'},
  {code:'PAST99',total_odds:2.5,selections_count:1,status:'upcoming',tips:[{fixture:'A vs B',market:'1X2',pick:'Home',kickoff:'2026-07-31T18:00:00Z'}]}
]},{now,maxAgeHours:36});
assert.equal(out.version,6);
assert.equal(out.count,1);
assert.equal(out.items[0].code,'GOOD44');
assert.equal(out.items[0].quality,'complete');
assert.equal(out.diagnostics.rejected_by_reason.missing_or_invalid_odds,1);
assert.equal(out.diagnostics.rejected_by_reason.missing_selections,1);
assert.equal(out.diagnostics.rejected_by_reason.duplicate_code,1);
assert.equal(out.diagnostics.rejected_by_reason.stale_content,1);
assert.equal(out.diagnostics.rejected_by_reason.expired_match_day,1);
const mvp=read('src/mvp.js');const sync=read('scripts/sync-codehub.mjs');const sw=read('service-worker.js');const workflow=read('.github/workflows/validate.yml');const server=read('server/index.mjs');
assert.match(mvp,/sporty_codes_last_good_feed_v204/);
assert.match(mvp,/feedIsCurrent/);
assert.match(mvp,/feedAgeHours\(cached\.generated_at\)<=12/);
assert.doesNotMatch(mvp,/sporty_codes_last_good_feed_v196',JSON\.stringify/);
assert.match(sync,/consecutive_failures/);
assert.match(sync,/previous published feed was preserved/i);
assert.match(sync,/hidden===true/);
assert.match(workflow,/npm test/);
assert.match(server,/\/admin\/refresh/);
assert.match(sw,/sporty-codes-v21\.3\.0/);
console.log('Feed reliability v20.4 checks passed');
