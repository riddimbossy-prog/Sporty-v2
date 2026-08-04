import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

for(const file of ['login.html','admin-users.html','src/auth.js','src/login.js','src/admin-users.js','supabase/migrations/002_auth_presence_admin.sql']){
  assert.equal(fs.existsSync(path.join(root,file)),true,`missing ${file}`);
}

const login=read('login.html');
assert.match(login,/Continue with Google/);
assert.match(login,/type="email"/);
assert.doesNotMatch(login,/Share a broad area|browser location|shareLocation/);

const auth=read('src/auth.js');
assert.match(auth,/signInWithOAuth|heartbeat_user_presence/);
assert.match(auth,/heartbeat_user_presence/);
assert.doesNotMatch(auth,/navigator\.geolocation|captureApproxLocation/);
assert.match(auth,/p_approx_lat:null/);
assert.doesNotMatch(auth,/service_role/i);

const admin=read('src/admin-users.js');
assert.match(admin,/online_users/);
assert.match(admin,/admin_presence_dashboard/);
assert.match(admin,/Online now/);
assert.match(admin,/Activity/);
assert.doesNotMatch(admin,/Permission not granted|Broad area/);

const sql=read('supabase/migrations/002_auth_presence_admin.sql');
for(const token of ['user_presence','user_signins','record_user_sign_in','heartbeat_user_presence','admin_presence_dashboard','Admin access required']){
  assert.match(sql,new RegExp(token));
}
assert.match(sql,/last_seen_at > now\(\)-interval '120 seconds'/);
assert.match(sql,/round\(p_approx_lat,1\)/);
assert.match(sql,/public\.is_admin\(\)/);

for(const page of ['index.html','marketplace.html','smart-board.html','most-added.html','won-codes.html','performance.html','sources.html']){
  const html=read(page);
  assert.match(html,/data-auth-link/);
  assert.match(html,/src\/auth\.js\?v=21\.3\.0/);
  assert.match(html,/supabase-js@2/);
}

console.log('v19.7 auth and presence static checks passed');
