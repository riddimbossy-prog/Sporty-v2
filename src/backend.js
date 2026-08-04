(function(){
  'use strict';

  const CONFIG = window.SPORTY_CONFIG || {};
  const STORAGE_KEY = 'sporty_codes_v15_demo_state';

  const nowIso = () => new Date().toISOString();
  const clone = value => JSON.parse(JSON.stringify(value));
  const isConfigured = () => {
    const url = String(CONFIG.supabaseUrl || '');
    const key = String(CONFIG.supabaseAnonKey || '');
    return url.startsWith('https://') && !url.includes('YOUR_PROJECT') && key.length > 30 && !key.includes('YOUR_SUPABASE');
  };

  function safeNumber(value, fallback = 0){
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function activeListing(listing){
    const validStatus = listing.status === 'approved';
    const upcoming = listing.matches_status === 'upcoming';
    const expiry = Date.parse(listing.expires_at);
    return validStatus && upcoming && Number.isFinite(expiry) && expiry > Date.now();
  }

  class DemoBackend {
    constructor(){
      this.mode = 'demo';
      this.listeners = [];
      this.state = this.load();
    }

    load(){
      try{
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if(saved && typeof saved === 'object') return saved;
      }catch(error){ console.warn('Could not read demo state', error); }
      const state = {
        user:{id:'demo-user',email:'demo@sporty.codes',display_name:'Demo Buyer',username:'demo_buyer',verified:false},
        balance:safeNumber(CONFIG.demoStartingBalance,50),
        purchases:[],
        transactions:[{
          id:crypto.randomUUID(),kind:'demo_credit',amount:safeNumber(CONFIG.demoStartingBalance,50),balance_after:safeNumber(CONFIG.demoStartingBalance,50),note:'Starting prototype balance',created_at:nowIso()
        }],
        customListings:[]
      };
      localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
      return state;
    }

    save(){ localStorage.setItem(STORAGE_KEY,JSON.stringify(this.state)); }
    emit(){ this.listeners.forEach(listener=>listener()); }
    onAuthChange(listener){ this.listeners.push(listener); return ()=>{this.listeners=this.listeners.filter(item=>item!==listener)}; }
    async init(){ return this; }
    async currentUser(){ return clone(this.state.user); }
    async signIn(){ throw new Error('Demo mode already uses a local test account.'); }
    async signUp(){ throw new Error('Connect Supabase to create real accounts.'); }
    async signOut(){ throw new Error('Demo mode keeps one local test account.'); }

    allListings(){
      return [...clone(window.SPORTY_DEMO_LISTINGS || []),...clone(this.state.customListings || [])];
    }

    async listListings(){ return this.allListings(); }
    async getWallet(){ return {balance:safeNumber(this.state.balance),currency:CONFIG.currency || 'GHS'}; }

    async getPurchases(){
      const listings = this.allListings();
      return (this.state.purchases || []).map(purchase=>({
        ...clone(purchase),
        listing:clone(listings.find(item=>item.id===purchase.listing_id) || null)
      })).filter(item=>item.listing);
    }

    async getTransactions(){
      return clone(this.state.transactions || []).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
    }

    async getSellerDashboard(){
      const listings = this.allListings().filter(item=>item.seller_id===this.state.user.id);
      const sales = (this.state.purchases || []).filter(item=>item.seller_id===this.state.user.id);
      const earned = sales.reduce((sum,item)=>sum+safeNumber(item.seller_earning),0);
      return {listings,sales_count:sales.length,lifetime_earned:earned,available_balance:earned};
    }

    async topUp(amount){
      const value = safeNumber(amount);
      if(value < 1 || value > 5000) throw new Error('Demo top-up must be between GH₵1 and GH₵5,000.');
      this.state.balance = Number((safeNumber(this.state.balance)+value).toFixed(2));
      this.state.transactions.unshift({
        id:crypto.randomUUID(),kind:'demo_credit',amount:value,balance_after:this.state.balance,note:'Prototype wallet credit',created_at:nowIso()
      });
      this.save();
      return {balance:this.state.balance};
    }

    async purchase(listingId){
      const listing = this.allListings().find(item=>item.id===listingId);
      if(!listing) throw new Error('Listing not found.');
      if(!activeListing(listing)) throw new Error('This listing is no longer available.');
      if(listing.seller_id===this.state.user.id) throw new Error('You cannot buy your own listing.');
      if((this.state.purchases || []).some(item=>item.listing_id===listingId)) return {already_owned:true,balance:this.state.balance};
      const price = safeNumber(listing.price);
      if(safeNumber(this.state.balance) < price) throw new Error('Your wallet balance is too low.');
      const feePercent = safeNumber(CONFIG.platformFeePercent,10);
      const fee = Number((price*(feePercent/100)).toFixed(2));
      const earning = Number((price-fee).toFixed(2));
      this.state.balance = Number((safeNumber(this.state.balance)-price).toFixed(2));
      const purchase = {
        id:crypto.randomUUID(),buyer_id:this.state.user.id,listing_id:listing.id,seller_id:listing.seller_id,
        price,currency:listing.currency || CONFIG.currency || 'GHS',platform_fee:fee,seller_earning:earning,created_at:nowIso()
      };
      this.state.purchases.unshift(purchase);
      this.state.transactions.unshift({
        id:crypto.randomUUID(),kind:'purchase',amount:-price,balance_after:this.state.balance,reference_id:purchase.id,
        note:`Purchased ${listing.title}`,created_at:nowIso()
      });
      this.save();
      return {purchase_id:purchase.id,balance:this.state.balance,already_owned:false};
    }

    async reveal(listingId){
      const listing = this.allListings().find(item=>item.id===listingId);
      if(!listing) throw new Error('Listing not found.');
      const owned = safeNumber(listing.price)===0 || listing.seller_id===this.state.user.id || (this.state.purchases || []).some(item=>item.listing_id===listingId);
      if(!owned) throw new Error('Purchase this code before revealing it.');
      if(!activeListing(listing)) throw new Error('This code is no longer active.');
      return listing.code;
    }

    async createListing(payload){
      const title = String(payload.title || '').trim();
      const code = String(payload.code || '').trim();
      if(title.length < 3) throw new Error('Enter a listing title.');
      if(code.length < 4) throw new Error('Enter a valid booking code.');
      const expiresAt = new Date(payload.expires_at).toISOString();
      if(Date.parse(expiresAt) <= Date.now()) throw new Error('Expiry must be in the future.');
      const odds = safeNumber(payload.odds);
      const selections = Math.floor(safeNumber(payload.selections));
      const listing = {
        id:crypto.randomUUID(),source:'marketplace',seller_id:this.state.user.id,
        seller:{display_name:this.state.user.display_name,username:this.state.user.username,verified:false},
        title,category:String(payload.category || 'Other'),odds,selections,price:safeNumber(payload.price),currency:CONFIG.currency || 'GHS',
        hit_probability:0,avg_odds_per_leg:selections>0?Number(Math.pow(odds,1/selections).toFixed(2)):0,edge:0,
        note:String(payload.note || '').trim(),status:'approved',matches_status:'upcoming',expires_at:expiresAt,created_at:nowIso(),code,purchase_count:0
      };
      this.state.customListings.unshift(listing);
      this.save();
      return listing.id;
    }
  }

  class SupabaseBackend {
    constructor(){
      this.mode='supabase';
      this.client=window.supabase.createClient(CONFIG.supabaseUrl,CONFIG.supabaseAnonKey,{
        auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
      });
      this.listeners=[];
    }

    async init(){
      this.client.auth.onAuthStateChange(()=>this.listeners.forEach(listener=>listener()));
      return this;
    }
    onAuthChange(listener){this.listeners.push(listener);return()=>{this.listeners=this.listeners.filter(item=>item!==listener)};}

    async currentUser(){
      const {data:{user},error}=await this.client.auth.getUser();
      if(error || !user) return null;
      const {data:profile}=await this.client.from('profiles').select('id,display_name,username,verified,role').eq('id',user.id).maybeSingle();
      return profile ? {...profile,email:user.email} : {id:user.id,email:user.email,display_name:user.user_metadata?.display_name || user.email,username:null,verified:false,role:'user'};
    }

    async signIn(email,password){
      const {error}=await this.client.auth.signInWithPassword({email,password});
      if(error) throw error;
      return true;
    }

    async signUp(displayName,email,password){
      const username=String(displayName||'user').toLowerCase().replace(/[^a-z0-9_]+/g,'_').replace(/^_+|_+$/g,'').slice(0,28) || `user_${Date.now()}`;
      const {data,error}=await this.client.auth.signUp({email,password,options:{data:{display_name:displayName,username}}});
      if(error) throw error;
      return data;
    }

    async signOut(){
      const {error}=await this.client.auth.signOut();
      if(error) throw error;
    }

    async listListings(){
      const {data,error}=await this.client.from('listings')
        .select('id,source,title,category,odds,selections,hit_probability,avg_odds_per_leg,edge,note,price,currency,status,matches_status,expires_at,created_at,seller_id,purchase_count,seller:profiles!listings_seller_id_fkey(display_name,username,verified)')
        .order('created_at',{ascending:false});
      if(error) throw error;
      return (data||[]).map(item=>({...item,seller:Array.isArray(item.seller)?item.seller[0]:item.seller}));
    }

    async getWallet(){
      const user=await this.currentUser();
      if(!user) return {balance:0,currency:CONFIG.currency || 'GHS'};
      const {data,error}=await this.client.from('wallets').select('balance,currency').eq('user_id',user.id).maybeSingle();
      if(error) throw error;
      return data || {balance:0,currency:CONFIG.currency || 'GHS'};
    }

    async getPurchases(){
      const user=await this.currentUser();
      if(!user) return [];
      const {data,error}=await this.client.from('purchases')
        .select('id,buyer_id,listing_id,seller_id,price,currency,platform_fee,seller_earning,created_at,listing:listings(id,source,title,category,odds,selections,hit_probability,avg_odds_per_leg,edge,note,price,currency,status,matches_status,expires_at,created_at,seller_id,purchase_count,seller:profiles!listings_seller_id_fkey(display_name,username,verified))')
        .eq('buyer_id',user.id).order('created_at',{ascending:false});
      if(error) throw error;
      return (data||[]).map(item=>{
        if(item.listing && Array.isArray(item.listing.seller)) item.listing.seller=item.listing.seller[0];
        return item;
      });
    }

    async getTransactions(){
      const user=await this.currentUser();
      if(!user) return [];
      const {data,error}=await this.client.from('wallet_transactions').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100);
      if(error) throw error;
      return data||[];
    }

    async getSellerDashboard(){
      const user=await this.currentUser();
      if(!user) return {listings:[],sales_count:0,lifetime_earned:0,available_balance:0};
      const [listingResult,purchaseResult,walletResult]=await Promise.all([
        this.client.from('listings').select('*').eq('seller_id',user.id).order('created_at',{ascending:false}),
        this.client.from('purchases').select('id,seller_earning').eq('seller_id',user.id),
        this.client.from('seller_wallets').select('available_balance,lifetime_earned').eq('seller_id',user.id).maybeSingle()
      ]);
      if(listingResult.error) throw listingResult.error;
      if(purchaseResult.error) throw purchaseResult.error;
      if(walletResult.error) throw walletResult.error;
      return {
        listings:listingResult.data||[],sales_count:(purchaseResult.data||[]).length,
        lifetime_earned:safeNumber(walletResult.data?.lifetime_earned),available_balance:safeNumber(walletResult.data?.available_balance)
      };
    }

    requireUser(user){ if(!user) throw new Error('Sign in to continue.'); }

    async topUp(amount){
      const user=await this.currentUser();this.requireUser(user);
      const {data,error}=await this.client.rpc('demo_top_up',{p_amount:safeNumber(amount)});
      if(error) throw error;
      return data;
    }

    async purchase(listingId){
      const user=await this.currentUser();this.requireUser(user);
      const {data,error}=await this.client.rpc('purchase_listing',{p_listing_id:listingId});
      if(error) throw error;
      return data;
    }

    async reveal(listingId){
      const user=await this.currentUser();this.requireUser(user);
      const {data,error}=await this.client.rpc('reveal_listing_code',{p_listing_id:listingId});
      if(error) throw error;
      return data;
    }

    async createListing(payload){
      const user=await this.currentUser();this.requireUser(user);
      const {data,error}=await this.client.rpc('create_listing',{
        p_title:String(payload.title||'').trim(),p_category:String(payload.category||'Other'),p_odds:safeNumber(payload.odds),
        p_selections:Math.floor(safeNumber(payload.selections)),p_price:safeNumber(payload.price),p_expires_at:new Date(payload.expires_at).toISOString(),
        p_code:String(payload.code||'').trim(),p_note:String(payload.note||'').trim()
      });
      if(error) throw error;
      return data;
    }
  }

  class ConnectionErrorBackend {
    constructor(reason){this.mode='unavailable';this.reason=reason;}
    onAuthChange(){return()=>{};}
    async init(){return this;}
    async currentUser(){return null;}
    async listListings(){return [];}
    async getWallet(){return {balance:0,currency:CONFIG.currency || 'GHS'};}
    async getPurchases(){return [];}
    async getTransactions(){return [];}
    async getSellerDashboard(){return {listings:[],sales_count:0,lifetime_earned:0,available_balance:0};}
    fail(){throw new Error(this.reason || 'Supabase connection is unavailable.');}
    signIn(){return this.fail();}
    signUp(){return this.fail();}
    signOut(){return this.fail();}
    topUp(){return this.fail();}
    purchase(){return this.fail();}
    reveal(){return this.fail();}
    createListing(){return this.fail();}
  }

  class BackendProxy {
    constructor(){this.impl=null;this.mode='demo';this.listeners=[];this.fallbackReason='';}
    onAuthChange(listener){this.listeners.push(listener);return()=>{this.listeners=this.listeners.filter(item=>item!==listener)};}
    async waitForSupabase(timeoutMs=8000){
      const started=Date.now();
      while(Date.now()-started<timeoutMs){
        if(window.supabase) return true;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      return false;
    }
    async init(){
      const requestedMode=String(CONFIG.mode||'auto').toLowerCase();
      const allowDemoFallback=CONFIG.allowDemoFallback !== false;
      let canUseSupabase=false;
      if(requestedMode!=='demo' && isConfigured()) canUseSupabase=Boolean(window.supabase) || await this.waitForSupabase();
      if(requestedMode!=='demo' && !canUseSupabase){
        this.fallbackReason=isConfigured()
          ? 'Supabase is configured, but its browser SDK did not load. Open connection-check.html for details.'
          : 'Supabase credentials were not generated for this deployment. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in Render.';
      }
      if(requestedMode==='demo'){
        this.impl=new DemoBackend();
      }else if(canUseSupabase){
        this.impl=new SupabaseBackend();
      }else if(allowDemoFallback){
        console.warn(`${this.fallbackReason} Using demo mode because allowDemoFallback is enabled.`);
        this.impl=new DemoBackend();
      }else{
        console.error(this.fallbackReason);
        this.impl=new ConnectionErrorBackend(this.fallbackReason);
      }
      this.mode=this.impl.mode;
      await this.impl.init();
      this.impl.onAuthChange(()=>this.listeners.forEach(listener=>listener()));
      return this;
    }
    requireImpl(){if(!this.impl)throw new Error('Backend has not been initialized.');return this.impl;}
    currentUser(){return this.requireImpl().currentUser();}
    signIn(...args){return this.requireImpl().signIn(...args);}
    signUp(...args){return this.requireImpl().signUp(...args);}
    signOut(...args){return this.requireImpl().signOut(...args);}
    listListings(...args){return this.requireImpl().listListings(...args);}
    getWallet(...args){return this.requireImpl().getWallet(...args);}
    getPurchases(...args){return this.requireImpl().getPurchases(...args);}
    getTransactions(...args){return this.requireImpl().getTransactions(...args);}
    getSellerDashboard(...args){return this.requireImpl().getSellerDashboard(...args);}
    topUp(...args){return this.requireImpl().topUp(...args);}
    purchase(...args){return this.requireImpl().purchase(...args);}
    reveal(...args){return this.requireImpl().reveal(...args);}
    createListing(...args){return this.requireImpl().createListing(...args);}
  }

  window.SportyBackend=new BackendProxy();
  window.SportyHelpers={safeNumber,activeListing};
})();
