import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../src/intelligence.js',import.meta.url),'utf8');
const window={};
const document={addEventListener(){},querySelector(){return null},querySelectorAll(){return[]}};
const context={window,document,console,fetch:async()=>({ok:false}),setTimeout,clearTimeout,Date,Math,Number,String,Set,Map,CustomEvent:class{}};
vm.createContext(context);
vm.runInContext(source,context);
const engine=window.SportyIntelligence;
assert.ok(engine,'engine should be exposed');

const over={fixture:'Alpha vs Beta',market:'Total Goals 2.5',pick:'Over 2.5',category:'Goals',kickoff:'2099-01-01T18:00:00Z'};
const under={fixture:'Alpha vs Beta',market:'Total Goals 2.5',pick:'Under 2.5',category:'Goals',kickoff:'2099-01-01T18:00:00Z'};
assert.equal(engine.isOpposition(over,under),true);
assert.equal(engine.isOpposition(over,{...under,pick:'Under 3.5',market:'Total Goals 3.5'}),false);
assert.equal(engine.jaccard(new Set(['a','b']),new Set(['a','b','c'])),2/3);

const tip={...over,odds:1.55,league:'Test League',result:''};
const slips=[
  {code:'CODE1',source:'One',sourceKey:'source:one',clusterId:'c1',tips:[tip]},
  {code:'CODE2',source:'Two',sourceKey:'source:two',clusterId:'c2',tips:[tip]},
  {code:'CODE3',source:'Three',sourceKey:'source:three',clusterId:'c3',tips:[{...under,odds:2.2,league:'Test League'}]}
];
const rows=engine.buildTipIntelligence(slips);
const overRow=rows.find(row=>row.pick==='Over 2.5');
assert.ok(overRow);
assert.equal(overRow.independent,2);
assert.equal(overRow.uniqueSources,2);
assert.ok(overRow.oppositionShare>30&&overRow.oppositionShare<40);
assert.notEqual(overRow.tier,'Strong');
assert.equal(overRow.decision,'REVIEW');

const duplicateRows=engine.buildTipIntelligence([
  {code:'A',source:'One',sourceKey:'source:one',clusterId:'same',tips:[tip]},
  {code:'B',source:'Two',sourceKey:'source:two',clusterId:'same',tips:[tip]}
]);
assert.equal(duplicateRows[0].tier,'Avoid');
assert.ok(duplicateRows[0].noPick.some(reason=>reason.includes('independent')));
console.log('Tip intelligence engine tests passed.');
