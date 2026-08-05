import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
process.env.SPORTYBET_PUBLIC_COLLECTOR_ENABLED='false';
const { getCodeHubCodes, getUpcomingEvents, getSystemStatus, getSourceStatus, searchMatches }=await import('../server/lib/data-service.mjs');

for(const file of ['server/index.mjs','server/lib/data-service.mjs','server/lib/sportybet-public.mjs','scripts/sync-codehub.mjs','scripts/elite-sync.mjs','render.yaml']){
  const source=await readFile(file,'utf8');
  const forbidden=[['par','se','.','bot'].join(''),['PARSE','BOT'].join(''),['BETEXPLORER','_PARSE'].join('')];
  for(const token of forbidden)assert.equal(source.toLowerCase().includes(token.toLowerCase()),false,`${file} still contains a retired paid pass-through dependency`);
}
const render=await readFile('render.yaml','utf8');
assert.match(render,/runtime:\s*docker/);
assert.match(render,/dockerfilePath:\s*\.\/Dockerfile/);
assert.match(render,/healthCheckPath:\s*\/api\/health/);
assert.match(render,/SPORTYBET_PUBLIC_EVENTS_URL/);
assert.match(render,/SPORTYBET_PUBLIC_CODEHUB_URL/);
assert.doesNotMatch(render,/SUPABASE_SERVICE_ROLE_KEY/,'Blueprint must be able to boot before secrets are connected');
const build=await readFile('scripts/render-build.sh','utf8');
assert.match(build,/src\/market-board\.js/);
assert.match(build,/server\/lib\/sportybet-public\.mjs/);
assert.match(build,/codeHubFeedUrl:\s*"\/api\/get_code_hub_codes"/);
assert.match(build,/upcomingEventsUrl:\s*"\/api\/get_upcoming_events"/);
const status=await getSystemStatus();
assert.equal(typeof status.ready,'boolean');
assert.equal(status.collector,'sportybet-browser-agent');
assert.equal(status.configuration.api_football_optional,true);
const sourceStatus=await getSourceStatus();
assert.equal(sourceStatus.public_only,true);
assert.equal(sourceStatus.uses_private_cookies,false);
const codes=await getCodeHubCodes({limit:2});
assert.ok(Array.isArray(codes.items));
const events=await getUpcomingEvents({days:1});
assert.ok(Array.isArray(events.events));
const day=events.events[0]?.kickoff?.slice(0,10)||'';
const matches=await searchMatches(day);
assert.ok(Array.isArray(matches.matches));
console.log('v21.4 custom API tests passed.');
