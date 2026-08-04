import assert from 'node:assert/strict';
import { discoverEliteCandidates, verifyCandidate, classifyElite, normaliseFixtureStats } from '../scripts/elite-engine.mjs';

const tips=Array.from({length:8},(_,index)=>({
  code:`ABCD${index+1}`,
  author:`Source ${index+1}`,
  odds:4.2,
  selections:1,
  created_at:'2026-08-02T10:00:00Z',
  tips:[{fixture:'Babrunas vs Transinvest 2',market:'Match winner',pick:'Home Win',odds:1.55,league:'Lithuania 1 Lyga',kickoff:'2026-08-04T16:00:00Z'}]
}));
const feed={generated_at:'2026-08-02T10:00:00Z',items:tips};
const sourceStats={sources:Array.from({length:8},(_,index)=>({source:`Source ${index+1}`,reliability_score:90}))};
const key='2026-08-04|babrunas|match winner|home win';
const tipHistory={tips:[{key,observations:4}]};
const candidates=discoverEliteCandidates(feed,{sourceStats,tipHistory,minAppearances:5,minIndependent:3});
assert.equal(candidates.length,1,'repeated tips should create one candidate');
assert.equal(candidates[0].independent_sources,8,'single-tip slips from different sources remain independent');
assert.ok(candidates[0].consensus_score>=38,'candidate should pass consensus floor');

const stats={
  home:{overall:{MP:15,W:12,D:3,L:0,G:'24:4',PTS:39,form:'WWWDW'}},
  away:{overall:{MP:15,W:4,D:2,L:9,G:'13:35',PTS:14,form:'LDLLW'}},
  competition:{average_goals:2.7}
};
const normalized=normaliseFixtureStats(stats);
assert.equal(normalized.home.matches,15);
assert.equal(normalized.home.goals_for,24);
assert.equal(normalized.away.goals_against,35);
const verification=verifyCandidate(candidates[0],stats);
assert.equal(verification.complete,true);
assert.ok(verification.score>=40,`expected strong statistical score, received ${verification.score}`);
const elite=classifyElite(candidates[0],verification);
assert.equal(elite.classification,'elite_verified');
assert.ok(elite.elite_score>=85);

const contradicting={
  home:{overall:{MP:10,W:1,D:2,L:7,G:'7:22',PTS:5,form:'LLLLD'}},
  away:{overall:{MP:10,W:8,D:1,L:1,G:'22:6',PTS:25,form:'WWWWD'}},
  competition:{average_goals:2.5}
};
const contradiction=verifyCandidate(candidates[0],contradicting);
assert.equal(contradiction.contradiction,true,'strongly opposed venue form must veto the candidate');
assert.equal(classifyElite(candidates[0],contradiction).classification,'rejected');
console.log('v21.0 Elite Picks engine tests passed.');
