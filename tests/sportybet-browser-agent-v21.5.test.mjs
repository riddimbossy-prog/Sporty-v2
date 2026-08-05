import assert from 'node:assert/strict';
import { ChromiumSession } from '../server/lib/chromium-cdp.mjs';
import { __test } from '../server/lib/sportybet-browser.mjs';

const payload={
  data:{
    codes:[
      {bookingCode:'AB12CD',totalOdds:12.45,selectionCount:2,title:'Public combo'},
      {bookingCode:'ZX90QW',totalOdds:4.21,selectionCount:1,title:'Goals combo'}
    ]
  }
};
const parsed=__test.scanObjects(payload,'https://www.sportybet.com/gh/m/code-hub/codes');
assert.equal(parsed.length,2);
assert.equal(parsed.find(x=>x.code==='AB12CD').odds,12.45);

const booking={
  bookingCode:'AB12CD',
  totalOdds:12.45,
  selections:[
    {eventName:'Arsenal vs Chelsea',marketName:'Over/Under',selectionName:'Over 1.5',odds:1.25,tournamentName:'Premier League',startTime:'2026-08-05T18:00:00Z'},
    {eventName:'Milan vs Inter',marketName:'Double Chance',selectionName:'1X',odds:1.32,tournamentName:'Serie A',startTime:'2026-08-05T20:00:00Z'}
  ]
};
const tips=__test.scanTips(booking);
assert.equal(tips.length,2);
const arsenal=tips.find(x=>x.fixture==='Arsenal vs Chelsea');
assert.ok(arsenal);
assert.equal(arsenal.market,'Over/Under');
assert.equal(arsenal.pick,'Over 1.5');

const session=new ChromiumSession();
try{
  await session.start();
  await session.evaluate(`document.body.innerHTML=${JSON.stringify(`
    <main>
      <article class="code-card"><span>Booking code</span><strong>AB12CD</strong><span>Total odds 12.45</span><span>2 selections</span></article>
      <article class="code-card"><span>Booking code</span><strong>ZX90QW</strong><span>Total odds 4.21</span><span>1 selection</span></article>
    </main>`)}; true`);
  const dom=await session.evaluate(__test.DOM_CODE_SCRIPT);
  const domItems=__test.domCandidates(dom,'https://www.sportybet.com/gh/m/code-hub/codes');
  assert.equal(new Set(domItems.map(x=>x.code)).size,2);

  await session.evaluate(`document.body.innerHTML=${JSON.stringify(`
    <input id="bookingCode" placeholder="Booking code">
    <button id="load">Load code</button>
    <main id="slip"></main>`)};
    document.getElementById('load').onclick=()=>{document.getElementById('slip').innerHTML='<div>Total odds 12.45</div><article class="selection"><b>Arsenal vs Chelsea</b><span>Over/Under</span><span>Over 1.5</span><span>1.25</span></article>';}; true`);
  const form=await session.evaluate(__test.LOAD_FORM_SCRIPT('AB12CD'));
  assert.equal(form.submitted,true);
  const loaded=await session.evaluate(`({value:document.getElementById('bookingCode').value,text:document.body.innerText})`);
  assert.equal(loaded.value,'AB12CD');
  assert.match(loaded.text,/Arsenal vs Chelsea/);
  console.log('sportybet browser-agent v21.5 test passed');
}finally{
  await session.close();
}
