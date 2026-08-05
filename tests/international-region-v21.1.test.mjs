import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

assert.equal(read('VERSION').trim(),'21.6.0','version should be 21.6.0');
assert.ok(fs.existsSync(path.join(root,'international.html')),'international page must exist');
assert.ok(fs.existsSync(path.join(root,'src/region.js')),'region controller must exist');
assert.ok(fs.existsSync(path.join(root,'src/international.js')),'international feed controller must exist');

const index=read('index.html');
const international=read('international.html');
const region=read('src/region.js');
const internationalJs=read('src/international.js');
const mvp=read('src/mvp.js');
const config=read('config.js');
const build=read('scripts/render-build.sh');
const render=read('render.yaml');
const worker=read('service-worker.js');
const server=read('server/index.mjs');

assert.match(index,/src\/region\.js\?v=21\.6\.0/,'Ghana home should load the shared region controller');
assert.match(config,/sportybet\.com\/gh\/m\/code-hub\/load-code/,'original Ghana load-code URL must remain');
assert.match(config,/sportyOfficialUrl:\s*'https:\/\/www\.sportybet\.com\/'/,'international flow should use the official generic destination');
assert.match(international,/data-region="international"/,'international page should identify its region');
assert.match(international,/Nigeria[\s\S]*Kenya[\s\S]*Tanzania[\s\S]*Zambia[\s\S]*Uganda[\s\S]*South Africa[\s\S]*Brazil/,'supported country choices should be present');
assert.match(international,/18\+ only/,'international page must keep the adult-use notice');
assert.match(international,/does not transfer accounts, balances or booking codes between countries/i,'international limitation must be explicit');
assert.match(region,/sporty_region_preference_v1/,'manual region preference should be persisted');
assert.match(region,/Africa\/Accra/,'Ghana browser-timezone detection should be present');
assert.match(region,/\/international\.html/,'outside-Ghana routing should target the international page');
assert.match(mvp,/internationalMode\(\)\?'Use internationally':'Load Sporty'/,'code buttons should respect the selected region');
assert.match(mvp,/international\.html\?code=/,'international clicks should open the rebuild page');
assert.match(read('src/saved-page.js'),/Use internationally/,'saved codes should respect international mode');
assert.match(read('src/saved-page.js'),/international\.html\?code=/,'saved international codes should open the rebuild page');
assert.match(internationalJs,/Copy selections/,'international users should be able to copy mapped selections');
assert.match(internationalJs,/Market names and odds can differ by country/,'country variation warning should be rendered');
assert.match(build,/international\.html/,'Render build should publish the international page');
assert.match(build,/src\/region\.js src\/international\.js/,'Render build should publish regional scripts');
assert.match(render,/runtime:\s*node/,'Render should start the same-domain Node service');
assert.match(server,/'\/international':'international\.html'/,'Server should expose the clean international route');
assert.match(worker,/'\/international':'\/international\.html'/,'service worker should support offline international routing');

console.log('international region v21.1 tests passed');
