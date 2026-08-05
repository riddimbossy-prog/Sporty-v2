import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code=fs.readFileSync(new URL('../src/custom-api-match.js',import.meta.url),'utf8');
const sandbox={window:{},Date,Set,Map,String,Number,Math};
vm.createContext(sandbox);
vm.runInContext(code,sandbox);
const api=sandbox.window.SportyCustomApiMatch;
assert.ok(api,'custom API matcher should be exposed');

const kickoff=new Date(Date.now()+4*60*60*1000).toISOString();
const events=api.normalizeEvents({events:[{
  event_id:'sb-1',home_team:'Accra Lions FC',away_team:'Hearts of Oak',league:'Ghana Premier League',kickoff
}]});
assert.equal(events.length,1);
const recovered=api.reconcileTip({fixture:'Accra Lions v Hearts of Oak',market:'Over/Under',pick:'Over 1.5',odds:1.25,kickoff:null},events);
assert.equal(recovered.kickoff,kickoff,'missing tip date should be recovered from the custom event feed');
assert.equal(recovered.kickoff_source,'custom-api-events');
assert.equal(recovered.league,'Ghana Premier League');

const unknown=api.reconcileTip({fixture:'Unknown Town vs Another Club',market:'1X2',pick:'Home',kickoff:null},events);
assert.equal(unknown.kickoff,null,'unmatched fixtures must remain undated');

const dataService=fs.readFileSync(new URL('../server/lib/data-service.mjs',import.meta.url),'utf8');
assert.match(dataService,/if\(!events\.length&&enabled\('ALLOW_API_FOOTBALL_FALLBACK'\)\)/,'API-Football fallback must be opt-in');
const render=fs.readFileSync(new URL('../render.yaml',import.meta.url),'utf8');
assert.match(render,/ALLOW_API_FOOTBALL_FALLBACK\s*\n\s*value:\s*false/,'Render must default to the custom SportyBet event source');

console.log('custom API fixture reconciliation v21.7.3 test passed');
