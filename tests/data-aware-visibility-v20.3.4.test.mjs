import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const home=read('index.html');
const board=read('smart-board.html');
const market=read('marketplace.html');
const mvp=read('src/mvp.js');
const intel=read('src/intelligence.js');
const css=read('styles.css');

for(const id of ['homeCodeHubSection','strongTipsSection','conflictPreviewSection','marketplacePreviewSection','consensusPreviewSection','winnerPreviewSection']){
  assert.match(home,new RegExp(`id=\"${id}\"[^>]*data-population-section[^>]*hidden`));
}
assert.match(market,/id="marketCodeHubSection"[^>]*data-population-section[^>]*hidden/);
assert.match(market,/id="codeBrowserSection"[^>]*data-population-section[^>]*hidden/);
for(const id of ['intelligenceStatsSection','smartBoardSection','contradictions']) assert.match(board,new RegExp(`id=\"${id}\"[^>]*data-population-section[^>]*hidden`));
assert.match(mvp,/function setPopulated\(/);
assert.match(mvp,/setPopulated\(root,items\.length>0\)/);
assert.match(mvp,/const items=displayableCodes\(\);setPopulated\(root,items\.length>0\);clear\(root\);if\(!items\.length\)return/);
assert.match(mvp,/setPopulated\(homeRoot,preview\.length>0\)/);
assert.match(intel,/setPopulated\(root,hasModel\)/);
assert.match(intel,/setPopulated\(root,model\.contradictions\.length>0\)/);
assert.match(intel,/setPopulated\(root,model\.sourceRows\.length>0\)/);
assert.match(intel,/setPopulated\(root,model\.performanceRows\.length>0\)/);
assert.match(css,/\[data-population-section\]\[hidden\]/);
assert.doesNotMatch(mvp,/Preparing the first fresh codes/);
assert.doesNotMatch(intel,/No direct contradictions found/);
console.log('Data-aware visibility v21.0.0 checks passed');
