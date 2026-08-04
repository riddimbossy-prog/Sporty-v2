import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getCodeHubCodes, getUpcomingEvents, getSystemStatus, searchMatches } from '../server/lib/data-service.mjs';

for(const file of ['server/index.mjs','server/lib/data-service.mjs','scripts/sync-codehub.mjs','scripts/elite-sync.mjs','render.yaml']){
  const source=await readFile(file,'utf8');
  const forbidden=[['par','se','.','bot'].join(''),['PARSE','BOT'].join(''),['BETEXPLORER','_PARSE'].join('')];
  for(const token of forbidden)assert.equal(source.toLowerCase().includes(token.toLowerCase()),false,`${file} still contains a retired paid pass-through dependency`);
}
const render=await readFile('render.yaml','utf8');
assert.match(render,/runtime:\s*node/);
assert.match(render,/startCommand:\s*node server\/index\.mjs/);
assert.match(render,/healthCheckPath:\s*\/api\/health/);
assert.doesNotMatch(render,/SUPABASE_SERVICE_ROLE_KEY/,'Blueprint must be able to boot before secrets are connected');
const build=await readFile('scripts/render-build.sh','utf8');
assert.match(build,/setup mode/);
assert.match(build,/allowDemoFallback: false/);
assert.match(build,/codeHubFeedUrl:\s*"\/api\/get_code_hub_codes"/);
assert.match(build,/upcomingEventsUrl:\s*"\/api\/get_upcoming_events"/);
const migration=await readFile('supabase/migrations/007_custom_api.sql','utf8');
for(const table of ['api_cache','booking_codes','booking_code_selections','api_request_usage'])assert.match(migration,new RegExp(`create table if not exists public\\.${table}`));
const status=await getSystemStatus();
assert.equal(typeof status.ready,'boolean');
const codes=await getCodeHubCodes({limit:2});
assert.ok(Array.isArray(codes.items));
assert.equal(codes.source,'sporty.codes-custom-api');
const events=await getUpcomingEvents({days:1});
assert.ok(Array.isArray(events.events));
const day=events.events[0]?.kickoff?.slice(0,10)||'';
const matches=await searchMatches(day);
assert.ok(Array.isArray(matches.matches));
console.log('v21.3 custom API tests passed.');
