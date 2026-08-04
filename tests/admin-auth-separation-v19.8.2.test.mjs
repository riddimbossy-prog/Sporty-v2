import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const exists=file=>fs.existsSync(path.join(root,file));

for(const file of [
  'admin-login.html',
  'src/admin-login.js',
  'supabase/migrations/003_official_admin_lockdown.sql',
  'admin-users.html',
  'control-room.html',
  'src/admin-users.js',
  'src/control-room.js'
]) assert.equal(exists(file),true,`missing ${file}`);

const normalLogin=read('login.html');
const normalLoginJs=read('src/login.js');
const auth=read('src/auth.js');
assert.doesNotMatch(normalLogin,/Admin dashboard|adminDashboardLink/i,'member account page must not expose admin controls');
assert.doesNotMatch(normalLoginJs,/adminDashboardLink|role\s*!==?\s*['"]admin/i,'member login script must not render admin controls');
assert.doesNotMatch(auth,/admin-shortcut|Open admin dashboard/i,'shared auth must not inject admin UI into public pages');
assert.match(auth,/current_user_access/);
assert.match(auth,/isAdmin:\(\)=>access\.is_admin===true/);

const adminLogin=read('admin-login.html');
const adminLoginJs=read('src/admin-login.js');
assert.match(adminLogin,/Administrator sign in/);
assert.match(adminLogin,/sportycodesofficial@gmail\.com/);
assert.match(adminLogin,/Continue with official Google account/);
assert.doesNotMatch(adminLogin,/Create account|data-auth-mode="signup"/i,'admin page must not offer registration');
assert.match(adminLoginJs,/OFFICIAL_ADMIN_EMAIL='sportycodesofficial@gmail\.com'/);
assert.match(adminLoginJs,/auth\.isAdmin\(\)/);
assert.match(adminLoginJs,/admin-login\.html\?oauth=1/);
assert.match(adminLoginJs,/signOut\('\/admin-login\.html'\)/);

const adminUsersJs=read('src/admin-users.js');
const controlJs=read('src/control-room.js');
for(const script of [adminUsersJs,controlJs]){
  assert.match(script,/auth\.refreshAccess\(\)/);
  assert.match(script,/auth\.isAdmin\(\)/);
  assert.match(script,/admin-login\.html/);
}

const migration=read('supabase/migrations/003_official_admin_lockdown.sql');
assert.match(migration,/update public\.profiles set role='user' where role='admin'/);
assert.match(migration,/sportycodesofficial@gmail\.com/);
assert.match(migration,/email_confirmed_at is not null/);
assert.match(migration,/create or replace function public\.current_user_access/);
assert.match(migration,/create or replace function public\.is_admin/);
assert.doesNotMatch(migration,/predict2u@gmail\.com/i);

const render=read('render.yaml');
const server=read('server/index.mjs');
const build=read('scripts/render-build.sh');
const sw=read('service-worker.js');
assert.match(render,/startCommand:\s*node server\/index\.mjs/);
assert.match(server,/'\/admin-login':'admin-login\.html'/);
assert.match(build,/admin-login\.html/);
assert.match(build,/src\/admin-login\.js/);
assert.match(build,/003_official_admin_lockdown\.sql/);
assert.match(build,/rm -rf .*supabase/,'backend setup files should be removed from public output');
assert.match(sw,/admin-login\.html/);
assert.match(sw,/src\/admin-login\.js/);

console.log('v19.8.2 member/admin authentication separation checks passed');
