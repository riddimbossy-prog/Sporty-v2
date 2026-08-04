import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const pages=['index.html','marketplace.html','smart-board.html','most-added.html','won-codes.html','performance.html','sources.html'];
for(const page of pages){
  const raw=await readFile(new URL('../'+page,import.meta.url),'utf8');
  const visible=raw.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').toLowerCase();
  for(const word of ['supabase','render.com','github','service_role'])assert.equal(visible.includes(word),false,`${page} exposes ${word} in visible copy`);
  assert.match(raw,/src\/stability\.js\?v=21\.4\.1/);
}
const mvp=await readFile(new URL('../src/mvp.js',import.meta.url),'utf8');assert.match(mvp,/sporty_codes_last_good_feed_v196/);assert.match(mvp,/codeHubLoadUrl/);
const admin=await readFile(new URL('../control-room.html',import.meta.url),'utf8');assert.match(admin,/noindex,nofollow/);assert.doesNotMatch(admin,/Supabase|Render/);
console.log('Privacy and stability checks passed');
