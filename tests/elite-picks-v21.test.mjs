import assert from 'node:assert/strict';
import { diagnoseAwayFavFixture, buildAwayFavBoard, discoverEliteCandidates, classifyElite } from '../scripts/elite-engine.mjs';

assert.equal(discoverEliteCandidates({items:[{tips:[{fixture:'A vs B',market:'Match winner',pick:'Home'}]}]}).length,0,'booking-code consensus discovery must stay retired');
assert.equal(classifyElite({fixture:'A vs B'}).classification,'rejected','old consensus classifier must not publish Elite picks');

function finished(id,homeId,awayId,h,a){
  return{
    fixture:{id,date:`2026-03-${String((id%27)+1).padStart(2,'0')}T12:00:00Z`,status:{short:'FT'}},
    teams:{home:{id:homeId},away:{id:awayId}},
    goals:{home:h,away:a}
  };
}
function venueRows(teamId,venue,scores){
  return scores.map((pair,index)=>venue==='home'
    ?finished(index+1,teamId,800+index,pair[0],pair[1])
    :finished(index+1,800+index,teamId,pair[1],pair[0]));
}
const strongAway=[[2,0],[3,1],[2,1],[2,0],[3,0]];
const weakHome=[[0,2],[1,2],[0,1],[0,2],[1,3]];

function fixture(odds){
  return{
    fixtureId:1,league:'Test League',country:'England',kickoff:'2026-08-25T18:00:00Z',
    home:{id:1,name:'Home FC',fixtures:venueRows(1,'home',weakHome)},
    away:{id:2,name:'Away FC',fixtures:venueRows(2,'away',strongAway)},
    homeSplit:{position:12,size:20,sampleReady:true},
    awaySplit:{position:8,size:20,sampleReady:true},
    marketOdds:[
      {marketKey:'goals-streak-2',market:'Goals Streak 2+',outcomes:[{name:'Yes',odd:odds.streak??1.22}]},
      {marketKey:'away-team-goals',market:'Away team goals',outcomes:[{name:'Over 0.5',odd:odds.awayO05},{name:'Over 1.5',odd:odds.awayO15}]},
      {marketKey:'home-team-goals',market:'Home team goals',outcomes:[{name:'Over 0.5',odd:odds.homeO05}]},
      {marketKey:'total-goals',market:'Total goals',outcomes:[{name:'Over 1.5',odd:odds.over15??1.30}]},
      {marketKey:'match-winner',market:'Match winner',outcomes:[{name:'Away',odd:odds.awayWin??1.90}]},
      {marketKey:'both-teams-score',market:'Both teams to score',outcomes:[{name:'Yes',odd:odds.bttsYes??1.45}]}
    ]
  };
}

const btts=diagnoseAwayFavFixture(fixture({streak:1.22,awayO05:1.18,awayO15:1.32,homeO05:1.20,bttsYes:1.45}));
assert.equal(btts.pick.route,'btts','both Over 0.5 under 1.30 must choose BTTS');
assert.equal(btts.pick.market,'both-teams-score');

const awayWin=diagnoseAwayFavFixture(fixture({streak:1.25,awayO05:1.40,awayO15:1.35,homeO05:1.75,awayWin:1.42,bttsYes:1.70}));
assert.equal(awayWin.pick.route,'away-win');
assert.equal(awayWin.pick.selection,'Away');

const awayO15=diagnoseAwayFavFixture(fixture({streak:1.25,awayO05:1.40,awayO15:1.35,homeO05:1.82,awayWin:1.80,bttsYes:1.70}));
assert.equal(awayO15.pick.route,'away-o15');
assert.equal(awayO15.pick.market,'away-team-goals');

const over15=diagnoseAwayFavFixture(fixture({streak:1.28,awayO05:1.40,awayO15:1.38,homeO05:1.50,over15:1.33,awayWin:1.90,bttsYes:1.70}));
assert.equal(over15.pick.route,'over-15');
assert.equal(over15.pick.selection,'Over 1.5');

const topFive=diagnoseAwayFavFixture({...fixture({streak:1.22,awayO05:1.18,awayO15:1.32,homeO05:1.20}),homeSplit:{position:2,size:20,sampleReady:true},awaySplit:{position:3,size:20,sampleReady:true}});
assert.equal(topFive.skip,'both-top-five');

const board=buildAwayFavBoard([fixture({streak:1.22,awayO05:1.18,awayO15:1.32,homeO05:1.20,bttsYes:1.45})]);
assert.equal(board.meta.engine,'away-fav-streak-v1');
assert.equal(board.bestPicks.length,1);
console.log('v22 Away-Fav Streak Elite engine tests passed.');
