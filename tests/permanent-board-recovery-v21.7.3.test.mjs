import assert from 'node:assert/strict';
import { enrichCollectedItemsWithEvents } from '../server/lib/data-service.mjs';

const kickoff='2026-08-05T18:30:00.000Z';
const source=[{code:'ABC123',tips:[{fixture:'Accra Lions v Hearts of Oak',market:'Over/Under',pick:'Over 1.5',odds:1.25,kickoff:null}]}];
const events=[{event_id:'evt-1',home_team:'Accra Lions FC',away_team:'Hearts of Oak',fixture:'Accra Lions FC vs Hearts of Oak',league:'Ghana Premier League',kickoff}];
const enriched=enrichCollectedItemsWithEvents(source,events);
assert.equal(enriched.recovered,1);
assert.equal(enriched.items[0].tips[0].kickoff,kickoff);
assert.equal(enriched.items[0].tips[0].kickoff_source,'custom-api-events');
const unmatched=enrichCollectedItemsWithEvents(source,[{fixture:'Other FC vs Different FC',kickoff}]);
assert.equal(unmatched.recovered,0);
assert.equal(unmatched.items[0].tips[0].kickoff,null);
console.log('permanent board recovery v21.7.3 test passed');
