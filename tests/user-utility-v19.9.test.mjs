import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const exists=file=>fs.existsSync(path.join(root,file));

for(const file of [
  'account.html','saved.html','src/saved.js','src/account.js','src/saved-page.js',
  'supabase/migrations/004_user_utility_admin_controls.sql'
]) assert.equal(exists(file),true,`missing ${file}`);

const saved=read('src/saved.js');
assert.match(saved,/sporty_saved_guest_v199/);
assert.match(saved,/from\('saved_items'\)/);
assert.match(saved,/upsert\(rows/);
assert.match(saved,/recordRecentCode/);
assert.match(saved,/Guest saves|guest/i);
assert.doesNotMatch(saved,/service_role|SUPABASE_SERVICE_ROLE/i);

const account=read('account.html');
const accountJs=read('src/account.js');
assert.match(account,/Saved codes and tips|Your shortlist/i);
assert.doesNotMatch(account,/Approximate area|locationOptIn|Share my approximate area/);
assert.match(account,/Request account deletion/);
assert.match(accountJs,/signOut\(\{scope:'global'\}\)/);
assert.match(accountJs,/request_account_deletion/);
assert.match(accountJs,/user_preferences/);
const accountVisible=account.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ');
assert.doesNotMatch(accountVisible,/Supabase|Render|GitHub/i);
assert.doesNotMatch(account,/admin-users|Admin dashboard/i);

const migration=read('supabase/migrations/004_user_utility_admin_controls.sql');
for(const token of ['create table if not exists public.user_preferences','create table if not exists public.saved_items','create table if not exists public.account_deletion_requests','create table if not exists public.admin_action_log','create or replace function public.admin_user_control','create or replace function public.request_account_deletion']) assert.match(migration,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
assert.match(migration,/row level security/i);
assert.match(migration,/sportycodesofficial@gmail\.com/);
assert.match(migration,/p_target_user=v_admin/);
assert.match(migration,/delete from auth\.sessions/);
assert.match(migration,/account_status='deleted'/);
assert.match(migration,/Recent administrator sign-in required/);
assert.doesNotMatch(migration,/grant select,insert,update on public\.account_deletion_requests/);

const admin=read('src/admin-users.js');
assert.match(admin,/Sanitized|sanitized/i);
assert.match(admin,/revoke_sessions/);
assert.match(admin,/erase_app_data/);
assert.match(admin,/isRecentAdminSession/);
assert.match(admin,/maskEmail/);

for(const page of ['index.html','marketplace.html','smart-board.html','most-added.html','won-codes.html']){
  const html=read(page);
  assert.match(html,/\/saved\.html/);
  assert.match(html,/\/src\/saved\.js\?v=21\.5\.4/);
}

const build=read('scripts/render-build.sh');
assert.match(build,/account\.html saved\.html/);
assert.match(build,/004_user_utility_admin_controls\.sql/);
assert.match(build,/rm -rf .*supabase/);

console.log('v19.9 personal account, saved items and admin controls checks passed');
