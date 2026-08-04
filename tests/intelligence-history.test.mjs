import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { updateIntelligenceHistory } from '../scripts/intelligence-history.mjs';

const dir=await mkdtemp(join(tmpdir(),'sporty-intel-'));
try{
  const feed={generated_at:'2026-07-31T20:00:00Z',items:[
    {code:'WIN1',title:'Winner',author:'Source A',odds:2.0,status:'won',result:'won',settlement:{verification_status:'verified',method:'source-feed',verified_at:'2026-07-31T20:00:00Z'},tips:[{fixture:'A vs B',market:'Total Goals 2.5',pick:'Over 2.5',odds:1.5,league:'League 1',kickoff:'2026-07-31T18:00:00Z'}]},
    {code:'LOSE1',title:'Lost slip',author:'Source B',odds:4.0,status:'lost',result:'lost',settlement:{verification_status:'verified',method:'source-feed',verified_at:'2026-07-31T20:00:00Z'},tips:[{fixture:'C vs D',market:'1X2',pick:'Home win',odds:2.0,league:'League 2',kickoff:'2026-07-31T19:00:00Z'}]}
  ]};
  const result=await updateIntelligenceHistory(feed,{historyPath:join(dir,'history.json'),sourcePath:join(dir,'sources.json'),performancePath:join(dir,'performance.json')});
  assert.equal(result.history.codes.length,2);
  const wonTip=result.history.tips.find(row=>row.fixture==='A vs B');
  const unresolvedLostSlipTip=result.history.tips.find(row=>row.fixture==='C vs D');
  assert.equal(wonTip.result,'won');
  assert.equal(unresolvedLostSlipTip.result,'pending','a lost slip must not mark every leg lost');
  assert.equal(result.performance.total_settled,1);
  const sourceA=result.sources.sources.find(row=>row.source==='Source A');
  assert.equal(sourceA.hit_rate,100);
  const persisted=JSON.parse(await readFile(join(dir,'history.json'),'utf8'));
  assert.equal(persisted.version,3);
}finally{await rm(dir,{recursive:true,force:true})}
console.log('Intelligence history tests passed.');
