import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const script=await readFile('scripts/sync-codehub-browser.mjs','utf8');
assert.doesNotMatch(script,/process\.exitCode\s*=\s*2/,'zero verified slips must not fail the workflow');
assert.match(script,/outcome:empty\?'empty':'verified'/);
assert.match(script,/::warning title=No verified public slips/);
assert.match(script,/collector-result\.json/);
assert.match(script,/process\.exitCode=1/,'real exceptions must still fail the workflow');

const workflow=await readFile('.github/workflows/sync-sportybet-codehub.yml','utf8');
assert.match(workflow,/upload-artifact@v4/);
assert.match(workflow,/if:\s*always\(\)/);
assert.match(workflow,/collector-result\.json/);

const browser=await readFile('server/lib/sportybet-browser.mjs','utf8');
assert.match(browser,/last_outcome = 'empty'/);
assert.match(browser,/last_error = null/);
assert.match(browser,/Nothing was published/);

console.log('v21.5.4 zero-result workflow checks passed');
