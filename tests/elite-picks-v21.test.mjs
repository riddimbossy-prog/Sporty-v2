import assert from 'node:assert/strict';
import { diagnoseAwayFavFixture, buildAwayFavBoard, extractOdds, discoverEliteCandidates, classifyElite } from '../scripts/elite-engine.mjs';
import { fixtureFromSportybet } from '../scripts/generate-sportybet-elite.mjs';

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
  const markets=[
    odds.streak!=null?{marketKey:'goals-streak-2',market:'Goals Streak 2+',outcomes:[{name:'Yes',odd:odds.streak}]}:null,
    {marketKey:'away-team-goals',market:'Away team goals',outcomes:[{name:'Over 0.5',odd:odds.awayO05},{name:'Over 1.5',odd:odds.awayO15}]},
    {marketKey:'home-team-goals',market:'Home team goals',outcomes:[{name:'Over 0.5',odd:odds.homeO05}]},
    {marketKey:'total-goals',market:'Total goals',outcomes:[{name:'Over 1.5',odd:odds.over15??1.30}]},
    {marketKey:'match-winner',market:'Match winner',outcomes:[{name:'Away',odd:odds.awayWin??1.90}]},
    {marketKey:'both-teams-score',market:'Both teams to score',outcomes:[{name:'Yes',odd:odds.bttsYes??1.45}]}
  ].filter(Boolean);
  return{
    fixtureId:1,league:'Test League',country:'England',kickoff:'2026-08-25T18:00:00Z',
    home:{id:1,name:'Home FC',fixtures:venueRows(1,'home',weakHome)},
    away:{id:2,name:'Away FC',fixtures:venueRows(2,'away',strongAway)},
    homeSplit:{position:12,size:20,sampleReady:true},
    awaySplit:{position:8,size:20,sampleReady:true},
    marketOdds:markets
  };
}

const missingStreak=diagnoseAwayFavFixture(fixture({awayO05:1.18,awayO15:1.20,homeO05:1.20,bttsYes:1.45}));
assert.equal(missingStreak.skip,'missing-odds','missing Goals Streak 2+ must fail closed');
assert.equal(extractOdds(fixture({awayO05:1.18,awayO15:1.20,homeO05:1.20})).streak,null,'away Over 1.5 must not proxy streak odds');

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

const board=buildAwayFavBoard(Array.from({length:12},(_,index)=>{
  const row=fixture({streak:1.22,awayO05:1.18,awayO15:1.32,homeO05:1.20,bttsYes:1.45});
  row.fixtureId=index+1;
  row.kickoff=`2026-08-2${index<6?4:5}T${String(10+index).padStart(2,'0')}:00:00Z`;
  return row;
}));
assert.equal(board.meta.engine,'away-fav-streak-v1');
assert.equal(board.bestPicks.length,12,'every qualifier must publish with no daily cap');
const kickoffs=board.bestPicks.map(row=>Date.parse(row.kickoff));
assert.deepEqual(kickoffs,[...kickoffs].sort((a,b)=>a-b),'published picks must stay in kickoff order');

const sportyStreak=diagnoseAwayFavFixture({
  ...fixture({awayO05:1.18,awayO15:1.32,homeO05:1.20,bttsYes:1.45}),
  home:{id:1,name:'Home FC',fixtures:[]},
  away:{id:2,name:'Away FC',fixtures:[]},
  homeSplit:null,
  awaySplit:null,
  marketOdds:[
    {marketKey:'60010',market:'Any Team To Score 2 or More Goals in a Row',outcomes:[{name:'Yes',odd:1.30}]},
    {marketKey:'away-team-goals',market:'Away O/U',outcomes:[{name:'Over 0.5',odd:1.18},{name:'Over 1.5',odd:1.32}]},
    {marketKey:'home-team-goals',market:'Home O/U',outcomes:[{name:'Over 0.5',odd:1.20}]},
    {marketKey:'total-goals',market:'Over/Under',outcomes:[{name:'Over 0.5',odd:1.05}]},
    {marketKey:'total-goals',market:'Over/Under',outcomes:[{name:'Over 1.5',odd:1.28}]},
    {marketKey:'match-winner',market:'1X2',outcomes:[{name:'Home',odd:4.20},{name:'Away',odd:1.61}]},
    {marketKey:'both-teams-score',market:'GG/NG',outcomes:[{name:'Yes',odd:1.45}]}
  ]
});
assert.equal(sportyStreak.skip,null,'missing table/form must not skip a priced qualifier');
assert.equal(sportyStreak.pick.route,'btts');
assert.equal(extractOdds({
  home:{name:'Home FC'},
  away:{name:'Away FC'},
  marketOdds:[
    {marketKey:'goals-streak-2',market:'Any Team To Score 2 or More Goals in a Row',outcomes:[{name:'Yes',odd:1.30}]},
    {marketKey:'total-goals',market:'Over/Under',outcomes:[{name:'Over 0.5',odd:1.05}]},
    {marketKey:'total-goals',market:'Over/Under',outcomes:[{name:'Over 1.5',odd:1.28}]}
  ]
}).over15,1.28,'Over 1.5 must still resolve when SportyBet splits totals by line');

const homeFav=diagnoseAwayFavFixture({
  ...fixture({streak:1.22,awayO05:1.40,awayO15:1.70,homeO05:1.20,bttsYes:1.45}),
  marketOdds:[
    {marketKey:'goals-streak-2',market:'Goals Streak 2+',outcomes:[{name:'Yes',odd:1.22}]},
    {marketKey:'away-team-goals',market:'Away team goals',outcomes:[{name:'Over 0.5',odd:1.40},{name:'Over 1.5',odd:1.70}]},
    {marketKey:'home-team-goals',market:'Home team goals',outcomes:[{name:'Over 0.5',odd:1.20},{name:'Over 1.5',odd:1.25}]},
    {marketKey:'match-winner',market:'Match winner',outcomes:[{name:'Home',odd:1.40},{name:'Away',odd:7.10}]},
    {marketKey:'both-teams-score',market:'Both teams to score',outcomes:[{name:'Yes',odd:1.45}]}
  ]
});
assert.equal(homeFav.skip,'fav-is-home');

const mapped=fixtureFromSportybet({
  eventId:'sr:match:1',
  estimateStartTime:Date.parse('2026-08-29T13:30:00Z'),
  homeTeamName:'Elversberg',
  awayTeamName:'Leverkusen',
  homeTeamId:'h',
  awayTeamId:'a',
  league:'Bundesliga',
  country:'Germany',
  markets:[
    {id:'60010',desc:'Any Team To Score 2 or More Goals in a Row',outcomes:[{desc:'Yes',odds:'1.43'}]},
    {id:'1',name:'1X2',outcomes:[{desc:'Home',odds:'5.19'},{desc:'Away',odds:'1.61'}]},
    {id:'19',name:'Home O/U',specifier:'total=0.5',outcomes:[{desc:'Over 0.5',odds:'1.40'}]},
    {id:'19',name:'Home O/U',specifier:'total=1.5',outcomes:[{desc:'Over 1.5',odds:'2.10'}]},
    {id:'20',name:'Away O/U',specifier:'total=0.5',outcomes:[{desc:'Over 0.5',odds:'1.18'}]},
    {id:'20',name:'Away O/U',specifier:'total=1.5',outcomes:[{desc:'Over 1.5',odds:'1.35'}]},
    {id:'18',name:'Over/Under',specifier:'total=1.5',outcomes:[{desc:'Over 1.5',odds:'1.28'}]},
    {id:'29',name:'GG/NG',outcomes:[{desc:'Yes',odds:'1.70'}]}
  ]
});
assert.ok(mapped.marketOdds.some(row=>row.marketKey==='goals-streak-2'));
const live=diagnoseAwayFavFixture(mapped);
assert.equal(live.skip,null);
assert.equal(live.pick.route,'over-15');

console.log('v22 Away-Fav Streak Elite engine tests passed.');
