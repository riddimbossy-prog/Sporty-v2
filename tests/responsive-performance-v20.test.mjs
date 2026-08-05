import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const css=fs.readFileSync(path.join(root,'responsive.css'),'utf8');
const js=fs.readFileSync(path.join(root,'src/experience.js'),'utf8');
const pages=['index.html','marketplace.html','smart-board.html','saved.html','account.html','login.html','admin-login.html','admin-users.html'];
for(const page of pages){
  const html=fs.readFileSync(path.join(root,page),'utf8');
  assert.match(html,/viewport-fit=cover/,page+' must support safe areas');
  assert.match(html,/responsive\.css\?v=21\.5\.0/,page+' must load responsive CSS');
  assert.match(html,/experience\.js\?v=21\.5\.0/,page+' must load experience runtime');
  assert.match(html,/color-scheme/,page+' must declare color scheme');
}
assert.match(css,/max-width:390px/);
assert.match(css,/max-width:900px/);
assert.match(css,/orientation:landscape/);
assert.match(css,/safe-area-inset-bottom/);
assert.match(css,/prefers-reduced-motion:reduce/);
assert.match(css,/data-performance="lite"/);
assert.match(css,/html\[data-theme="light"\]/);
assert.match(js,/visualViewport/);
assert.match(js,/IntersectionObserver/);
assert.match(js,/navigator\.connection/);
assert.match(js,/requestIdleCallback/);
for(const asset of ['logo-mark.webp','logo-wordmark-dark.webp','logo-wordmark-light.webp']){
  const stat=fs.statSync(path.join(root,'assets',asset));
  assert.ok(stat.size>0,asset+' missing');
}
console.log('v20 responsive, theme, motion and performance checks passed');
