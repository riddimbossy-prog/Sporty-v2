import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const protectedPages=[
  'index.html','marketplace.html','free-codes.html','smart-board.html','most-added.html',
  'won-codes.html','performance.html','sources.html','account.html','saved.html',
  'my-codes.html','sell.html','wallet.html','install.html'
];

for(const page of protectedPages){
  const file=path.join(root,page);
  if(!fs.existsSync(file))continue;
  const html=fs.readFileSync(file,'utf8');
  assert.match(html,/data-auth-required="member"/i,`${page} must require a member session`);
  assert.match(html,/data-auth-gate="pending"/i,`${page} must start hidden until auth resolves`);
}

for(const page of ['login.html','admin-login.html','privacy.html','cache-reset.html','offline.html']){
  const html=fs.readFileSync(path.join(root,page),'utf8');
  assert.doesNotMatch(html,/data-auth-required="member"/i,`${page} must remain available before member sign-in`);
}

const auth=fs.readFileSync(path.join(root,'src/auth.js'),'utf8');
assert.match(auth,/redirectToMemberLogin/);
assert.match(auth,/PENDING_NEXT_KEY/);
assert.match(auth,/location\.replace\(`\/login\.html\?/);
assert.match(auth,/unlockMemberPage/);
assert.match(auth,/signOut\(redirect='\/login\.html\?signed_out=1'\)/);

const css=fs.readFileSync(path.join(root,'responsive.css'),'utf8');
assert.match(css,/data-auth-gate="pending"/);
assert.match(css,/visibility:\s*hidden/);

console.log('member entry gate v21.0.0 checks passed');
