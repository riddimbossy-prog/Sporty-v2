import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile('server/lib/data-service.mjs','utf8');
assert.match(source,/Array\.isArray\(item\.tips\)&&item\.tips\.length>0/,'auto-collected public rows must require verified tips');
assert.match(source,/if\(!tips\.length\)continue;/,'zero-tip candidates must not be persisted');
assert.match(source,/booking_code_selections\(id\)/,'cleanup must inspect stored selections');
assert.match(source,/purgeUnverifiedAutoCollectedRows/,'unverified historical auto rows must be removed');
assert.match(source,/version:11/,'public feed contract must advertise the verified-slip revision');
console.log('data-service verified feed v21.5.4 test passed');
