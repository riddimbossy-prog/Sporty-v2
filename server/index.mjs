import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, text, number, json, publicError } from './lib/core.mjs';
import { getSystemStatus, getSourceStatus, getCodeHubCodes, getBooking, getUpcomingEvents, searchMatches, getFixtureStats, refreshAll, publishCode, runBrowserCollector, getBrowserCollectorStatus } from './lib/data-service.mjs';
import { getStats2PitchElite } from './lib/elite-feed.mjs';

const root=resolve(fileURLToPath(new URL('../.render-site/',import.meta.url)));
const port=number(env('PORT','10000'))||10000;
const adminToken=env('CUSTOM_API_ADMIN_TOKEN');
const rate=new Map();
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'};
const routeFiles={'/':'index.html','/international':'international.html','/marketplace':'marketplace.html','/free-codes':'marketplace.html','/smart-board':'smart-board.html','/elite-picks':'elite-picks.html','/most-added':'most-added.html','/won-codes':'won-codes.html','/performance':'performance.html','/sources':'sources.html','/control-room':'control-room.html','/login':'login.html','/admin-login':'admin-login.html','/admin-users':'admin-users.html','/privacy':'privacy.html','/account':'account.html','/saved':'saved.html','/deployment-check':'deployment-check.html'};
const legacyApiPaths=new Set(['/get_code_hub_codes','/get_booking','/get_upcoming_events','/search_matches','/get_fixture_stats']);
const elitePagePaths=new Set(['/elite-picks','/elite-picks/','/elite-picks.html']);

function clientIp(req){return text(req.headers['x-forwarded-for']).split(',')[0]||req.socket.remoteAddress||'unknown'}
function isApiRequest(url){return url.pathname.startsWith('/api/')||legacyApiPaths.has(url.pathname)}
function allowApi(req){
  const key=clientIp(req),now=Date.now(),windowMs=60000,limit=Math.max(20,number(env('API_RATE_LIMIT_PER_MINUTE','120'))||120);
  let row=rate.get(key);
  if(!row||row.reset<=now)row={count:0,reset:now+windowMs};
  row.count++;
  rate.set(key,row);
  if(rate.size>2000){for(const [entryKey,entry] of rate){if(entry.reset<=now)rate.delete(entryKey)}}
  return row.count<=limit;
}
function tooManyRequests(){return json({error:'Too many requests'},429,{'retry-after':'60','cache-control':'no-store, max-age=0'})}
function send(res,result){res.writeHead(result.status,result.headers);res.end(result.body)}
function auth(req){if(!adminToken)return false;const bearer=text(req.headers.authorization).replace(/^Bearer\s+/i,'');return bearer===adminToken||text(req.headers['x-admin-token'])===adminToken}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1024*1024)throw new Error('Request body too large')}if(!raw)return{};try{return JSON.parse(raw)}catch{throw new Error('Invalid JSON body')}}
function securityHeaders(extra={}){return{'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'strict-origin-when-cross-origin','permissions-policy':'geolocation=(), microphone=(), camera=()','cross-origin-resource-policy':'same-origin',...extra}}
function safeScriptJson(value){return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,char=>({'<':'\\u003c','>':'\\u003e','&':'\\u0026','\u2028':'\\u2028','\u2029':'\\u2029'}[char]||char))}

async function api(req,url){
  const path=url.pathname.replace(/^\/api/,'');
  if(req.method==='GET'&&path==='/health'){const status=await getSystemStatus();return json({ok:true,service:'sporty.codes-custom-api',version:'21.7.4',api_contract:'sporty-codes-compatibility-v3',official_sportybet_api:false,browser_agent_collector:true,rate_limit_scope:'api-only',stats2pitch_elite_feed:true,time:new Date().toISOString(),...status});}
  if(req.method==='GET'&&path==='/source-status')return json(await getSourceStatus());
  if(req.method==='GET'&&path==='/collector-status')return json({ok:true,collector:'sportybet-browser-agent',status:await getBrowserCollectorStatus()});
  if(req.method==='GET'&&path==='/elite-picks')return json(await getStats2PitchElite({date:url.searchParams.get('date'),limit:url.searchParams.get('limit')||10}));
  if(req.method==='GET'&&path==='/get_code_hub_codes')return json(await getCodeHubCodes({limit:url.searchParams.get('limit')||24}));
  if(req.method==='GET'&&path==='/get_booking'){const item=await getBooking(url.searchParams.get('code'));return item?json(item):json({error:'Code not found'},404)}
  if(req.method==='GET'&&path==='/get_upcoming_events')return json(await getUpcomingEvents({days:url.searchParams.get('days')||3}));
  if(req.method==='GET'&&path==='/search_matches')return json(await searchMatches(url.searchParams.get('date')));
  if(req.method==='GET'&&path==='/get_fixture_stats')return json(await getFixtureStats(url.searchParams.get('event_id')));
  if(req.method==='POST'&&path==='/admin/refresh'){if(!auth(req))return json({error:'Admin authorization required'},401);return json(await refreshAll())}
  if(req.method==='POST'&&path==='/admin/refresh-codes'){if(!auth(req))return json({error:'Admin authorization required'},401);return json(await getCodeHubCodes({limit:100,force:true}))}
  if(req.method==='POST'&&path==='/admin/collector/run'){if(!auth(req))return json({error:'Admin authorization required'},401);if(text(env('SPORTYBET_BROWSER_EXECUTION_MODE','github-actions'))!=='web')return json({error:'The browser collector runs in GitHub Actions to protect the Render web service from Chromium memory crashes.',execution_mode:'github-actions',workflow:'.github/workflows/sync-sportybet-codehub.yml'},409);const payload=await body(req);return json(await runBrowserCollector({limit:payload.limit||20}))}
  if(req.method==='GET'&&path==='/admin/collector/status'){if(!auth(req))return json({error:'Admin authorization required'},401);return json({ok:true,status:await getBrowserCollectorStatus()})}
  if(req.method==='POST'&&path==='/admin/codes'){if(!auth(req))return json({error:'Admin authorization required'},401);return json(await publishCode(await body(req)),201)}
  return json({error:'API route not found'},404);
}

function runtimeConfig(){
  const supabaseUrl=text(env('SUPABASE_URL'));
  const supabaseKey=text(env('SUPABASE_PUBLISHABLE_KEY'));
  const setupPending=!(supabaseUrl&&supabaseKey);
  const payload={mode:'auto',allowDemoFallback:false,setupPending,configSource:'render-runtime',buildVersion:'21.7.4',supabaseUrl,supabaseAnonKey:supabaseKey,currency:'GHS',platformFeePercent:10,codeHubBannerEnabled:true,apiBaseUrl:'/api',codeHubFeedUrl:'/api/get_code_hub_codes',upcomingEventsUrl:'/api/get_upcoming_events',codeHubLoadUrl:'https://www.sportybet.com/gh/m/code-hub/load-code',sportyOfficialUrl:'https://www.sportybet.com/',regionalSites:{GH:'https://www.sportybet.com/gh/'},carouselIntervalMs:4300};
  return `window.SPORTY_CONFIG = ${JSON.stringify(payload)};\n`;
}

function cacheControl(path){
  const name=path.split(/[\\/]/).pop();
  if(['service-worker.js','config.js','render-build.txt'].includes(name))return'no-cache, no-store, must-revalidate';
  if(/\.(?:webp|png|ico|svg)$/i.test(path))return'public, max-age=604800, stale-while-revalidate=86400';
  if(/\.(?:js|css|woff2?)$/i.test(path))return'public, max-age=31536000, immutable';
  if(path.includes(`${join(root,'data')}`))return'public, max-age=0, s-maxage=60, stale-while-revalidate=300';
  return'public, max-age=0, must-revalidate';
}
async function staticFile(urlPath){
  let relative=routeFiles[urlPath]||urlPath.replace(/^\//,'');if(!relative)relative='index.html';relative=normalize(relative).replace(/^(\.\.(\/|\\|$))+/,'');let path=join(root,relative);
  try{const info=await stat(path);if(info.isDirectory())path=join(path,'index.html');const data=await readFile(path);return{status:200,headers:securityHeaders({'content-type':mime[extname(path)]||'application/octet-stream','cache-control':cacheControl(path)}),body:data}}catch{const data=await readFile(join(root,'404.html')).catch(()=>Buffer.from('Not found'));return{status:404,headers:securityHeaders({'content-type':'text/html; charset=utf-8'}),body:data}}
}
async function elitePage(){
  const base=await staticFile('/elite-picks');
  if(base.status!==200)return base;
  let payload={source:'stats2pitch',count:0,max:10,items:[]};
  try{payload=await getStats2PitchElite({limit:10})}catch(error){console.error('[elite-page]',publicError(error))}
  const bootstrap=`<script>window.__SPORTY_ELITE_BOOTSTRAP__=${safeScriptJson(payload)};</script>`;
  const html=base.body.toString('utf8').replace('<!--STATS2PITCH_ELITE_BOOTSTRAP-->',bootstrap);
  return{...base,headers:{...base.headers,'cache-control':'no-cache, no-store, must-revalidate'},body:Buffer.from(html)};
}

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
  try{
    const isApi=isApiRequest(url);
    if(isApi){
      if(url.pathname!=='/api/health'&&!allowApi(req)){send(res,tooManyRequests());return}
      const result=await api(req,url);result.headers={...securityHeaders(),...result.headers};send(res,result);return
    }
    if(req.method==='GET'&&elitePagePaths.has(url.pathname)){send(res,await elitePage());return}
    if(url.pathname==='/config.js'){send(res,{status:200,headers:securityHeaders({'content-type':'text/javascript; charset=utf-8','cache-control':'no-cache, no-store, must-revalidate'}),body:runtimeConfig()});return}
    send(res,await staticFile(url.pathname));
  }catch(error){console.error('[server]',publicError(error));send(res,json({error:publicError(error)},500,securityHeaders()))}
});
server.listen(port,'0.0.0.0',()=>{
  const mode=text(env('SPORTYBET_BROWSER_EXECUTION_MODE','github-actions'))||'github-actions';
  console.log(`sporty.codes v21.7.4 listening on ${port}`);
  console.log(`[collector] execution mode: ${mode}; Render serves persisted Supabase results only`);
});
