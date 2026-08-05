import { env, text, number, safeDate, canonical, hashKey, publicError } from './core.mjs';
import { withChromium } from './chromium-cdp.mjs';

const CODE_RE = /^[A-Z0-9]{4,12}$/;
const COMMON_WORDS = new Set([
  'SPORTY','SPORTYBET','FOOTBALL','BOOKING','PUBLIC','POPULAR','LATEST','MARKET','SELECTION','LOADCODE',
  'CONTINUE','SUBMIT','SEARCH','UPCOMING','FEATURED','BETSLIP','BETCODE','CODEHUB','GHANA','LOGIN','SIGNUP',
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
};
let activeRun = null;

function enabled() {
  return !/^(0|false|no|off)$/i.test(env('SPORTYBET_BROWSER_COLLECTOR_ENABLED', 'true'));
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

function normalizeCode(value) {
  const code = text(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!CODE_RE.test(code) || COMMON_WORDS.has(code)) return '';
  return code;
}

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, '').match(/\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(parsed) ? parsed : null;
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

function objectCode(object) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return '';
  const direct = first(object, [
    'code','booking_code','bookingCode','bet_code','betCode','coupon_code','couponCode','short_code','shortCode',
    'booking.code','shareCode','share_code','codeId','code_id',
  ]);
  return normalizeCode(direct);
}

function totalOdds(object) {
  return numeric(first(object, [
    'total_odds','totalOdds','odds','total_odd','totalOdd','combinedOdds','totalPrice','betTotalOdds',
    'summary.totalOdds','booking.totalOdds','betslip.totalOdds',
  ]));
}

function selectionCount(object) {
  const direct = numeric(first(object, [
    'selections_count','selectionCount','selectionsCount','numberOfSelections','betCount','betsCount','legs','legCount',
    'summary.selectionCount','booking.selectionCount',
  ]));
  if (direct !== null) return Math.floor(direct);
  for (const key of ['tips','selections','selectionList','bets','betSelections','legs','items']) {
    if (Array.isArray(object?.[key])) return object[key].length;
  }
  return null;
}

function candidateFromObject(object, sourceUrl) {
  const code = objectCode(object);
  if (!code) return null;
  return {
    id: hashKey(`sporty-browser:${code}`),
    code,
    title: text(first(object, ['title','name','description','label'])) || 'Free public code',
    odds: totalOdds(object),
    selections: selectionCount(object),
    author: text(first(object, ['author','tipster','creator','username'])) || 'SportyBet Code Hub',
    tag: 'Code Hub',
    status: 'upcoming',
    result: null,
    created_at: safeDate(first(object, ['created_at','createdAt','published_at','publishedAt','date']))?.toISOString() || new Date().toISOString(),
    expires_at: safeDate(first(object, ['expires_at','expiresAt','expiry','expiration']))?.toISOString() || null,
    source_url: sourceUrl,
    tips: [],
    _confidence: 3,
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
    if (Array.isArray(item.tips) && item.tips.length > (current.tips?.length || 0)) current.tips = item.tips;
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
  const common = new Set(['SPORTY','SPORTYBET','FOOTBALL','BOOKING','PUBLIC','POPULAR','LATEST','MARKET','SELECTION','SELECTIONS','LOADCODE','CONTINUE','SUBMIT','SEARCH','UPCOMING','FEATURED','BETSLIP','BETCODE','CODEHUB','GHANA','LOGIN','SIGNUP','CODE','TOTAL','ODDS','FREE','COPY','SHARE']);
  const rows = [];
  const cleanCode = value => {
    const code=String(value || '').trim().toUpperCase();
    return /^[A-Z0-9]{4,12}$/.test(code) && !common.has(code) ? code : '';
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
    odds: numeric(row.odds),
    selections: numeric(row.selections),
    author: 'SportyBet Code Hub',
    tag: 'Code Hub',
    status: 'upcoming',
    result: null,
    created_at: new Date().toISOString(),
    expires_at: null,
    source_url: sourceUrl,
    tips: [],
    _confidence: 2,
  })).filter(item => item.code);
}

function splitFixture(value) {
  const raw = text(value);
  if (!raw) return '';
  const parts = raw.split(/\s+(?:vs\.?|v\.?|–|—|-)\s+/i).map(text).filter(Boolean);
  return parts.length === 2 ? `${parts[0]} vs ${parts[1]}` : raw;
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
  const odds = numeric(first(object, ['odds','odd','price','decimalOdds','currentOdd','currentOdds']));
  const league = text(first(object, ['league','leagueName','tournamentName','competitionName','categoryName','event.tournamentName']));
  const kickoff = safeDate(first(object, ['kickoff','startTime','start_time','estimateStartTime','eventStartTime','event.startTime']))?.toISOString() || null;
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
    if (key.replace(/\|/g, '')) unique.set(key, tip);
  }
  return [...unique.values()].slice(0, 100);
}

const LOAD_FORM_SCRIPT = code => String.raw`(() => {
  const code = ${JSON.stringify(code)};
  const visible = el => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  const inputs = [...document.querySelectorAll('input')].filter(visible);
  let input = inputs.find(el => /code|booking|coupon|load/i.test([el.name, el.id, el.placeholder, el.getAttribute('aria-label')].filter(Boolean).join(' ')));
  input ||= inputs.find(el => ['text','search','tel',''].includes((el.type || '').toLowerCase()));
  if (!input) return { submitted:false, reason:'input_not_found', inputs:inputs.length };
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(input, code); else input.value = code;
  input.focus();
  for (const type of ['input','change','keyup']) input.dispatchEvent(new Event(type, { bubbles:true }));
  const buttons = [...document.querySelectorAll('button,[role="button"],input[type="submit"],a')].filter(visible);
  const button = buttons.find(el => /load|submit|search|continue|apply|use code|confirm/i.test(String(el.innerText || el.value || el.getAttribute('aria-label') || '')));
  if (button) { button.click(); return { submitted:true, method:'button', label:String(button.innerText || button.value || '').slice(0,80) }; }
  input.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', code:'Enter', bubbles:true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { key:'Enter', code:'Enter', bubbles:true }));
  return { submitted:true, method:'enter' };
})()`;

const DOM_TIPS_SCRIPT = String.raw`(() => {
  const selectors = [
    '[class*="selection"]','[class*="bet-item"]','[class*="betslip"]','[class*="event-item"]','[class*="eventItem"]',
    '[data-testid*="selection"]','[data-testid*="bet"]','li','article'
  ];
  const blocks = [...new Set(selectors.flatMap(s => [...document.querySelectorAll(s)]))];
  const rows = [];
  for (const el of blocks) {
    const text = String(el.innerText || el.textContent || '').replace(/\s+/g,' ').trim();
    if (text.length < 15 || text.length > 900) continue;
    if (!/(\bvs\.?\b|\bv\.?\b)/i.test(text)) continue;
    if (!/\b\d+\.\d+\b/.test(text)) continue;
    rows.push(text);
  }
  const body = String(document.body?.innerText || '').replace(/\s+/g,' ').trim();
  const totalOdds = body.match(/(?:total\s*)?odds?\s*[:\-]?\s*([0-9][0-9,.]*(?:\.[0-9]+)?)/i)?.[1] || null;
  return { url:location.href, title:document.title, total_odds:totalOdds, rows:rows.slice(0,120), body_text:body.slice(0,16000) };
})()`;

function tipsFromDom(dom) {
  const out = [];
  for (const raw of dom?.rows || []) {
    const fixtureMatch = raw.match(/([^|;]{2,80}\s+(?:vs\.?|v\.?)\s+[^|;]{2,80})/i);
    const oddsMatch = raw.match(/\b(\d+\.\d+)\b/g);
    if (!fixtureMatch || !oddsMatch?.length) continue;
    const fixture = splitFixture(fixtureMatch[1]);
    const odds = numeric(oddsMatch[oddsMatch.length - 1]);
    const remainder = raw.replace(fixtureMatch[0], '').replace(oddsMatch[oddsMatch.length - 1], '').trim();
    const segments = remainder.split(/\s{2,}|\||;/).map(text).filter(Boolean);
    const market = segments[0] || 'Market';
    const pick = segments[1] || segments[0] || 'Selection';
    if (fixture && market && pick) out.push({ fixture, market, pick, odds, league:null, kickoff:null, result:'unavailable' });
  }
  const unique = new Map();
  for (const tip of out) unique.set(`${canonical(tip.fixture)}|${canonical(tip.market)}|${canonical(tip.pick)}`, tip);
  return [...unique.values()].slice(0,100);
}

async function expandCode(session, code, sourceUrl) {
  const startIndex = session.networkIndex();
  await session.navigate(allowedUrl(loadCodeUrl()), { waitMs: number(env('SPORTYBET_BROWSER_PAGE_WAIT_MS', '6500')) || 6500 });
  const form = await session.evaluate(LOAD_FORM_SCRIPT(code)).catch(error => ({ submitted:false, reason:publicError(error) }));
  await sleep(number(env('SPORTYBET_BROWSER_AFTER_SUBMIT_MS', '6500')) || 6500);
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
  odds ??= numeric(dom?.total_odds);
  return { tips, odds, submitted:form?.submitted || false, method:form?.method || form?.reason || null, network_responses:responses.length };
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
    let items = mergeCandidates([...fromNetwork, ...fromDom], limit);
    state.codes_discovered = items.length;
    state.network_responses = network.length;
    state.chromium = session.diagnostics();

    let expanded = 0;
    let tipCount = 0;
    for (const item of items.slice(0, expandLimit)) {
      try {
        const detail = await expandCode(session, item.code, sourceUrl);
        if (detail.tips.length) item.tips = detail.tips;
        if (item.odds === null || item.odds === undefined) item.odds = detail.odds;
        if (!item.selections) item.selections = item.tips.length;
        item.expansion = { submitted:detail.submitted, method:detail.method };
        expanded += detail.submitted ? 1 : 0;
        tipCount += item.tips.length;
      } catch (error) {
        item.expansion = { submitted:false, error:publicError(error) };
      }
      await sleep(number(env('SPORTYBET_BROWSER_EXPANSION_DELAY_MS', '900')) || 900);
    }
    state.codes_expanded = expanded;
    state.tips_found = tipCount;
    state.last_result_preview = items.slice(0,5).map(item => ({ code:item.code, odds:item.odds, selections:item.selections, tips:item.tips.length }));
    return items.map(item => {
      const { expansion, ...clean } = item;
      return clean;
    });
  });
}

export async function collectSportyBetCodesWithBrowser({ limit = 20, expandLimit } = {}) {
  if (!enabled()) throw new Error('SportyBet browser collector is disabled');
  if (activeRun) return activeRun;
  const safeLimit = Math.max(1, Math.min(40, number(limit) || 20));
  const safeExpand = Math.max(0, Math.min(safeLimit, number(expandLimit ?? env('SPORTYBET_CODE_EXPANSION_LIMIT', '8')) || 8));
  activeRun = (async () => {
    const started = Date.now();
    state.running = true;
    state.last_started_at = new Date().toISOString();
    state.last_error = null;
    try {
      const items = await runInternal({ limit:safeLimit, expandLimit:safeExpand });
      state.last_finished_at = new Date().toISOString();
      state.last_duration_ms = Date.now() - started;
      if (items.length) state.last_success_at = state.last_finished_at;
      else state.last_error = 'The browser opened Code Hub but found no public booking codes.';
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
  DOM_CODE_SCRIPT,
  DOM_TIPS_SCRIPT,
  LOAD_FORM_SCRIPT,
});
