import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeCodeHubPayload } from '../scripts/codehub-normalizer.mjs';
import { updateSettlementLedger } from '../scripts/results-proof.mjs';
import { updateIntelligenceHistory } from '../scripts/intelligence-history.mjs';
import { applyManualOverrides } from '../scripts/sync-codehub.mjs';

const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const now='2026-08-02T18:00:00Z';
const normalized=normalizeCodeHubPayload({items:[
  {code:'WIN606',title:'Verified win',total_odds:3.25,selections_count:2,result:'won',settled_at:'2026-08-02T17:30:00Z',source_url:'https://example.com/result/WIN606',tips:[{fixture:'A vs B',market:'Over/Under',pick:'Over 1.5',result:'won'}]},
  {code:'LOSS606',title:'Verified loss',total_odds:2.10,selections_count:1,status:'lost',settled_at:'2026-08-02T17:20:00Z'},
  {code:'VOID606',title:'Verified void',total_odds:1.90,selections_count:1,status:'cancelled',settled_at:'2026-08-02T17:10:00Z'}
]},{now});
assert.equal(normalized.version,6);
assert.equal(normalized.count,3);
for(const item of normalized.items)assert.equal(item.settlement.verification_status,'verified');
assert.deepEqual(normalized.items.map(item=>item.result),['won','lost','void']);

const reviewFeed={...normalized,items:[structuredClone(normalized.items[0])],count:1};
reviewFeed.items[0].result=null;reviewFeed.items[0].status='upcoming';reviewFeed.items[0].settlement={verification_status:'pending'};
const reviewApplied=applyManualOverrides(reviewFeed,{version:2,overrides:[{code:'WIN606',result:'won',verified:false}]});
assert.equal(reviewApplied.reviewCount,1);
assert.equal(reviewApplied.output.items[0].result,null);
assert.equal(reviewApplied.output.items[0].settlement.verification_status,'needs_review');
const verifiedFeed={...normalized,items:[structuredClone(reviewFeed.items[0])],count:1};
const verifiedApplied=applyManualOverrides(verifiedFeed,{version:2,overrides:[{code:'WIN606',result:'won',verified:true,verified_at:now,evidence_url:'https://example.com/manual-proof'}]});
assert.equal(verifiedApplied.manuallyVerifiedCount,1);
assert.equal(verifiedApplied.output.items[0].result,'won');
assert.equal(verifiedApplied.output.items[0].settlement.verification_status,'verified');

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sporty-proof-'));
const ledgerPath=path.join(temp,'settlement-ledger.json');
const summaryPath=path.join(temp,'results-summary.json');
const historyPath=path.join(temp,'tip-history.json');
const sourcePath=path.join(temp,'source-stats.json');
const performancePath=path.join(temp,'performance-summary.json');
const proof=await updateSettlementLedger(normalized,{ledgerPath,summaryPath});
assert.equal(proof.summary.verified_total,3);
assert.equal(proof.summary.verified_won,1);
assert.equal(proof.summary.verified_lost,1);
assert.equal(proof.summary.verified_void,1);
assert.ok(proof.ledger.entries.every(row=>row.proof_id&&row.proof_id.length===20));
assert.ok(normalized.items.every(item=>item.settlement.proof_id));

const history=await updateIntelligenceHistory(normalized,{historyPath,sourcePath,performancePath});
assert.equal(history.history.version,3);
assert.equal(history.performance.version,2);
assert.equal(history.performance.verified_only,true);
assert.equal(history.history.codes.filter(row=>row.verification_status==='verified').length,3);
assert.equal(history.performance.total_settled,1);

const mvp=read('src/mvp.js');
const control=read('src/control-room.js');
const controlHtml=read('control-room.html');
const sync=read('scripts/sync-codehub.mjs');
const render=read('scripts/render-build.sh');
const workflow=read('.github/workflows/validate.yml');const server=read('server/index.mjs');
assert.match(mvp,/function isVerifiedSettlement/);
assert.match(mvp,/function verifiedWinnerRows/);
assert.match(mvp,/settlement-ledger\.json/);
assert.match(mvp,/if\(!isVerifiedSettlement\(item\)\)return false/);
assert.match(mvp,/Proof ID/);
assert.match(controlHtml,/id="settlementReviewList"/);
assert.match(controlHtml,/id="overrideVerified"/);
assert.match(controlHtml,/id="overrideEvidence"/);
assert.match(control,/verified:row\.verified===true/);
assert.match(control,/Unverified results enter the review queue|review queue/i);
assert.match(sync,/updateSettlementLedger/);
assert.match(sync,/settlement_review_count/);
assert.match(render,/settlement-ledger\.json/);
assert.match(render,/results-summary\.json/);
assert.match(render,/clean-start-custom-api/);
assert.match(workflow,/npm test/);
assert.match(server,/\/admin\/refresh/);
console.log('v20.6 verified results and proof automation checks passed');
