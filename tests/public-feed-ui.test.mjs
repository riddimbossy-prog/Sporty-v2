import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/render-build.sh', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

assert.match(app, /function startCodeHubCarousel\(/);
assert.match(app, /function codeHubMarketplaceItems\(/);
assert.match(app, /function categoryForCodeHub\(/);
assert.match(app, /https:\/\/www\.sportybet\.com\/gh\/m\/code-hub\/load-code/);
assert.match(app, /Public feed · Free/);
assert.match(build, /codeHubLoadUrl/);
assert.match(html, /id="codeHubPrev"/);
assert.match(html, /id="codeHubNext"/);
assert.match(html, /sporty\.codes/);
console.log('public-feed-ui-tests: passed');
