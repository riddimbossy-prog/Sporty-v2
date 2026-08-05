import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const render=await readFile('render.yaml','utf8');
assert.match(render,/runtime:\s*node/);
assert.match(render,/SPORTYBET_BROWSER_COLLECTOR_ENABLED[\s\S]*value:\s*false/);
assert.match(render,/SPORTYBET_BROWSER_EXECUTION_MODE[\s\S]*value:\s*github-actions/);
assert.doesNotMatch(render,/runtime:\s*docker/);

const workflow=await readFile('.github/workflows/sync-sportybet-codehub.yml','utf8');
assert.match(workflow,/workflow_dispatch:/);
assert.match(workflow,/schedule:/);
assert.match(workflow,/scripts\/sync-codehub-browser\.mjs/);
assert.match(workflow,/SUPABASE_URL/);
assert.match(workflow,/SUPABASE_SERVICE_ROLE_KEY/);

const server=await readFile('server/index.mjs','utf8');
assert.match(server,/execution mode:/);
assert.doesNotMatch(server,/setInterval\(run/);
assert.match(server,/runs in GitHub Actions/);

console.log('v21.5.3.1 external browser-runner checks passed');
