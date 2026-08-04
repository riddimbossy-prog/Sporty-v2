import { createHash } from 'node:crypto';

const DEFAULT_FIELDS={
  code:['code','booking_code','bookingCode','bet_code','betCode','coupon_code','couponCode','short_code','shortCode','code_id','codeId'],
  title:['title','name','label','headline','description','event_name','eventName'],
  odds:['total_odds','totalOdds','odds','combined_odds','combinedOdds','total_odd','totalOdd'],
  selections:['selections_count','selection_count','selectionCount','selectionsCount','selections','legs','leg_count','legCount','matches','outcomes'],
  tipDetails:['tips','selection_details','selections_detail','selectionDetails','selectionsDetail','legs','picks','bets','bet_selections','betSelections','slip.selections','betslip.selections'],
  author:['author','tipster','seller','username','owner','created_by','createdBy','user.name','seller.name'],
  tag:['category','market','tag','badge','type','competition'],
  status:['status','code_status','codeStatus','match_status','matchStatus'],
  result:['result','result_status','resultStatus','settlement','outcome','code_result','codeResult'],
  expiresAt:['expires_at','expiresAt','expiry','expiration','valid_until','validUntil'],
  createdAt:['scraped_at','scrapedAt','created_at','createdAt','published_at','publishedAt','date','timestamp'],
  settledAt:['settled_at','settledAt','result_at','resultAt','updated_at','updatedAt'],
  sourceUrl:['source_url','sourceUrl','url','link','href','code_hub_url','codeHubUrl']
};

const TIP_FIELDS={
  fixture:['fixture','event','match','event_name','eventName','name','teams','match_name','matchName'],
  home:['home_team','homeTeam','home','team_home','teamHome'],
  away:['away_team','awayTeam','away','team_away','teamAway'],
  market:['market','market_name','marketName','bet_type','betType','type','group','market_group','marketGroup'],
  pick:['pick','selection','outcome','tip','choice','selected','prediction','name'],
  odds:['odds','price','selection_odds','selectionOdds','odd'],
  league:['league','competition','tournament','country','sport'],
  kickoff:['kickoff','start_time','startTime','event_time','eventTime','date','timestamp'],
  status:['status','result','settlement','outcome_status','outcomeStatus']
};

function getPath(value,path){return String(path||'').split('.').filter(Boolean).reduce((current,key)=>current==null?undefined:current[key],value)}
function firstValue(row,paths){for(const path of paths||[]){const value=getPath(row,path);if(value!==undefined&&value!==null&&value!=='')return value}return undefined}
function safeText(value,maxLength=100){if(value==null)return'';return String(value).replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,maxLength)}
function safeNumber(value){if(Array.isArray(value))return value.length;if(value&&typeof value==='object'){if(Array.isArray(value.items))return value.items.length;if(Array.isArray(value.data))return value.data.length}const number=Number(String(value??'').replace(/,/g,''));return Number.isFinite(number)?number:null}
function safeDate(value){if(value==null||value==='')return null;const numeric=Number(value);const date=Number.isFinite(numeric)&&String(value).trim()!==''?new Date(numeric<1e12?numeric*1000:numeric):new Date(value);return Number.isFinite(date.getTime())?date.toISOString():null}
function parseJsonString(value){if(typeof value!=='string')return value;const text=value.trim();if(!(text.startsWith('{')||text.startsWith('[')))return value;try{return JSON.parse(text)}catch{return value}}
function findArray(value,depth=0,seen=new Set()){if(depth>7||value==null)return null;value=parseJsonString(value);if(Array.isArray(value))return value;if(typeof value!=='object'||seen.has(value))return null;seen.add(value);for(const key of ['items','codes','results','data','records','rows','payload','response','body','output']){const candidate=parseJsonString(value[key]);if(Array.isArray(candidate))return candidate}for(const key of ['items','codes','results','data','records','rows','payload','response','body','output']){const nested=findArray(value[key],depth+1,seen);if(nested)return nested}for(const nestedValue of Object.values(value)){const nested=findArray(nestedValue,depth+1,seen);if(nested)return nested}return null}
function extractRows(payload,itemsPath){payload=parseJsonString(payload);if(itemsPath){const selected=parseJsonString(getPath(payload,itemsPath));if(Array.isArray(selected))return selected;throw new Error(`Configured items path did not resolve to an array: ${itemsPath}`)}const rows=findArray(payload);if(rows)return rows;if(payload&&typeof payload==='object')return[payload];return[]}
function normaliseFieldMap(fieldMap={}){const output={};for(const[key,defaults]of Object.entries(DEFAULT_FIELDS)){const custom=fieldMap[key];output[key]=Array.isArray(custom)?custom:custom?[custom]:defaults}return output}
function normaliseCode(value){const code=safeText(value,40).replace(/\s+/g,'');return/^[A-Za-z0-9_-]{4,40}$/.test(code)?code:''}
function normalizeResult(value){const result=safeText(value,30).toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');if(['won','winner','win','settled won'].includes(result))return'won';if(['lost','lose','loss','settled lost','failed'].includes(result))return'lost';if(['void','push','cancelled','canceled','refunded'].includes(result))return'void';return'pending'}
function isBlockedStatus(value){return['expired','live','started','cancelled','canceled','invalid','closed','suspended','deleted','hidden'].includes(safeText(value,30).toLowerCase())}
function plausibleDate(value,now){const iso=safeDate(value);if(!iso)return null;const date=new Date(iso);const year=date.getUTCFullYear();const currentYear=now.getUTCFullYear();return year<currentYear-1||year>currentYear+6?null:iso}
function normaliseTipArray(value){value=parseJsonString(value);if(Array.isArray(value))return value;if(value&&typeof value==='object'){for(const key of ['items','data','selections','legs','picks','bets','outcomes','matches']){const candidate=parseJsonString(value[key]);if(Array.isArray(candidate))return candidate}}return[]}
function dayStartUtc(date){return Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())}

function normalizeTip(rawValue){
  const raw=parseJsonString(rawValue);if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const fixture=safeText(firstValue(raw,TIP_FIELDS.fixture),140);
  const home=safeText(firstValue(raw,TIP_FIELDS.home),70);const away=safeText(firstValue(raw,TIP_FIELDS.away),70);
  const displayFixture=fixture||(home&&away?`${home} vs ${away}`:home||away);
  const market=safeText(firstValue(raw,TIP_FIELDS.market),90);
  const pick=safeText(firstValue(raw,TIP_FIELDS.pick),100);
  if(!displayFixture||!market||!pick)return null;
  const odds=safeNumber(firstValue(raw,TIP_FIELDS.odds));
  return{fixture:displayFixture,market,pick,odds:odds&&odds>0?Number(odds.toFixed(2)):null,league:safeText(firstValue(raw,TIP_FIELDS.league),80)||null,kickoff:safeDate(firstValue(raw,TIP_FIELDS.kickoff)),result:safeText(firstValue(raw,TIP_FIELDS.status),30).toLowerCase()||null};
}

function normalizeTips(raw,fields){
  const source=normaliseTipArray(firstValue(raw,fields.tipDetails));const output=[];const seen=new Set();
  for(const value of source){const tip=normalizeTip(value);if(!tip)continue;const key=`${tip.fixture}|${tip.market}|${tip.pick}`.toLowerCase();if(seen.has(key))continue;seen.add(key);output.push(tip);if(output.length>=80)break}
  return output;
}

function isPastMatchDay(tips,now){
  const kickoffs=tips.map(tip=>safeDate(tip.kickoff)).filter(Boolean).map(value=>new Date(value));
  if(!kickoffs.length)return false;
  const latest=Math.max(...kickoffs.map(date=>date.getTime()));
  return latest<dayStartUtc(now);
}

export function normalizeCodeHubPayload(payload,options={}){
  const rows=extractRows(payload,options.itemsPath);const fields=normaliseFieldMap(options.fieldMap);const now=options.now?new Date(options.now):new Date();
  const maxItems=Math.max(1,Math.min(Number(options.maxItems)||24,80));const maxAgeHours=Math.max(6,Math.min(Number(options.maxAgeHours)||36,168));
  const seen=new Set();const items=[];
  const diagnostics={input_rows:rows.length,kept:0,rejected:0,rejected_by_reason:{},quality_score:0};
  const reject=reason=>{diagnostics.rejected++;diagnostics.rejected_by_reason[reason]=(diagnostics.rejected_by_reason[reason]||0)+1};
  for(const rawValue of rows){
    const raw=parseJsonString(rawValue);if(!raw||typeof raw!=='object'||Array.isArray(raw)){reject('invalid_record');continue}
    const code=normaliseCode(firstValue(raw,fields.code));if(!code){reject('missing_or_invalid_code');continue}
    const codeKey=code.toUpperCase();if(seen.has(codeKey)){reject('duplicate_code');continue}
    const statusValue=firstValue(raw,fields.status);const statusText=safeText(statusValue,30).toLowerCase();
    const result=normalizeResult(firstValue(raw,fields.result));const statusResult=normalizeResult(statusText);const settledResult=result!=='pending'?result:statusResult;const settled=settledResult!=='pending';
    if(!settled&&isBlockedStatus(statusValue)){reject('unavailable_status');continue}
    const tips=normalizeTips(raw,fields);
    const oddsValue=safeNumber(firstValue(raw,fields.odds));
    if(!(oddsValue>1)){reject('missing_or_invalid_odds');continue}
    const selectionsValue=safeNumber(firstValue(raw,fields.selections))??tips.length;
    const selections=selectionsValue&&selectionsValue>0?Math.floor(selectionsValue):tips.length;
    if(!(selections>0)){reject('missing_selections');continue}
    const expiresAt=plausibleDate(firstValue(raw,fields.expiresAt),now);
    if(!settled&&expiresAt&&Date.parse(expiresAt)<=now.getTime()){reject('expired');continue}
    if(!settled&&isPastMatchDay(tips,now)){reject('expired_match_day');continue}
    const createdAt=plausibleDate(firstValue(raw,fields.createdAt),now);
    const hasFutureKickoff=tips.some(tip=>tip.kickoff&&Date.parse(tip.kickoff)>=dayStartUtc(now));
    if(!settled&&createdAt&&!expiresAt&&!hasFutureKickoff&&now.getTime()-Date.parse(createdAt)>maxAgeHours*60*60*1000){reject('stale_content');continue}
    const sourceUrl=safeText(firstValue(raw,fields.sourceUrl),300);
    seen.add(codeKey);
    items.push({
      id:createHash('sha256').update(codeKey).digest('hex').slice(0,16),code,
      title:safeText(firstValue(raw,fields.title),120)||'Free public code',
      odds:Number(oddsValue.toFixed(2)),selections,tips,
      author:safeText(firstValue(raw,fields.author),50)||null,
      tag:safeText(firstValue(raw,fields.tag),40)||'Code Hub',
      status:statusText||'upcoming',result:settled?settledResult:null,
      expires_at:expiresAt,created_at:createdAt,settled_at:safeDate(firstValue(raw,fields.settledAt)),
      source_url:/^https?:\/\//i.test(sourceUrl)?sourceUrl:null,
      settlement:settled?{verification_status:'verified',method:'source-feed',verified_at:safeDate(firstValue(raw,fields.settledAt))||now.toISOString(),evidence_url:/^https?:\/\//i.test(sourceUrl)?sourceUrl:null}:{verification_status:'pending',method:null,verified_at:null,evidence_url:null},
      quality:'complete'
    });
    diagnostics.kept++;if(items.length>=maxItems)break;
  }
  diagnostics.quality_score=rows.length?Math.round(diagnostics.kept/rows.length*100):0;
  const slipsWithTips=items.filter(item=>item.tips.length).length;const totalTips=items.reduce((sum,item)=>sum+item.tips.length,0);
  return{version:6,source:'public-code-feed',generated_at:now.toISOString(),status:items.length?'ok':'empty',count:items.length,slips_with_tips:slipsWithTips,total_tips:totalTips,diagnostics,items};
}
