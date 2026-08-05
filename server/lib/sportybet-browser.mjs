import { env, text, number, safeDate, canonical, hashKey, publicError } from './core.mjs';
import { withChromium } from './chromium-cdp.mjs';

const CODE_RE = /^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{5,8}$/;
const COMMON_WORDS = new Set([
  'SPORTY','SPORTYBET','FOOTBALL','BOOKING','PUBLIC','POPULAR','LATEST','MARKET','SELECTION','LOADCODE',
  'CONTINUE','SUBMIT','SEARCH','UPCOMING','FEATURED','BETSLIP','BETCODE','CODEHUB','GHANA','LOGIN','SIGNUP',
  'OBJECT','OBJECTOBJECT','UNDEFINED','NULL','TRUE','FALSE','SUCCESS','ERROR','RESPONSE','REQUEST',
]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const state = {
  configured: true,
  running: false,
  last_started_at: null,
  last_finished_at: null,
  last_success_at: null,
  last_error: null,
  last_duration_ms: null,
  codes_discovered: 0,
  codes_expanded: 0,
  tips_found: 0,
  network_responses: 0,
  page_url: null,
  load_url: null,
  chromium: null,
  last_result_preview: [],
  submissions_attempted: 0,
  verified_slips: 0,
  rejected_unverified: 0,
  dom_candidates: 0,
  network_candidates: 0,
  last_expansion_network: [],
};
let activeRun = null;

function enabled() {
  return !/^(0|false|no|off)$/i.test(env('SPORTYBET_BROWSER_COLLECTOR_ENABLED', 'false'));
}

function country() {
  return text(env('SPORTYBET_COUNTRY', 'gh')).toLowerCase().replace(/[^a-z]/g, '').slice(0, 3) || 'gh';
}

function codeHubUrl() {
  return text(env('SPORTYBET_BROWSER_CODEHUB_URL')) || `https://www.sportybet.com/${country()}/m/code-hub/codes`;
}

function loadCodeUrl() {
  return text(env('SPORTYBET_BROWSER_LOAD_CODE_URL')) || `https://www.sportybet.com/${country()}/m/code-hub/load-code`;
}

function allowedUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('Browser collector URL is invalid'); }
  const test = /^(1|true|yes|on)$/i.test(env('SPORTYBET_ALLOW_INSECURE_TEST_URL', 'false'))
    && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'https:' && !test) throw new Error('Browser collector sources must use HTTPS');
  const custom = /^(1|true|yes|on)$/i.test(env('SPORTYBET_ALLOW_CUSTOM_PUBLIC_HOST', 'false'));
  if (!test && !custom && url.hostname !== 'sportybet.com' && !url.hostname.endsWith('.sportybet.com')) {
    throw new Error('Browser collector source must be hosted on sportybet.com');
  }
  return String(url);
}

function primitive(value) {
  return (typeof value === 'string' || typeof value === 'number') ? value : null;
}

function normalizeCode(value) {
  const raw = primitive(value);
  if (raw === null) return '';
  const code = String(raw).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!CODE_RE.test(code) || COMMON_WORDS.has(code)) return '';
  return code;
}

function numeric(value) {
  const raw = primitive(value);
  if (raw === null || raw === '') return null;
  const match = String(raw).replace(/,/g, '').trim().match(/^-?\d+(?:\.\d+)?$/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function plausibleSelectionOdds(value) {
  const parsed = numeric(value);
  return parsed !== null && parsed >= 1.001 && parsed <= 1000 ? parsed : null;
}

function plausibleTotalOdds(value, selections = null) {
  const parsed = numeric(value);
  if (parsed === null || parsed < 1.001 || parsed > 1_000_000) return null;
  const count = numeric(selections);
  // These bounds reject concatenated timestamps/IDs while still allowing
  // genuinely high multi-leg coupons.
  if (count !== null && count <= 2 && parsed > 10_000) return null;
  if (count !== null && count <= 4 && parsed > 100_000) return null;
  return parsed;
}

function getPath(object, path) {
  let current = object;
  for (const part of String(path).split('.')) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

function first(object, keys) {
  for (const key of keys) {
    const value = key.includes('.') ? getPath(object, key) : object?.[key];
    if (value !== undefined && value !== null && text(value) !== '') return value;
  }
  return null;
}

function objectCode(object, embeddedTips = []) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return '';
  const strong = first(object, [
    'booking_code','bookingCode','bet_code','betCode','coupon_code','couponCode','short_code','shortCode',
    'booking.code','shareCode','share_code',
  ]);
  const strongCode = normalizeCode(strong);
  if (strongCode) return strongCode;

  // Generic `code` values are common in API status/error payloads. They are
  // accepted only when this exact object contains at least one verifiable slip
  // selection, not merely a nearby number named selectionCount or totalOdds.
  const generic = normalizeCode(first(object, ['code','codeId','code_id']));
  if (!generic) return '';
  const hasEmbeddedSelections = Array.isArray(embeddedTips) && embeddedTips.length > 0;
  const hasExplicitSlipObject = ['booking','coupon','betslip','betSlip']
    .some(key => object?.[key] && typeof object[key] === 'object');
  return hasEmbeddedSelections || hasExplicitSlipObject ? generic : '';
}

function totalOdds(object) {
  const selections = selectionCount(object);
  return plausibleTotalOdds(first(object, [
    'total_odds','totalOdds','total_odd','totalOdd','combinedOdds','totalPrice','betTotalOdds',
    'summary.totalOdds','booking.totalOdds','betslip.totalOdds',
  ]), selections);
}

function selectionCount(object) {
  const direct = numeric(first(object, [
    'selections_count','selectionCount','selectionsCount','numberOfSelections','betCount','betsCount','legs','legCount',
    'summary.selectionCount','booking.selectionCount',
  ]));
  if (direct !== null && direct >= 0 && direct <= 100) return Math.floor(direct);
  for (const key of ['tips','selections','selectionList','bets','betSelections','legs','items']) {
    if (Array.isArray(object?.[key])) return object[key].length;
  }
  return null;
}

function candidateFromObject(object, sourceUrl) {
  const embeddedTips = scanTips(object, 24000);
  const code = objectCode(object, embeddedTips);
  if (!code) return null;
  return {
    id: hashKey(`sporty-browser:${code}`),
    code,
    title: text(first(object, ['title','name','description','label'])) || 'Free public code',
    odds: totalOdds(object),
    selections: embeddedTips.length || selectionCount(object),
    author: text(first(object, ['author','tipster','creator','username'])) || 'SportyBet Code Hub',
    tag: 'Code Hub',
    status: 'upcoming',
    result: null,
    created_at: safeDate(first(object, ['created_at','createdAt','published_at','publishedAt','date']))?.toISOString() || new Date().toISOString(),
    expires_at: safeDate(first(object, ['expires_at','expiresAt','expiry','expiration']))?.toISOString() || null,
    source_url: sourceUrl,
    tips: embeddedTips,
    _confidence: embeddedTips.length ? 6 : 3,
    _provenance: embeddedTips.length ? 'network-verified' : 'network-strong-code',
  };
}

function scanObjects(root, sourceUrl, maxNodes = 120000) {
  const out = [];
  const stack = [root];
  const seen = new Set();
  let visited = 0;
  while (stack.length && visited < maxNodes) {
    const node = stack.pop();
    visited += 1;
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    if (!Array.isArray(node)) {
      const item = candidateFromObject(node, sourceUrl);
      if (item) out.push(item);
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  return out;
}

function parseJsonBody(body) {
  const raw = text(body).trim();
  if (!raw || (!raw.startsWith('{') && !raw.startsWith('['))) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function mergeCandidates(items, limit) {
  const map = new Map();
  for (const item of items) {
    const code = normalizeCode(item?.code);
    if (!code) continue;
    const current = map.get(code) || { ...item, code, tips: [] };
    current.title = text(current.title) || text(item.title) || 'Free public code';
    current.odds = current.odds ?? item.odds ?? null;
    current.selections = current.selections ?? item.selections ?? null;
    current.source_url = current.source_url || item.source_url || codeHubUrl();
    current._confidence = Math.max(number(current._confidence), number(item._confidence));
    current._provenance = current._provenance || item._provenance || 'unknown';
    if (Array.isArray(item.tips) && item.tips.length > (current.tips?.length || 0)) {
      current.tips = item.tips;
      current._provenance = item._provenance || current._provenance;
    }
    map.set(code, current);
  }
  return [...map.values()]
    .sort((a, b) => number(b._confidence) - number(a._confidence))
    .slice(0, limit)
    .map(item => {
      const { _confidence, ...clean } = item;
      clean.selections = clean.selections ?? clean.tips?.length ?? 0;
      return clean;
    });
}

function networkCodeCandidates(responses, sourceUrl) {
  const out = [];
  for (const response of responses) {
    const payload = parseJsonBody(response.body);
    if (!payload) continue;
    out.push(...scanObjects(payload, sourceUrl));
  }
  return out;
}

const DOM_CODE_SCRIPT = String.raw`(() => {
  const common = new Set(['SPORTY','SPORTYBET','FOOTBALL','BOOKING','PUBLIC','POPULAR','LATEST','MARKET','SELECTION','SELECTIONS','LOADCODE','CONTINUE','SUBMIT','SEARCH','UPCOMING','FEATURED','BETSLIP','BETCODE','CODEHUB','GHANA','LOGIN','SIGNUP','CODE','TOTAL','ODDS','FREE','COPY','SHARE','OBJECT','OBJECTOBJECT','UNDEFINED','NULL','TRUE','FALSE','SUCCESS','ERROR','RESPONSE','REQUEST']);
  const rows = [];
  const cleanCode = value => {
    const code=String(value || '').trim().toUpperCase();
    return /^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{5,8}$/.test(code) && !common.has(code) ? code : '';
  };
  const add = (code, context, attrs = {}) => {
    code=cleanCode(code); if(!code) return;
    const lower = String(context || '').toLowerCase();
    if (!/(code|booking|odds|selection|pick|slip|share|copy)/.test(lower)) return;
    const oddsMatch = String(context).match(/(?:total\s*)?odds?\s*[:\-]?\s*([0-9][0-9,.]*(?:\.[0-9]+)?)/i);
    const countMatch = String(context).match(/(\d{1,3})\s*(?:selections?|picks?|legs?|events?)/i);
    rows.push({ code, context: String(context).slice(0, 1200), odds: oddsMatch ? oddsMatch[1] : null, selections: countMatch ? countMatch[1] : null, attrs });
  };
  for (const el of [...document.querySelectorAll('body *')]) {
    const own = String(el.innerText || el.textContent || '').replace(/\s+/g,' ').trim();
    const attrs = {};
    for (const attr of [...el.attributes || []]) {
      if (/code|booking|share|coupon/i.test(attr.name)) attrs[attr.name] = attr.value;
    }
    let card = el;
    for (let i = 0; i < 5 && card?.parentElement; i += 1) {
      const cardText = String(card.innerText || card.textContent || '').replace(/\s+/g,' ').trim();
      if (cardText.length >= 20 && cardText.length <= 1800 && /(code|booking|odds|selection|pick|slip|share|copy)/i.test(cardText)) break;
      card = card.parentElement;
    }
    const context = String(card?.innerText || card?.textContent || own).replace(/\s+/g,' ').trim();
    const direct=cleanCode(own);
    if(direct) add(direct,context,attrs);
    for(const [name,value] of Object.entries(attrs)) {
      const attrCode=cleanCode(value);
      if(attrCode) add(attrCode,context,attrs);
      const attrMatch=String(value).toUpperCase().match(/(?:BOOKING|BET|COUPON|SHARE)?\s*CODE\s*[:#\-]?\s*([A-Z0-9]{4,12}?)(?=\s|TOTAL|ODDS|SELECTION|PICK|COPY|SHARE|$)/);
      if(attrMatch) add(attrMatch[1],context,attrs);
    }
    const labelled=own.length<=80?own.toUpperCase().match(/(?:BOOKING|BET|COUPON|SHARE)?\s*CODE\s*[:#\-]?\s*([A-Z0-9]{4,12}?)(?=\s|TOTAL|ODDS|SELECTION|PICK|COPY|SHARE|$)/):null;
    if(labelled) add(labelled[1],context,attrs);
  }
  const unique=[]; const seen=new Set();
  for(const row of rows){const key=row.code+'|'+row.context;if(!seen.has(key)){seen.add(key);unique.push(row)}}
  return { title: document.title, url: location.href, body_text: String(document.body?.innerText || '').slice(0, 12000), rows:unique };
})()`

function domCandidates(dom, sourceUrl) {
  return (dom?.rows || []).map(row => ({
    id: hashKey(`sporty-browser:${row.code}`),
    code: normalizeCode(row.code),
    title: 'Free public code',
    odds: plausibleTotalOdds(row.odds, row.selections),
    selections: (() => { const value=numeric(row.selections); return value !== null && value >= 0 && value <= 100 ? Math.floor(value) : null; })(),
    author: 'SportyBet Code Hub',
    tag: 'Code Hub',
    status: 'upcoming',
    result: null,
    created_at: new Date().toISOString(),
    expires_at: null,
    source_url: sourceUrl,
    tips: [],
    _confidence: 4,
    _provenance: 'dom-labelled-code',
  })).filter(item => item.code);
}

function splitFixture(value) {
  const raw = text(value);
  if (!raw) return '';
  const parts = raw.split(/\s+(?:vs\.?|v\.?|–|—|-)\s+/i).map(text).filter(Boolean);
  return parts.length === 2 ? `${parts[0]} vs ${parts[1]}` : raw;
}

function coerceKickoff(value, reference = new Date()) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' || /^\d{10,13}$/.test(text(value))) {
    const n = Number(value);
    const millis = n > 1e12 ? n : n > 1e9 ? n * 1000 : NaN;
    if (Number.isFinite(millis)) {
      const date = new Date(millis);
      if (Number.isFinite(date.getTime())) return date;
    }
  }
  const raw = text(value).replace(/\s+/g, ' ').trim();
  if (!raw) return null;
  const ref = safeDate(reference) || new Date();

  const relative = raw.match(/\b(today|tomorrow)\b/i);
  if (relative) {
    const time = raw.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
    let hour = time ? Number(time[1]) : 12;
    const minute = time?.[2] ? Number(time[2]) : 0;
    const ampm = time?.[3]?.toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    const date = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() + (relative[1].toLowerCase() === 'tomorrow' ? 1 : 0), hour, minute));
    return Number.isFinite(date.getTime()) ? date : null;
  }

  const numericDate = raw.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?(?:[^\d]+(\d{1,2}):(\d{2})(?:\s*(am|pm))?)?/i);
  if (numericDate) {
    let year = numericDate[3] ? Number(numericDate[3]) : ref.getUTCFullYear();
    if (year < 100) year += 2000;
    let hour = numericDate[4] ? Number(numericDate[4]) : 12;
    const minute = numericDate[5] ? Number(numericDate[5]) : 0;
    const ampm = numericDate[6]?.toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    let date = new Date(Date.UTC(year, Number(numericDate[2]) - 1, Number(numericDate[1]), hour, minute));
    if (!numericDate[3] && date.getTime() < ref.getTime() - 2 * 86400000) date = new Date(Date.UTC(year + 1, Number(numericDate[2]) - 1, Number(numericDate[1]), hour, minute));
    return Number.isFinite(date.getTime()) ? date : null;
  }

  const months={jan:0,january:0,feb:1,february:1,mar:2,march:2,apr:3,april:3,may:4,jun:5,june:5,jul:6,july:6,aug:7,august:7,sep:8,sept:8,september:8,oct:9,october:9,nov:10,november:10,dec:11,december:11};
  const textual = raw.match(/(?:\b(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?\b[,\s]*)?(?:(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})|([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?)(?:[,\s]+(\d{4}))?(?:[^\d]+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/i);
  if (textual) {
    const day = Number(textual[1] || textual[4]);
    const monthName = String(textual[2] || textual[3] || '').toLowerCase();
    const month = months[monthName];
    if (Number.isInteger(month) && day >= 1 && day <= 31) {
      let year = textual[5] ? Number(textual[5]) : ref.getUTCFullYear();
      let hour = textual[6] ? Number(textual[6]) : 12;
      const minute = textual[7] ? Number(textual[7]) : 0;
      const ampm = textual[8]?.toLowerCase();
      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      let date = new Date(Date.UTC(year, month, day, hour, minute));
      if (!textual[5] && date.getTime() < ref.getTime() - 2 * 86400000) date = new Date(Date.UTC(year + 1, month, day, hour, minute));
      return Number.isFinite(date.getTime()) ? date : null;
    }
  }

  // Only let the platform parser handle values that contain an explicit year.
  // Without this guard, strings such as "Wed 13 Feb" become February 2001.
  if (/\b\d{4}\b/.test(raw)) {
    const direct = safeDate(raw);
    if (direct) return direct;
  }
  return null;
}

function publicCodeKickoff(value, reference = new Date()) {
  const date = coerceKickoff(value, reference);
  if (!date) return null;
  const delta = date.getTime() - (safeDate(reference) || new Date()).getTime();
  return delta >= -(18 * 60 * 60 * 1000) && delta <= 60 * 86400000 ? date : null;
}

function tipFromObject(object) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return null;
  const eventName = first(object, [
    'fixture','eventName','matchName','event_name','match_name','name','displayName','event.description',
  ]);
  const home = first(object, ['homeTeamName','home_team_name','homeTeam.name','home.name','event.homeTeamName']);
  const away = first(object, ['awayTeamName','away_team_name','awayTeam.name','away.name','event.awayTeamName']);
  const fixture = splitFixture(eventName || (home && away ? `${home} vs ${away}` : ''));
  const market = text(first(object, [
    'market','marketName','market_name','betTypeName','bet_type','marketDesc','marketDescription','betMarket.name','market.name',
  ]));
  const pick = text(first(object, [
    'pick','selection','selectionName','selection_name','outcomeName','outcome_name','optionName','option_name','desc','description','label',
  ]));
  const odds = plausibleSelectionOdds(first(object, ['odds','odd','price','decimalOdds','currentOdd','currentOdds']));
  const league = text(first(object, ['league','leagueName','tournamentName','competitionName','categoryName','event.tournamentName']));
  const kickoff = coerceKickoff(first(object, [
    'kickoff','kickOff','startTime','start_time','startDate','start_date','eventDate','event_date','matchDate','match_date',
    'scheduledAt','scheduled_at','estimateStartTime','eventStartTime','event_start_time','eventTimestamp','event_timestamp',
    'startTimestamp','start_timestamp','eventStartTimestamp','event_start_timestamp','eventDateTime','event_date_time',
    'date','time','event.startTime','event.start_time','event.startDate','event.eventDate','event.estimateStartTime','fixture.startTime',
  ]))?.toISOString() || null;
  if (!fixture || !market || !pick) return null;
  if (!/\b(?:vs\.?|v\.?)\b/i.test(fixture) && !(home && away)) return null;
  return { fixture, market, pick, odds, league: league || null, kickoff, result: 'unavailable' };
}

function scanTips(root, maxNodes = 160000) {
  const tips = [];
  const stack = [root];
  const seen = new Set();
  let visited = 0;
  while (stack.length && visited < maxNodes) {
    const node = stack.pop();
    visited += 1;
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    if (!Array.isArray(node)) {
      const tip = tipFromObject(node);
      if (tip) tips.push(tip);
    }
    for (const value of Object.values(node)) if (value && typeof value === 'object') stack.push(value);
  }
  const unique = new Map();
  for (const tip of tips) {
    const key = [canonical(tip.fixture), canonical(tip.market), canonical(tip.pick)].join('|');
    if (!key.replace(/\|/g, '')) continue;
    const current = unique.get(key);
    if (!current || (!current.kickoff && tip.kickoff) || (current.odds == null && tip.odds != null)) unique.set(key, tip);
  }
  return [...unique.values()].slice(0, 100);
}

const LOAD_FORM_SCRIPT = code => String.raw`(async () => {
  const code = ${JSON.stringify(code)};
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const visible = el => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  const inputs = [...document.querySelectorAll('input')].filter(visible);
  let input = inputs.find(el => /code|booking|coupon|load/i.test([el.name, el.id, el.placeholder, el.getAttribute('aria-label')].filter(Boolean).join(' ')));
  input ||= inputs.find(el => ['text','search','tel',''].includes((el.type || '').toLowerCase()));
  if (!input) return { submitted:false, reason:'input_not_found', inputs:inputs.length };

  const oldValue = input.value;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(input, code); else input.value = code;
  if (input._valueTracker?.setValue) input._valueTracker.setValue(oldValue);
  input.focus();
  try { input.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'insertText', data:code })); }
  catch { input.dispatchEvent(new Event('input', { bubbles:true })); }
  input.dispatchEvent(new Event('change', { bubbles:true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { key:'Unidentified', bubbles:true }));
  await pause(700);

  const buttons = [...document.querySelectorAll('button,[role="button"],input[type="submit"],a')].filter(visible);
  const enabled = el => !el.disabled && el.getAttribute('aria-disabled') !== 'true';
  const label = el => String(el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g,' ').trim();
  const button = buttons.find(el => enabled(el) && /load\s*code|load|submit|search|continue|apply|use\s*code|confirm/i.test(label(el)));
  if (button) {
    button.scrollIntoView({ block:'center', inline:'center' });
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles:true, view:window }));
    button.dispatchEvent(new MouseEvent('mouseup', { bubbles:true, view:window }));
    button.click();
    return { submitted:true, method:'button', label:label(button).slice(0,80), value:input.value };
  }
  const form = input.closest('form');
  if (form?.requestSubmit) {
    form.requestSubmit();
    return { submitted:true, method:'requestSubmit', value:input.value };
  }
  input.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true }));
  input.dispatchEvent(new KeyboardEvent('keypress', { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true }));
  return { submitted:true, method:'enter', value:input.value };
})()`;

const DOM_TIPS_SCRIPT = String.raw`(() => {
  const selectors = [
    '[class*="selection"]','[class*="bet-item"]','[class*="betslip"]','[class*="event-item"]','[class*="eventItem"]',
    '[data-testid*="selection"]','[data-testid*="bet"]','li','article'
  ];
  const blocks = [...new Set(selectors.flatMap(s => [...document.querySelectorAll(s)]))];
  const rows = [];
  const dateHint = value => String(value || '').match(/\b(?:today|tomorrow)\b(?:\s*(?:at)?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?|\b\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?(?:\s+\d{1,2}:\d{2}\s*(?:am|pm)?)?|(?:\b(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?\b[,\s]*)?\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{4})?(?:\s+\d{1,2}:\d{2}\s*(?:am|pm)?)?/i)?.[0] || null;
  for (const el of blocks) {
    const text = String(el.innerText || el.textContent || '').replace(/\s+/g,' ').trim();
    if (text.length < 15 || text.length > 900) continue;
    if (!/(\bvs\.?\b|\bv\.?\b)/i.test(text)) continue;
    if (!/\b\d+\.\d+\b/.test(text)) continue;
    const parentText = String(el.parentElement?.innerText || '').replace(/\s+/g,' ').trim().slice(0,1400);
    const previousText = String(el.previousElementSibling?.innerText || el.previousElementSibling?.textContent || '').replace(/\s+/g,' ').trim().slice(0,300);
    const attrs = [...el.attributes].map(attr => String(attr.name) + '=' + String(attr.value)).join(' ');
    rows.push({ text, date_text:dateHint([text,parentText,previousText,attrs].join(' ')) });
  }
  const body = String(document.body?.innerText || '').replace(/\s+/g,' ').trim();
  const totalOdds = body.match(/(?:total\s*)?odds?\s*[:\-]?\s*([0-9][0-9,.]*(?:\.[0-9]+)?)/i)?.[1] || null;
  return { url:location.href, title:document.title, total_odds:totalOdds, rows:rows.slice(0,120), body_text:body.slice(0,16000) };
})()`

function tipsFromDom(dom) {
  const out = [];
  for (const row of dom?.rows || []) {
    const raw = text(typeof row === 'string' ? row : row?.text);
    if (!raw) continue;
    const fixtureMatch = raw.match(/([^|;]{2,80}\s+(?:vs\.?|v\.?)\s+[^|;]{2,80})/i);
    const oddsMatch = raw.match(/\b(\d+\.\d+)\b/g);
    if (!fixtureMatch || !oddsMatch?.length) continue;
    const fixture = splitFixture(fixtureMatch[1]);
    const odds = plausibleSelectionOdds(oddsMatch[oddsMatch.length - 1]);
    if (odds === null) continue;
    const remainder = raw.replace(fixtureMatch[0], '').replace(oddsMatch[oddsMatch.length - 1], '').trim();
    const segments = remainder.split(/\s{2,}|\||;/).map(text).filter(Boolean);
    const market = segments[0] || 'Market';
    const pick = segments[1] || segments[0] || 'Selection';
    const kickoff = coerceKickoff(typeof row === 'string' ? raw : (row?.date_text || raw))?.toISOString() || null;
    if (fixture && market && pick) out.push({ fixture, market, pick, odds, league:null, kickoff, result:'unavailable' });
  }
  const unique = new Map();
  for (const tip of out) unique.set(`${canonical(tip.fixture)}|${canonical(tip.market)}|${canonical(tip.pick)}`, tip);
  return [...unique.values()].slice(0,100);
}


function validTip(tip) {
  if (!tip || typeof tip !== 'object') return false;
  const fixture = text(tip.fixture);
  const market = text(tip.market);
  const pick = text(tip.pick);
  if (!fixture || !market || !pick) return false;
  if (!/\b(?:vs\.?|v\.?)\b/i.test(fixture)) return false;
  if (/object object|undefined|null/i.test(`${fixture} ${market} ${pick}`)) return false;
  return tip.odds === null || tip.odds === undefined || plausibleSelectionOdds(tip.odds) !== null;
}

function sanitizeCollectedItem(item) {
  const code = normalizeCode(item?.code);
  if (!code) return null;
  const tips = (Array.isArray(item?.tips) ? item.tips : []).filter(validTip).map(tip => ({
    ...tip,
    odds: plausibleSelectionOdds(tip.odds),
    kickoff: publicCodeKickoff(tip.kickoff || tip.start_time || tip.startTime || tip.eventDate || tip.matchDate)?.toISOString() || null,
  }));
  let selections = numeric(item?.selections);
  selections = selections !== null && selections >= 0 && selections <= 100 ? Math.floor(selections) : null;
  if (tips.length) selections = tips.length;
  let odds = plausibleTotalOdds(item?.odds, selections);
  const tipOdds = tips.map(tip => plausibleSelectionOdds(tip.odds));
  if (tipOdds.length && tipOdds.every(value => value !== null)) {
    const product = tipOdds.reduce((total, value) => total * value, 1);
    if (Number.isFinite(product) && product >= 1.001 && product <= 1_000_000) {
      // Prefer the leg product when the scraped total is clearly an unrelated
      // ID/timestamp or differs by more than a factor of 25.
      if (odds === null || Math.max(odds / product, product / odds) > 25) odds = product;
    }
  }
  return {
    ...item,
    code,
    odds: odds === null ? null : Number(odds.toFixed(4)),
    selections: selections ?? 0,
    tips,
  };
}

function verifiedCollectedItems(items, limit = 40) {
  return (Array.isArray(items) ? items : [])
    .map(sanitizeCollectedItem)
    .filter(item => item && item.tips.length > 0)
    .slice(0, Math.max(1, Math.min(40, number(limit) || 40)));
}

function safeNetworkSummary(response) {
  let path = '';
  try {
    const url = new URL(response?.url);
    path = `${url.pathname}${url.search ? `?${[...url.searchParams.keys()].slice(0,12).join(',')}` : ''}`;
  } catch { path = text(response?.url).slice(0,180); }
  return {
    method: text(response?.method) || 'GET',
    path: path.slice(0,220),
    status: number(response?.status) || null,
    type: text(response?.type),
    mime: text(response?.mimeType),
    request_keys: Array.isArray(response?.requestKeys) ? response.requestKeys.slice(0,16) : [],
  };
}

async function expandCode(session, code, sourceUrl) {
  await session.navigate(allowedUrl(loadCodeUrl()), { waitMs: number(env('SPORTYBET_BROWSER_PAGE_WAIT_MS', '6500')) || 6500 });
  const startIndex = session.networkIndex();
  const form = await session.evaluate(LOAD_FORM_SCRIPT(code)).catch(error => ({ submitted:false, reason:publicError(error) }));
  await sleep(number(env('SPORTYBET_BROWSER_AFTER_SUBMIT_MS', '8500')) || 8500);
  await session.scroll({ steps:2, delayMs:500 }).catch(() => null);
  const responses = session.networkSince(startIndex);
  let tips = [];
  let odds = null;
  for (const response of responses) {
    const payload = parseJsonBody(response.body);
    if (!payload) continue;
    const found = scanTips(payload);
    if (found.length > tips.length) tips = found;
    if (odds === null) {
      const candidates = scanObjects(payload, sourceUrl);
      odds = candidates.find(item => item.code === code)?.odds ?? null;
    }
  }
  const dom = await session.evaluate(DOM_TIPS_SCRIPT).catch(() => null);
  if (!tips.length) tips = tipsFromDom(dom);
  tips = tips.filter(validTip);
  odds ??= plausibleTotalOdds(dom?.total_odds, tips.length || null);
  const failureText = !tips.length
    ? text(dom?.body_text).match(/(?:invalid|expired|not\s+found|unable|failed|try\s+again)[^.]{0,160}/i)?.[0] || null
    : null;
  return {
    tips,
    odds,
    verified: tips.length > 0,
    submitted: form?.submitted || false,
    method: form?.method || form?.reason || null,
    entered_value: text(form?.value),
    failure_text: failureText,
    network_responses: responses.length,
    network: responses.slice(-12).map(safeNetworkSummary),
  };
}

async function runInternal({ limit, expandLimit }) {
  const sourceUrl = allowedUrl(codeHubUrl());
  state.page_url = sourceUrl;
  state.load_url = allowedUrl(loadCodeUrl());
  return withChromium(async session => {
    const origin=new URL(sourceUrl).origin;
    await session.setExtraHeaders({
      accept:'application/json, text/plain, */*',
      'accept-language':'en',
      clientid:'wap',
      operid:'3',
      platform:'wap',
      referer:sourceUrl,
    });
    await session.setCookie({name:'locale',value:'en',url:origin});
    await session.setCookie({name:'sb_country',value:country(),url:origin});
    await session.navigate(sourceUrl, { waitMs: number(env('SPORTYBET_BROWSER_PAGE_WAIT_MS', '8000')) || 8000 });
    await session.scroll({ steps:number(env('SPORTYBET_BROWSER_SCROLL_STEPS', '6')) || 6, delayMs:700 });
    await sleep(1200);
    const dom = await session.evaluate(DOM_CODE_SCRIPT);
    const network = session.networkSince(0);
    const fromNetwork = networkCodeCandidates(network, sourceUrl);
    const fromDom = domCandidates(dom, sourceUrl);
    state.network_candidates = fromNetwork.length;
    state.dom_candidates = fromDom.length;

    let candidates = mergeCandidates([...fromNetwork, ...fromDom], limit)
      .map(sanitizeCollectedItem).filter(Boolean).slice(0, limit);
    state.codes_discovered = candidates.length;
    state.network_responses = network.length;
    state.chromium = session.diagnostics();
    state.submissions_attempted = 0;
    state.last_expansion_network = [];

    const pending = candidates.filter(item => !item.tips.length).slice(0, expandLimit);
    for (const item of pending) {
      try {
        const detail = await expandCode(session, item.code, sourceUrl);
        state.submissions_attempted += detail.submitted ? 1 : 0;
        if (detail.tips.length) item.tips = detail.tips;
        if (item.odds === null || item.odds === undefined) item.odds = detail.odds;
        if (!item.selections) item.selections = item.tips.length;
        item.expansion = {
          submitted:detail.submitted,
          verified:detail.verified,
          method:detail.method,
          network_responses:detail.network_responses,
          failure_text:detail.failure_text,
        };
        if (!detail.verified && detail.network.length) state.last_expansion_network = detail.network;
      } catch (error) {
        item.expansion = { submitted:false, verified:false, error:publicError(error) };
      }
      await sleep(number(env('SPORTYBET_BROWSER_EXPANSION_DELAY_MS', '900')) || 900);
    }

    candidates = candidates.map(sanitizeCollectedItem).filter(Boolean).slice(0, limit);
    const verified = verifiedCollectedItems(candidates, limit);
    const tipCount = verified.reduce((sum,item) => sum + item.tips.length, 0);
    state.codes_expanded = verified.length;
    state.verified_slips = verified.length;
    state.rejected_unverified = Math.max(0, candidates.length - verified.length);
    state.tips_found = tipCount;
    state.last_result_preview = verified.slice(0,5).map(item => ({ code:item.code, odds:item.odds, selections:item.selections, tips:item.tips.length }));
    return verified.map(item => {
      const { expansion, _provenance, ...clean } = item;
      return clean;
    });
  });
}

export async function collectSportyBetCodesWithBrowser({ limit = 20, expandLimit } = {}) {
  if (!enabled()) throw new Error('SportyBet browser collector is disabled');
  if (activeRun) return activeRun;
  const safeLimit = Math.max(1, Math.min(40, number(limit) || 20));
  const safeExpand = Math.max(0, Math.min(safeLimit, number(expandLimit ?? env('SPORTYBET_CODE_EXPANSION_LIMIT', String(safeLimit))) || safeLimit));
  activeRun = (async () => {
    const started = Date.now();
    state.running = true;
    state.last_started_at = new Date().toISOString();
    state.last_error = null;
    state.codes_discovered = 0;
    state.codes_expanded = 0;
    state.tips_found = 0;
    state.network_responses = 0;
    state.submissions_attempted = 0;
    state.verified_slips = 0;
    state.rejected_unverified = 0;
    state.dom_candidates = 0;
    state.network_candidates = 0;
    state.last_result_preview = [];
    state.last_expansion_network = [];
    try {
      const items = await runInternal({ limit:safeLimit, expandLimit:safeExpand });
      state.last_finished_at = new Date().toISOString();
      state.last_duration_ms = Date.now() - started;
      if (items.length) state.last_success_at = state.last_finished_at;
      else state.last_error = 'Code Hub candidates were found, but none returned a verified public slip with selections.';
      return items;
    } catch (error) {
      state.last_finished_at = new Date().toISOString();
      state.last_duration_ms = Date.now() - started;
      state.last_error = publicError(error);
      throw error;
    } finally {
      state.running = false;
      activeRun = null;
    }
  })();
  return activeRun;
}

export function getSportyBetBrowserStatus() {
  return {
    ...state,
    configured: enabled(),
    public_only: true,
    imports_private_cookies: false,
    uses_account_login: false,
  };
}

export function browserCollectorConfigured() {
  return enabled();
}

export const __test = Object.freeze({
  normalizeCode,
  scanObjects,
  scanTips,
  mergeCandidates,
  domCandidates,
  tipsFromDom,
  plausibleTotalOdds,
  sanitizeCollectedItem,
  verifiedCollectedItems,
  DOM_CODE_SCRIPT,
  DOM_TIPS_SCRIPT,
  LOAD_FORM_SCRIPT,
  coerceKickoff,
  publicCodeKickoff,
});
