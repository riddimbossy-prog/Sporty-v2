const VERSION='sporty-codes-v21.5.3.1';
const ASSET_VERSION='21.5.3.1';
const STATIC_CACHE=`${VERSION}-static`;
const PAGE_CACHE=`${VERSION}-pages`;
const DATA_CACHE=`${VERSION}-data`;
const IMAGE_CACHE=`${VERSION}-images`;
const CORE=[
  '/login.html','/international.html','/offline.html','/manifest.json','/data/codehub-banner.json','/sportybet-events.json',
  `/styles.css?v=${ASSET_VERSION}`,`/responsive.css?v=${ASSET_VERSION}`,`/pwa.css?v=${ASSET_VERSION}`,
  `/config.js?v=${ASSET_VERSION}`,`/src/market-board.js?v=${ASSET_VERSION}`,`/src/region.js?v=${ASSET_VERSION}`,`/src/international.js?v=${ASSET_VERSION}`,`/src/auth.js?v=${ASSET_VERSION}`,`/src/login.js?v=${ASSET_VERSION}`,`/src/admin-login.js?v=${ASSET_VERSION}`,`/src/member-home.js?v=${ASSET_VERSION}`,`/src/share.js?v=${ASSET_VERSION}`,`/src/experience.js?v=${ASSET_VERSION}`,
  '/icons/icon-192.png','/assets/logo-wordmark-dark.webp','/assets/logo-wordmark-light.webp','/favicon.svg'
];
const ROUTES={
  '':'/index.html','/international':'/international.html','/marketplace':'/marketplace.html','/free-codes':'/marketplace.html','/smart-board':'/smart-board.html',
  '/most-added':'/most-added.html','/elite-picks':'/elite-picks.html','/won-codes':'/won-codes.html','/performance':'/performance.html','/sources':'/sources.html',
  '/control-room':'/control-room.html','/login':'/login.html','/admin-login':'/admin-login.html','/admin-users':'/admin-users.html',
  '/privacy':'/privacy.html','/account':'/account.html','/saved':'/saved.html'
};

self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(STATIC_CACHE);
  await Promise.allSettled(CORE.map(path=>cache.add(new Request(path,{cache:'reload'}))));
  await self.skipWaiting();
})()));

self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  const keep=new Set([STATIC_CACHE,PAGE_CACHE,DATA_CACHE,IMAGE_CACHE]);
  await Promise.all(keys.filter(key=>key.startsWith('sporty-codes-')&&!keep.has(key)).map(key=>caches.delete(key)));
  if(self.registration.navigationPreload)await self.registration.navigationPreload.enable().catch(()=>{});
  await self.clients.claim();
})()));

self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});

async function fetchWithTimeout(request,options={},timeout=3200){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{return await fetch(request,{...options,signal:controller.signal})}finally{clearTimeout(timer)}
}

async function trimCache(name,maxEntries){
  const cache=await caches.open(name);
  const keys=await cache.keys();
  if(keys.length<=maxEntries)return;
  await Promise.all(keys.slice(0,keys.length-maxEntries).map(key=>cache.delete(key)));
}

function stableDataRequest(request){
  const url=new URL(request.url);
  url.searchParams.delete('v');
  url.searchParams.delete('ts');
  url.searchParams.delete('reset');
  return new Request(url.toString(),{method:'GET',headers:request.headers,credentials:request.credentials,mode:request.mode,redirect:request.redirect});
}

async function networkFirst(request,cacheName,{timeout=3200,fallback=null,normalize=false,maxEntries=30}={}){
  const cache=await caches.open(cacheName);
  const key=normalize?stableDataRequest(request):request;
  try{
    const response=await fetchWithTimeout(request,{cache:'no-cache'},timeout);
    if(response?.ok){cache.put(key,response.clone()).catch(()=>{});trimCache(cacheName,maxEntries).catch(()=>{});}
    return response;
  }catch{
    const cached=await cache.match(key,{ignoreSearch:normalize});
    if(cached)return cached;
    if(fallback)return (await caches.match(fallback))||Response.error();
    throw new Error('offline');
  }
}

async function staleWhileRevalidate(request,cacheName,{normalize=false,maxEntries=80}={}){
  const cache=await caches.open(cacheName);
  const key=normalize?stableDataRequest(request):request;
  const cached=await cache.match(key,{ignoreSearch:normalize});
  const fresh=fetch(request,{cache:'no-cache'}).then(response=>{
    if(response.ok){cache.put(key,response.clone()).catch(()=>{});trimCache(cacheName,maxEntries).catch(()=>{});}
    return response;
  }).catch(()=>null);
  return cached||fresh||Response.error();
}

async function cacheFirst(request,cacheName,maxEntries=70){
  const cache=await caches.open(cacheName);
  const cached=await cache.match(request,{ignoreSearch:true});
  if(cached)return cached;
  const response=await fetch(request,{cache:'force-cache'});
  if(response.ok){cache.put(request,response.clone()).catch(()=>{});trimCache(cacheName,maxEntries).catch(()=>{});}
  return response;
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      const preload=await event.preloadResponse.catch(()=>null);
      if(preload?.ok){const cache=await caches.open(PAGE_CACHE);cache.put(request,preload.clone()).catch(()=>{});return preload;}
      try{return await networkFirst(request,PAGE_CACHE,{timeout:2800,fallback:'/offline.html',maxEntries:24})}
      catch{
        const path=url.pathname.replace(/\/+$/,'');
        return (await caches.match(ROUTES[path]||'/offline.html'))||(await caches.match('/offline.html'));
      }
    })());
    return;
  }

  if(url.pathname==='/service-worker.js'||url.pathname==='/config.js'||url.pathname==='/render-build.txt'){
    event.respondWith(networkFirst(request,DATA_CACHE,{timeout:3000,normalize:true,maxEntries:12}));
    return;
  }

  if(url.pathname.startsWith('/api/')){
    const fallback=url.pathname==='/api/get_code_hub_codes'?'/data/codehub-banner.json':url.pathname==='/api/get_upcoming_events'?'/sportybet-events.json':null;
    const timeout=url.pathname==='/api/get_upcoming_events'||url.pathname==='/api/get_code_hub_codes'?18000:6000;
    event.respondWith(networkFirst(request,DATA_CACHE,{timeout,normalize:true,fallback,maxEntries:36}));
    return;
  }

  if(url.pathname.startsWith('/data/')){
    event.respondWith(networkFirst(request,DATA_CACHE,{timeout:3000,normalize:true,maxEntries:28}));
    return;
  }

  if(/\.(?:png|jpe?g|webp|svg|ico)$/i.test(url.pathname)){
    event.respondWith(cacheFirst(request,IMAGE_CACHE,70));
    return;
  }

  if(/\.(?:css|js|woff2?)$/i.test(url.pathname)){
    event.respondWith(staleWhileRevalidate(request,STATIC_CACHE,{maxEntries:90}));
  }
});
