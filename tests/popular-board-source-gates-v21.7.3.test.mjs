import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../src/intelligence.js',import.meta.url),'utf8');
const window={};
const document={addEventListener(){},querySelector(){return null},querySelectorAll(){return[]}};
const context={window,document,console,fetch:async()=>({ok:false}),setTimeout,clearTimeout,Date,Math,Number,String,Set,Map,CustomEvent:class{},localStorage:{getItem(){return null},setItem(){}}};
vm.createContext(context);
vm.runInContext(source,context);
const engine=window.SportyIntelligence;
assert.ok(engine);
assert.equal(engine.isGenericSourceLabel('SportyBet Code Hub'),true);
assert.equal(engine.sourceKey({code:'AB12CD',author:'SportyBet Code Hub'}),'slip:ab12cd');
assert.equal(engine.sourceKey({code:'AB12CD',author:'Tipster One'}),'source:tipster one');

const kickoff=new Date(Date.now()+6*60*60*1000).toISOString();
const tip={fixture:'Alpha vs Beta',market:'Total Goals',pick:'Over 1.5',category:'Goals',kickoff,league:'Test League',odds:1.32};
const rows=engine.buildTipIntelligence([
  {code:'AA11BB',source:'SportyBet Code Hub',sourceKey:'slip:aa11bb',clusterId:'same',tips:[tip]},
  {code:'CC22DD',source:'SportyBet Code Hub',sourceKey:'slip:cc22dd',clusterId:'same',tips:[tip]}
]);
assert.equal(rows.length,1);
assert.equal(rows[0].appearances,2);
assert.equal(rows[0].uniqueSources,2,'separate verified booking codes count as separate public-slip sources');
assert.equal(rows[0].boardEligible,true,'repeated valid tips remain visible even when quality tier is cautious');
assert.equal(rows[0].boardTier,'Trending');

const conflict=engine.boardGate({appearances:2,oppositionShare:50,duplicateRate:0,dataScore:100,kickoff,averageOdds:1.5});
assert.equal(conflict.eligible,false);
assert.ok(conflict.reasons.some(reason=>reason.includes('opposition')));
console.log('popular board source and visibility gate v21.7.3 tests passed');
