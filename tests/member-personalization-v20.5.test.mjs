import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const index=read('index.html');
const account=read('account.html');
const member=read('src/member-home.js');
const saved=read('src/saved.js');
const migration=read('supabase/migrations/006_member_personalization.sql');
const styles=read('styles.css');
const sw=read('service-worker.js');
const render=read('scripts/render-build.sh');

assert.match(index,/id="memberHomeSection"/);
assert.match(index,/data-member-view="for-you"/);
assert.match(index,/data-member-view="all"/);
assert.match(index,/id="quickPreferencesButton"/);
assert.match(index,/not a recommendation or a guarantee/i);
assert.match(account,/id="selectionsMin"/);
assert.match(account,/id="selectionsMax"/);
assert.match(account,/id="digestFrequency"/);
assert.match(account,/id="ageConfirmed"/);
assert.match(member,/onboarding_completed/);
assert.match(member,/age_confirmed_at/);
assert.match(member,/member-menu/);
assert.match(member,/scoreCode/);
assert.match(member,/displayableCodes/);
assert.match(saved,/recent_items/);
assert.match(saved,/loadRecent/);
assert.match(migration,/create table if not exists public\.recent_items/i);
assert.match(migration,/digest_frequency/);
assert.match(styles,/\.member-preferences-dialog/);
assert.match(styles,/\.member-menu/);
assert.match(sw,/sporty-codes-v21\.4\.0/);
assert.match(sw,/\/src\/member-home\.js/);
assert.match(render,/006_member_personalization\.sql/);
assert.match(render,/direct-public-sportybet-custom-api/);

console.log('v20.5 member personalization checks passed');
