import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../src/mvp.js', import.meta.url),'utf8');
const callbacks={};
const context={
  window:{SPORTY_CONFIG:{
    codeHubLoadUrl:'https://www.sportybet.com/gh/m/code-hub/load-code',
    sportybetAppSchemeUrl:'sportybet://code-hub/load-code',
    sportybetAppHomeScheme:'sportybet://',
    sportybetAndroidPackage:'com.sportybet.android.gp',
    sportybetAndroidStoreUrl:'https://play.google.com/store/apps/details?id=com.sportybet.android.gp',
    sportybetIosStoreUrl:'https://apps.apple.com/gh/app/sportybet-sports-betting/id1504038308'
  },location:{href:'https://sporty.codes/'}},
  navigator:{userAgent:'Mozilla/5.0 (Linux; Android 14)',clipboard:{writeText:async()=>{}}},
  document:{body:{dataset:{}},querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(name,fn)=>{callbacks[name]=fn},visibilityState:'visible'},
  localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
  matchMedia:()=>({matches:false}),
  fetch:async()=>{throw new Error('unused')},
  setTimeout,clearTimeout,setInterval,clearInterval,console,URL,URLSearchParams,Date,Number,String,Map,Set,Math,Intl,encodeURIComponent
};
context.window.window=context.window;
vm.createContext(context);
vm.runInContext(source,context);
const t=context.window.__SPORTY_MVP_TEST__;
assert.ok(t,'test hooks missing');
const appLink=t.androidBrowsableIntent('ABC123');
assert.match(appLink,/^intent:\/\/code-hub\/load-code\?code=ABC123/);
assert.match(appLink,/scheme=sportybet/);
assert.match(appLink,/category=android\.intent\.category\.BROWSABLE/);
assert.doesNotMatch(appLink,/MAIN|LAUNCHER|package=/);
const codeHub=t.androidCodeHubWebIntent();
assert.match(codeHub,/^intent:\/\/www\.sportybet\.com\/gh\/m\/code-hub\/load-code/);
assert.match(codeHub,/scheme=https/);
assert.doesNotMatch(codeHub,/package=/);
assert.equal(t.isoDay('2026-08-01T18:30:00Z'),'2026-08-01');
assert.equal(t.dayFilterMatches(null,'undated'),true);
assert.equal(t.dayFilterMatches(new Date().toISOString(),'today'),true);
console.log('app-link-day-v19.6: passed');
