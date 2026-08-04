import { env, text, number, safeDate, canonical, hashKey, publicError } from './core.mjs';

const DEFAULT_EVENTS_URL='https://www.sportybet.com/api/{country}/factsCenter/pcUpcomingEvents?sportId=sr%3Asport%3A1&marketId=1&pageNum={page}&pageSize=100';
const DEFAULT_CODEHUB_URL='https://www.sportybet.com/{country}/m/code-hub/codes';
const status={
  events:{configured:true,last_attempt_at:null,last_success_at:null,last_error:null,count:0,url_source:'default-public'},
  codes:{configured:true,last_attempt_at:null,last_success_at:null,last_error:null,count:0,url_source:'default-public'}
};

function cleanCountry(){return text(env('SPORTYBET_COUNTRY','gh')).toLowerCase().replace(/[^a-z]/g,'').slice(0,3)||'gh'}
function configuredUrl(name,fallback){const value=text(env(name));return{value:value||fallback,source:value?'render-environment':'default-public'}}
function renderTemplate(template,vars={}){return String(template||'').replace(/\{([a-z_]+)\}/gi,(_,key)=>encodeURIComponent(String(vars[key]??'')))}
function collectorEnabled(){return !/^(0|false|no|off)$/i.test(env('SPORTYBET_PUBLIC_COLLECTOR_ENABLED','true'))}
function permittedUrl(raw){
  let url;try{url=new URL(raw)}catch{throw new Error('The configured SportyBet public URL is invalid')}
  const localTest=/^(1|true|yes|on)$/i.test(env('SPORTYBET_ALLOW_INSECURE_TEST_URL','false'))&&['127.0.0.1','localhost'].includes(url.hostname);
  if(url.protocol!=='https:'&&!localTest)throw new Error('SportyBet public sources must use HTTPS');
  const host=url.hostname.toLowerCase();
  const allowCustom=/^(1|true|yes|on)$/i.test(env('SPORTYBET_ALLOW_CUSTOM_PUBLIC_HOST','false'));
  if(!allowCustom&&host!=='sportybet.com'&&!host.endsWith('.sportybet.com'))throw new Error('The public source must be hosted on sportybet.com');
  return url;
}
function publicHeaders(country){return{
  Accept:'application/json,text/html;q=0.9,*/*;q=0.7',
  'User-Agent':'Mozilla/5.0 (compatible; sporty.codes-public-feed/21.4; +https://sporty.codes)',
  Referer:`https://www.sportybet.com/${country}/`,
  'Accept-Language':'en-GB,en;q=0.8'
}}
async function fetchPublic(url,{timeoutMs=16000}={}){
  const target=permittedUrl(url);const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(target,{method:'GET',headers:publicHeaders(cleanCountry()),redirect:'follow',signal:controller.signal});
    const body=await response.text();
    if(!response.ok)throw new Error(`SportyBet public source returned HTTP ${response.status}`);
    return{body,contentType:text(response.headers.get('content-type')),url:String(response.url||target)};
  }catch(error){if(error?.name==='AbortError')throw new Error('SportyBet public source timed out');throw error}finally{clearTimeout(timer)}
}
function decodeHtml(value){return String(value||'').replace(/&quot;/g,'"').replace(/&#34;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')}
function jsonCandidates(body,contentType=''){
  const out=[];const raw=String(body||'').trim();
  if(/json/i.test(contentType)||raw.startsWith('{')||raw.startsWith('[')){try{out.push(JSON.parse(raw))}catch{}}
  const scriptRe=/<script\b[^>]*(?:type=["']application\/json["']|id=["'](?:__NEXT_DATA__|__NUXT_DATA__|__INITIAL_STATE__)["'])[^>]*>([\s\S]*?)<\/script>/gi;
  for(const match of raw.matchAll(scriptRe)){try{out.push(JSON.parse(decodeHtml(match[1]).trim()))}catch{}}
  const assignmentRe=/(?:window\.)?(?:__INITIAL_STATE__|__PRELOADED_STATE__|__APOLLO_STATE__)\s*=\s*([\[{][\s\S]*?)[;]\s*(?:<\/script>|$)/gi;
  for(const match of raw.matchAll(assignmentRe)){try{out.push(JSON.parse(decodeHtml(match[1]).trim()))}catch{}}
  return out;
}
function valuesDeep(root,maxNodes=50000){
  const arrays=[];const stack=[root];const seen=new Set();let visited=0;
  while(stack.length&&visited<maxNodes){const node=stack.pop();visited++;if(!node||typeof node!=='object'||seen.has(node))continue;seen.add(node);if(Array.isArray(node)){arrays.push(node);for(const value of node)if(value&&typeof value==='object')stack.push(value)}else for(const value of Object.values(node))if(value&&typeof value==='object')stack.push(value)}
  return arrays;
}
function firstValue(object,keys){for(const key of keys){const value=object?.[key];if(value!==undefined&&value!==null&&text(value)!=='')return value}return null}
function epochMs(value){if(value===null||value===undefined||value==='')return 0;if(typeof value==='number'||/^\d+$/.test(text(value))){const n=Number(value);if(!Number.isFinite(n))return 0;return n<1e12?n*1000:n}return safeDate(value)?.getTime()||0}
function teamName(value){if(!value)return'';if(typeof value==='string')return text(value);return text(firstValue(value,['name','team_name','teamName','display_name','displayName']))}
function extractTeams(row){
  let home=teamName(firstValue(row,['home_team','homeTeam','home','team_home','teamHome']));
  let away=teamName(firstValue(row,['away_team','awayTeam','away','team_away','teamAway']));
  const competitors=Array.isArray(row?.competitors)?row.competitors:Array.isArray(row?.teams)?row.teams:null;
  if((!home||!away)&&competitors){for(const team of competitors){const qualifier=canonical(firstValue(team,['qualifier','side','type','position']));if(!home&&/home|1/.test(qualifier))home=teamName(team);if(!away&&/away|2/.test(qualifier))away=teamName(team)}if(!home)home=teamName(competitors[0]);if(!away)away=teamName(competitors[1])}
  return{home,away};
}
function outcomePrice(outcome){return number(firstValue(outcome,['odds','price','decimal_odds','decimalOdds','value']))||null}
function extract1x2(row){
  const prices={home:null,draw:null,away:null};
  const markets=[];
  for(const key of ['markets','market','betOffers','bet_offers']){const value=row?.[key];if(Array.isArray(value))markets.push(...value)}
  for(const market of markets){const id=text(firstValue(market,['market_id','marketId','id','specifier']));const name=canonical(firstValue(market,['name','description','market_name','marketName']));if(id!=='1'&&!/1x2|match result|full time result|winner/.test(name))continue;const outcomes=Array.isArray(market.outcomes)?market.outcomes:Array.isArray(market.selections)?market.selections:Array.isArray(market.options)?market.options:[];for(const outcome of outcomes){const label=canonical(firstValue(outcome,['description','name','label','outcome_name','outcomeName']));const oid=text(firstValue(outcome,['id','outcome_id','outcomeId']));const price=outcomePrice(outcome);if(!price)continue;if(['home','1','home win'].includes(label)||oid==='1')prices.home=price;else if(['draw','x'].includes(label)||oid==='2')prices.draw=price;else if(['away','2','away win'].includes(label)||oid==='3')prices.away=price}}
  prices.home=prices.home||number(firstValue(row,['oddsHome','home_odds','homeOdds']))||null;prices.draw=prices.draw||number(firstValue(row,['oddsDraw','draw_odds','drawOdds']))||null;prices.away=prices.away||number(firstValue(row,['oddsAway','away_odds','awayOdds']))||null;
  return prices;
}
function eventCandidate(row,context={}){
  if(!row||typeof row!=='object'||Array.isArray(row))return null;const teams=extractTeams(row);if(!teams.home||!teams.away)return null;
  const start=epochMs(firstValue(row,['start_time','startTime','kickoff','kick_off','scheduled','scheduled_at','event_time','eventTime','date']));
  const odds=extract1x2(row);const rawId=firstValue(row,['event_id','eventId','game_id','gameId','id','fixture_id','fixtureId']);
  const league=text(firstValue(row,['league','tournament_name','tournamentName','competition','category_name','categoryName']))||text(context.league)||'Football';
  const country=text(firstValue(row,['country','country_name','countryName','category']))||text(context.country)||null;
  const id=text(rawId)||hashKey(`${teams.home}|${teams.away}|${start}`);
  return{event_id:`sportybet:${id}`,game_id:text(firstValue(row,['game_id','gameId']))||id,provider_fixture_id:id,league,country,league_id:firstValue(row,['tournament_id','tournamentId','league_id','leagueId'])||null,home_team:teams.home,away_team:teams.away,home_team_id:firstValue(row,['home_team_id','homeTeamId'])||null,away_team_id:firstValue(row,['away_team_id','awayTeamId'])||null,start_time:start,kickoff:start?new Date(start).toISOString():null,match_status:text(firstValue(row,['match_status','matchStatus','status','state']))||'Not start',oddsHome:odds.home,oddsDraw:odds.draw,oddsAway:odds.away,market_id:'1',odds_source:'sportybet-public',source:'sportybet-public',search_query:`${teams.home} vs ${teams.away}`};
}
function collectEventsFromObject(root){
  const output=[];const seen=new Set();
  const tournaments=[];
  const roots=[root,root?.data,root?.payload,root?.result].filter(Boolean);
  for(const candidate of roots){const rows=candidate?.tournaments||candidate?.categories||candidate?.competitions;if(Array.isArray(rows))tournaments.push(...rows)}
  for(const tournament of tournaments){const context={league:firstValue(tournament,['tournament_name','tournamentName','name','category']),country:firstValue(tournament,['country','country_name','countryName'])};for(const raw of tournament.events||tournament.matches||tournament.fixtures||[]){const row=eventCandidate(raw,context);if(row&&!seen.has(row.event_id)){seen.add(row.event_id);output.push(row)}}}
  for(const array of valuesDeep(root)){for(const raw of array){const row=eventCandidate(raw);if(row&&!seen.has(row.event_id)){seen.add(row.event_id);output.push(row)}}}
  return output;
}
function tipCandidate(raw){if(!raw||typeof raw!=='object')return null;const fixture=text(firstValue(raw,['fixture','event','match','event_name','eventName','name']))||(()=>{const t=extractTeams(raw);return t.home&&t.away?`${t.home} vs ${t.away}`:''})();const market=text(firstValue(raw,['market','market_name','marketName','bet_type','betType','group','description']));const pick=text(firstValue(raw,['pick','selection','outcome','tip','choice','selection_name','selectionName']));if(!fixture||!market||!pick)return null;const kickoff=epochMs(firstValue(raw,['kickoff','start_time','startTime','event_time','eventTime','date']));return{fixture,market,pick,odds:number(firstValue(raw,['odds','price','selection_odds','selectionOdds']))||null,league:text(firstValue(raw,['league','competition','tournament','category']))||null,kickoff:kickoff?new Date(kickoff).toISOString():null,result:text(firstValue(raw,['result','status','settlement']))||'unavailable'};}
function codeCandidate(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;const code=text(firstValue(raw,['code','booking_code','bookingCode','bet_code','betCode','coupon_code','couponCode','share_code','shareCode'])).toUpperCase();if(!/^[A-Z0-9]{4,20}$/.test(code))return null;
  let rawTips=[];for(const key of ['selections_detail','selection_details','tips','legs','selections','outcomes'])if(Array.isArray(raw?.[key])){rawTips=raw[key];break}
  const tips=rawTips.map(tipCandidate).filter(Boolean);const created=safeDate(firstValue(raw,['created_at','createdAt','scraped_at','scrapedAt','published_at','publishedAt']))?.toISOString()||new Date().toISOString();
  return{id:text(raw.id)||hashKey(code),code,title:text(firstValue(raw,['title','headline','name','description']))||'Public SportyBet code',odds:number(firstValue(raw,['total_odds','totalOdds','odds']))||null,selections:number(firstValue(raw,['selections_count','selectionCount','selectionsCount']))||tips.length,author:text(firstValue(raw,['author','tipster','creator','source_name','sourceName']))||'SportyBet Code Hub',tag:text(firstValue(raw,['category','tag','market']))||'Code Hub',status:'upcoming',result:firstValue(raw,['result','settlement'])||null,created_at:created,expires_at:safeDate(firstValue(raw,['expires_at','expiresAt','valid_until','validUntil']))?.toISOString()||null,source_url:/^https:\/\//i.test(text(firstValue(raw,['source_url','sourceUrl','url','public_url','publicUrl'])))?text(firstValue(raw,['source_url','sourceUrl','url','public_url','publicUrl'])):`https://www.sportybet.com/${cleanCountry()}/m/code-hub/codes`,tips};
}
function collectCodesFromObject(root){const output=[];const seen=new Set();for(const array of valuesDeep(root)){for(const raw of array){const row=codeCandidate(raw);if(row&&!seen.has(row.code)){seen.add(row.code);output.push(row)}}}const rootCode=codeCandidate(root);if(rootCode&&!seen.has(rootCode.code))output.push(rootCode);return output;}
async function expandCode(item,template){if(!template||item.tips.length)return item;const url=renderTemplate(template,{country:cleanCountry(),code:item.code});const response=await fetchPublic(url,{timeoutMs:number(env('UPSTREAM_TIMEOUT_MS','16000'))||16000});const candidates=jsonCandidates(response.body,response.contentType);for(const candidate of candidates){const direct=codeCandidate(candidate);if(direct?.tips?.length)return{...item,...direct,code:item.code,title:item.title||direct.title};const codes=collectCodesFromObject(candidate);const matching=codes.find(row=>row.code===item.code&&row.tips.length);if(matching)return{...item,...matching}}return item;}

export function getSportyBetPublicStatus(){return JSON.parse(JSON.stringify(status))}
export function sportyBetPublicConfigured(){return collectorEnabled()&&Boolean(configuredUrl('SPORTYBET_PUBLIC_EVENTS_URL',DEFAULT_EVENTS_URL).value||configuredUrl('SPORTYBET_PUBLIC_CODEHUB_URL',DEFAULT_CODEHUB_URL).value)}
export async function collectSportyBetEvents({days=3,maxPages}={}){
  if(!collectorEnabled())return[];
  const country=cleanCountry();const configured=configuredUrl('SPORTYBET_PUBLIC_EVENTS_URL',DEFAULT_EVENTS_URL);status.events.configured=Boolean(configured.value);status.events.url_source=configured.source;status.events.last_attempt_at=new Date().toISOString();
  const pages=Math.max(1,Math.min(10,number(maxPages||env('SPORTYBET_MAX_PAGES','3'))||3));const output=[];const seen=new Set();
  try{
    for(let page=1;page<=pages;page++){
      const url=renderTemplate(configured.value,{country,page,days});const response=await fetchPublic(url,{timeoutMs:number(env('UPSTREAM_TIMEOUT_MS','16000'))||16000});const candidates=jsonCandidates(response.body,response.contentType);let batch=[];for(const candidate of candidates)batch.push(...collectEventsFromObject(candidate));for(const row of batch)if(!seen.has(row.event_id)){seen.add(row.event_id);output.push(row)}if(!batch.length||batch.length<50)break;
    }
    const now=Date.now()-6*3600000;const end=Date.now()+Math.max(1,number(days)||3)*86400000+86400000;const filtered=output.filter(row=>!row.start_time||(row.start_time>=now&&row.start_time<=end)).sort((a,b)=>(a.start_time||0)-(b.start_time||0));status.events.last_success_at=new Date().toISOString();status.events.last_error=null;status.events.count=filtered.length;return filtered;
  }catch(error){status.events.last_error=publicError(error);status.events.count=0;throw error}
}
export async function collectSportyBetCodes({limit=24}={}){
  if(!collectorEnabled())return[];
  const country=cleanCountry();const configured=configuredUrl('SPORTYBET_PUBLIC_CODEHUB_URL',DEFAULT_CODEHUB_URL);status.codes.configured=Boolean(configured.value);status.codes.url_source=configured.source;status.codes.last_attempt_at=new Date().toISOString();
  try{
    const url=renderTemplate(configured.value,{country,page:1,limit});const response=await fetchPublic(url,{timeoutMs:number(env('UPSTREAM_TIMEOUT_MS','16000'))||16000});const candidates=jsonCandidates(response.body,response.contentType);let items=[];for(const candidate of candidates)items.push(...collectCodesFromObject(candidate));const map=new Map();for(const item of items)if(!map.has(item.code))map.set(item.code,item);items=[...map.values()].slice(0,Math.max(1,Math.min(100,number(limit)||24)));
    const template=text(env('SPORTYBET_PUBLIC_BOOKING_URL_TEMPLATE'));const expansionLimit=Math.max(0,Math.min(20,number(env('SPORTYBET_CODE_EXPANSION_LIMIT','6'))||6));if(template&&items.length){for(let i=0;i<Math.min(items.length,expansionLimit);i++){try{items[i]=await expandCode(items[i],template)}catch{}}}
    status.codes.last_success_at=new Date().toISOString();status.codes.last_error=null;status.codes.count=items.length;return items;
  }catch(error){status.codes.last_error=publicError(error);status.codes.count=0;throw error}
}

export const __test={jsonCandidates,collectEventsFromObject,collectCodesFromObject,eventCandidate,codeCandidate,renderTemplate};
