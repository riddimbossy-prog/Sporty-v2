import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const exists=file=>fs.existsSync(path.join(root,file));

for(const file of [
  'assets/logo-email.png',
  'supabase/email-templates/confirm-signup.html',
  'supabase/email-templates/reset-password.html',
  'supabase/email-templates/password-changed.html',
  'BRANDED_EMAIL_SETUP.md',
  'RESEND_SMTP_SETUP.md'
]) assert.equal(exists(file),true,`missing ${file}`);

const confirm=read('supabase/email-templates/confirm-signup.html');
const reset=read('supabase/email-templates/reset-password.html');
const changed=read('supabase/email-templates/password-changed.html');

for(const html of [confirm,reset,changed]){
  assert.match(html,/https:\/\/sporty\.codes\/assets\/logo-email\.png/);
  assert.match(html,/https:\/\/sporty\.codes\/privacy\.html/);
  assert.match(html,/sporty\.codes/);
  assert.doesNotMatch(html,/service[_ -]?role|SUPABASE_URL|smtp password|re_[A-Za-z0-9]{10,}/i);
}
assert.match(confirm,/\{\{ \.ConfirmationURL \}\}/);
assert.match(reset,/\{\{ \.ConfirmationURL \}\}/);
assert.doesNotMatch(changed,/\{\{ \.ConfirmationURL \}\}/);

const login=read('login.html');
const loginJs=read('src/login.js');
assert.match(login,/confirmPassword/);
assert.match(login,/passwordStrength/);
assert.match(login,/Continue with Google/);
assert.match(loginJs,/PASSWORD_RECOVERY/);
assert.match(loginJs,/signOut\(\{scope:'others'\}\)/);
assert.match(loginJs,/friendlyError/);
assert.match(loginJs,/recovery=1/);

const sw=read('service-worker.js');
assert.match(sw,/sporty-codes-v21\.5\.0/);
assert.match(sw,/logo-wordmark-dark\.webp/);

console.log('v19.8 branded auth email checks passed');
