import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

assert.equal(existsSync('CNAME'),false,'Fresh-start repository must not claim a production domain');
assert.deepEqual(readdirSync('.github/workflows').sort(),['validate.yml']);
const blueprint=readFileSync('render.yaml','utf8');
assert.match(blueprint,/name:\s*sporty-codes-staging/);
assert.match(blueprint,/CUSTOM_API_ADMIN_TOKEN[\s\S]*generateValue:\s*true/);
const events=JSON.parse(readFileSync('sportybet-events.json','utf8'));
assert.equal(events.count,0);
const codes=JSON.parse(readFileSync('data/codehub-banner.json','utf8'));
assert.equal(codes.count,0);
assert.ok(existsSync('deployment-check.html'));
assert.ok(existsSync('START_HERE.md'));
console.log('v21.3 fresh-start repository checks passed.');
