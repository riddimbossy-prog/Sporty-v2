const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const {webcrypto}=require('crypto');

class Storage{
  constructor(){this.map=new Map()}
  getItem(key){return this.map.has(key)?this.map.get(key):null}
  setItem(key,value){this.map.set(key,String(value))}
  removeItem(key){this.map.delete(key)}
}

global.crypto=webcrypto;
global.localStorage=new Storage();
global.window={
  SPORTY_CONFIG:{mode:'demo',currency:'GHS',platformFeePercent:10,demoStartingBalance:50},
  supabase:null
};

for(const file of ['src/demo-data.js','src/backend.js']){
  vm.runInThisContext(fs.readFileSync(file,'utf8'),{filename:file});
}

(async()=>{
  const backend=window.SportyBackend;
  await backend.init();
  assert.equal(backend.mode,'demo');
  assert.equal((await backend.currentUser()).id,'demo-user');
  assert.equal((await backend.getWallet()).balance,50);

  await backend.topUp(25);
  assert.equal((await backend.getWallet()).balance,75);

  const paid=(await backend.listListings()).find(item=>item.id==='demo-kwame-safe');
  const purchase=await backend.purchase(paid.id);
  assert.equal(purchase.already_owned,false);
  assert.equal((await backend.getWallet()).balance,70);
  assert.equal(await backend.reveal(paid.id),'DEMOKWAME');

  const repeat=await backend.purchase(paid.id);
  assert.equal(repeat.already_owned,true);
  assert.equal((await backend.getWallet()).balance,70);

  const expires=new Date(Date.now()+86400000).toISOString();
  const id=await backend.createListing({title:'My prototype listing',category:'Goals',odds:2.2,selections:2,price:4,expires_at:expires,code:'MINE1234',note:'Test'});
  const seller=await backend.getSellerDashboard();
  assert(seller.listings.some(item=>item.id===id));

  await assert.rejects(()=>backend.purchase(id),/own listing/i);
  await assert.rejects(()=>backend.purchase('demo-expired'),/no longer available/i);
  console.log('demo-backend-tests: passed');
})().catch(error=>{console.error(error);process.exit(1)});
