import { env, text, number, safeDate, canonical, hashKey, publicError } from './core.mjs';

const DEFAULT_EVENTS_URL = 'https://www.sportybet.com/api/{country}/factsCenter/pcUpcomingEvents?sportId=sr%3Asport%3A1&marketId=1&pageNum={page}&pageSize=100';
const DEFAULT_CODEHUB_URL = 'https://www.sportybet.com/{country}/m/code-hub/codes';

const emptyDiagnostic = () => ({
  http_status: null,
  content_type: null,
  final_host: null,
  final_path: null,
  body_bytes: 0,
  response_kind: 'not_attempted',
  json_candidates: 0,
  top_level_keys: [],
  sample_object_keys: [],
  pages_attempted: 0,
  parsed_before_filter: 0,
  filtered_out: 0,
  html_codes_found: 0,
  extraction_methods: [],
  script_tags_found: 0,
});

const status = {
  events: {
    configured: true,
    last_attempt_at: null,
    last_success_at: null,
    last_error: null,
    count: 0,
    url_source: 'default-public',
    diagnostic: emptyDiagnostic(),
  },
  codes: {
    configured: true,
    last_attempt_at: null,
    last_success_at: null,
    last_error: null,
    count: 0,
    url_source: 'default-public',
    diagnostic: emptyDiagnostic(),
  },
};

function cleanCountry() {
  return text(env('SPORTYBET_COUNTRY', 'gh')).toLowerCase().replace(/[^a-z]/g, '').slice(0, 3) || 'gh';
}

function configuredUrl(name, fallback) {
  const value = text(env(name));
  return { value: value || fallback, source: value ? 'render-environment' : 'default-public' };
}

function renderTemplate(template, vars = {}) {
  return String(template || '').replace(/\{([a-z_]+)\}/gi, (_, key) => encodeURIComponent(String(vars[key] ?? '')));
}

function collectorEnabled() {
  return !/^(0|false|no|off)$/i.test(env('SPORTYBET_PUBLIC_COLLECTOR_ENABLED', 'true'));
}

function permittedUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('The configured SportyBet public URL is invalid');
  }
  const localTest = /^(1|true|yes|on)$/i.test(env('SPORTYBET_ALLOW_INSECURE_TEST_URL', 'false'))
    && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localTest) throw new Error('SportyBet public sources must use HTTPS');
  const host = url.hostname.toLowerCase();
  const allowCustom = /^(1|true|yes|on)$/i.test(env('SPORTYBET_ALLOW_CUSTOM_PUBLIC_HOST', 'false'));
  if (!allowCustom && host !== 'sportybet.com' && !host.endsWith('.sportybet.com')) {
    throw new Error('The public source must be hosted on sportybet.com');
  }
  return url;
}

function publicHeaders(country) {
  return {
    Accept: 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Referer: `https://www.sportybet.com/${country}/`,
    Origin: 'https://www.sportybet.com',
    'Accept-Language': 'en-GB,en;q=0.9',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };
}

function classifyBody(body, contentType = '') {
  const raw = String(body || '').trim();
  if (!raw) return 'empty';
  if (/json/i.test(contentType) || raw.startsWith('{') || raw.startsWith('[')) return 'json';
  if (/html/i.test(contentType) || /^<!doctype html|^<html/i.test(raw)) return 'html';
  return 'text';
}

async function fetchPublic(url, { timeoutMs = 16000 } = {}) {
  const target = permittedUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(target, {
      method: 'GET',
      headers: publicHeaders(cleanCountry()),
      redirect: 'follow',
      signal: controller.signal,
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`SportyBet public source returned HTTP ${response.status}`);
    return {
      body,
      contentType: text(response.headers.get('content-type')),
      url: String(response.url || target),
      status: response.status,
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('SportyBet public source timed out');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function decodeJsEscapes(value) {
  return String(value || '')
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\x([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\');
}

function balancedJsonAt(source, start) {
  const open = source[start];
  const close = open === '{' ? '}' : open === '[' ? ']' : null;
  if (!close) return null;
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

function parseEmbeddedAssignments(source, out) {
  const markers = [
    '__INITIAL_STATE__', '__PRELOADED_STATE__', '__APOLLO_STATE__',
    '__NEXT_DATA__', '__NUXT__', '__NUXT_DATA__', 'INITIAL_STATE',
  ];
  for (const marker of markers) {
    let offset = 0;
    while ((offset = source.indexOf(marker, offset)) !== -1) {
      const brace = source.slice(offset + marker.length).search(/[\[{]/);
      if (brace < 0) break;
      const start = offset + marker.length + brace;
      const fragment = balancedJsonAt(source, start);
      if (fragment) {
        try { out.push(JSON.parse(fragment)); } catch {}
        offset = start + fragment.length;
      } else offset = start + 1;
    }
  }
}

function parseJsonParseCalls(source, out) {
  const re = /JSON\.parse\(\s*(["'])([\s\S]*?)\1\s*\)/g;
  for (const match of source.matchAll(re)) {
    try {
      const decoded = decodeJsEscapes(match[2]);
      out.push(JSON.parse(decoded));
    } catch {}
  }
}

function jsonCandidates(body, contentType = '') {
  const out = [];
  const seen = new Set();
  const add = (value) => {
    if (!value || typeof value !== 'object') return;
    let key = '';
    try { key = JSON.stringify(value); } catch { return; }
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(value);
  };
  const raw = String(body || '').trim();
  if (/json/i.test(contentType) || raw.startsWith('{') || raw.startsWith('[')) {
    try { add(JSON.parse(raw)); } catch {}
  }

  const decoded = decodeHtml(raw);
  const scripts = [...decoded.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of scripts) {
    const script = String(match[1] || '').trim();
    if (!script) continue;
    if (script.startsWith('{') || script.startsWith('[')) {
      try { add(JSON.parse(script)); } catch {}
    }
    const unescaped = decodeJsEscapes(script);
    if (unescaped !== script && (unescaped.trim().startsWith('{') || unescaped.trim().startsWith('['))) {
      try { add(JSON.parse(unescaped.trim())); } catch {}
    }
    const local = [];
    parseEmbeddedAssignments(script, local);
    parseEmbeddedAssignments(unescaped, local);
    parseJsonParseCalls(script, local);
    parseJsonParseCalls(unescaped, local);
    for (const value of local) add(value);
  }

  const bodyAssignments = [];
  parseEmbeddedAssignments(decoded, bodyAssignments);
  parseEmbeddedAssignments(decodeJsEscapes(decoded), bodyAssignments);
  parseJsonParseCalls(decoded, bodyAssignments);
  for (const value of bodyAssignments) add(value);
  return out;
}

function getPath(object, path) {
  let current = object;
  for (const part of String(path).split('.')) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

function firstValue(object, keys) {
  for (const key of keys) {
    const value = key.includes('.') ? getPath(object, key) : object?.[key];
    if (value !== undefined && value !== null && text(value) !== '') return value;
  }
  return null;
}

function valuesDeep(root, maxNodes = 75000) {
  const arrays = [];
  const stack = [root];
  const seen = new Set();
  let visited = 0;
  while (stack.length && visited < maxNodes) {
    const node = stack.pop();
    visited += 1;
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node)) {
      arrays.push(node);
      for (const value of node) if (value && typeof value === 'object') stack.push(value);
    } else {
      for (const value of Object.values(node)) if (value && typeof value === 'object') stack.push(value);
    }
  }
  return arrays;
}

function sampleObjectKeys(root) {
  const found = [];
  const stack = [root];
  const seen = new Set();
  while (stack.length && found.length < 4) {
    const node = stack.shift();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    if (!Array.isArray(node)) {
      const keys = Object.keys(node).slice(0, 24);
      if (keys.length) found.push(keys.join(','));
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') stack.push(value);
      if (stack.length > 500) break;
    }
  }
  return found;
}

function updateDiagnostic(target, response, candidates, extra = {}) {
  let parsedUrl = null;
  try { parsedUrl = new URL(response?.url || ''); } catch {}
  target.diagnostic = {
    ...emptyDiagnostic(),
    http_status: response?.status ?? null,
    content_type: response?.contentType || null,
    final_host: parsedUrl?.hostname || null,
    final_path: parsedUrl?.pathname || null,
    body_bytes: Buffer.byteLength(String(response?.body || '')),
    response_kind: classifyBody(response?.body, response?.contentType),
    json_candidates: candidates?.length || 0,
    top_level_keys: candidates?.[0] && !Array.isArray(candidates[0]) ? Object.keys(candidates[0]).slice(0, 30) : [],
    sample_object_keys: candidates?.[0] ? sampleObjectKeys(candidates[0]) : [],
    ...extra,
  };
}

function epochMs(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number' || /^\d+$/.test(text(value))) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return n < 1e12 ? n * 1000 : n;
  }
  return safeDate(value)?.getTime() || 0;
}

function teamName(value) {
  if (!value) return '';
  if (typeof value === 'string' || typeof value === 'number') return text(value);
  return text(firstValue(value, [
    'name', 'team_name', 'teamName', 'display_name', 'displayName',
    'competitorName', 'participantName', 'shortName',
  ]));
}

function splitEventName(value) {
  const raw = text(value);
  if (!raw) return { home: '', away: '' };
  const parts = raw.split(/\s+(?:vs\.?|v\.?|–|—|-|:)\s+/i).map(text).filter(Boolean);
  return parts.length === 2 ? { home: parts[0], away: parts[1] } : { home: '', away: '' };
}

function extractTeams(row) {
  let home = teamName(firstValue(row, [
    'home_team', 'homeTeam', 'home', 'team_home', 'teamHome',
    'homeTeamName', 'home_team_name', 'homeName', 'homeCompetitor',
    'homeParticipant', 'team1', 'participant1',
  ]));
  let away = teamName(firstValue(row, [
    'away_team', 'awayTeam', 'away', 'team_away', 'teamAway',
    'awayTeamName', 'away_team_name', 'awayName', 'awayCompetitor',
    'awayParticipant', 'team2', 'participant2',
  ]));

  const competitors = [
    row?.competitors,
    row?.teams,
    row?.participants,
    row?.competitorList,
    row?.participantList,
  ].find(Array.isArray);

  if ((!home || !away) && competitors) {
    for (const team of competitors) {
      const qualifier = canonical(firstValue(team, ['qualifier', 'side', 'type', 'position', 'role', 'homeAway']));
      if (!home && /^(home|1|team 1)$/.test(qualifier)) home = teamName(team);
      if (!away && /^(away|2|team 2)$/.test(qualifier)) away = teamName(team);
    }
    if (!home) home = teamName(competitors[0]);
    if (!away) away = teamName(competitors[1]);
  }

  if (!home || !away) {
    const split = splitEventName(firstValue(row, ['eventName', 'matchName', 'fixtureName', 'displayName', 'name']));
    home ||= split.home;
    away ||= split.away;
  }

  return { home, away };
}

function outcomePrice(outcome) {
  return number(firstValue(outcome, [
    'odds', 'odd', 'price', 'decimal_odds', 'decimalOdds', 'decimalPrice',
    'value', 'currentOdds', 'currentOdd',
  ])) || null;
}

function marketArrays(row) {
  const out = [];
  for (const key of [
    'markets', 'market', 'betOffers', 'bet_offers', 'mainMarkets',
    'displayMarkets', 'marketList', 'betMarkets', 'marketGroups',
  ]) {
    const value = row?.[key];
    if (Array.isArray(value)) out.push(...value);
  }
  return out;
}

function outcomeArrays(market) {
  for (const key of ['outcomes', 'selections', 'options', 'values', 'choices', 'outcomeList', 'selectionList']) {
    if (Array.isArray(market?.[key])) return market[key];
  }
  return [];
}

function classifyOutcome(outcome, index, outcomeCount) {
  const rawLabel = firstValue(outcome, [
    'description', 'desc', 'name', 'label', 'outcome_name', 'outcomeName',
    'selectionName', 'value', 'shortName',
  ]);
  const label = canonical(rawLabel);
  const rawId = text(firstValue(outcome, ['id', 'outcome_id', 'outcomeId', 'selectionId', 'key']));
  const id = canonical(rawId);

  if (['home', 'home win', '1', '1x2 home', 'team 1'].includes(label) || rawId === '1' || id.endsWith(' home')) return 'home';
  if (['draw', 'x', 'tie', '1x2 draw'].includes(label) || rawId === '2' || id.endsWith(' draw')) return 'draw';
  if (['away', 'away win', '2', '1x2 away', 'team 2'].includes(label) || rawId === '3' || id.endsWith(' away')) return 'away';

  if (outcomeCount === 3) return ['home', 'draw', 'away'][index] || null;
  return null;
}

function extract1x2(row) {
  const prices = { home: null, draw: null, away: null };
  for (const market of marketArrays(row)) {
    const id = text(firstValue(market, ['market_id', 'marketId', 'id', 'specifier', 'templateId']));
    const name = canonical(firstValue(market, ['name', 'desc', 'description', 'market_name', 'marketName', 'title']));
    const outcomes = outcomeArrays(market);
    const looksLike1x2 = id === '1' || /(^|\s)(1x2|match result|full time result|3 way|winner)(\s|$)/.test(name)
      || (outcomes.length === 3 && outcomes.some((item) => ['1', '2', '3'].includes(text(item?.id))));
    if (!looksLike1x2) continue;
    outcomes.forEach((outcome, index) => {
      const price = outcomePrice(outcome);
      const slot = classifyOutcome(outcome, index, outcomes.length);
      if (price && slot && !prices[slot]) prices[slot] = price;
    });
    if (prices.home || prices.draw || prices.away) break;
  }

  prices.home ||= number(firstValue(row, ['oddsHome', 'home_odds', 'homeOdds', 'homeOdd', 'odds1'])) || null;
  prices.draw ||= number(firstValue(row, ['oddsDraw', 'draw_odds', 'drawOdds', 'drawOdd', 'oddsX'])) || null;
  prices.away ||= number(firstValue(row, ['oddsAway', 'away_odds', 'awayOdds', 'awayOdd', 'odds2'])) || null;
  return prices;
}

function eventCandidate(row, context = {}) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const teams = extractTeams(row);
  if (!teams.home || !teams.away) return null;

  const start = epochMs(firstValue(row, [
    'start_time', 'startTime', 'kickoff', 'kick_off', 'scheduled', 'scheduled_at',
    'event_time', 'eventTime', 'date', 'estimateStartTime', 'estimatedStartTime',
    'scheduledStartTime', 'scheduledStart', 'eventStartTime', 'startTimestamp', 'timestamp',
  ]));
  const odds = extract1x2(row);
  const rawId = firstValue(row, [
    'event_id', 'eventId', 'game_id', 'gameId', 'id', 'fixture_id', 'fixtureId',
    'matchId', 'match_id', 'sportEventId',
  ]);
  const league = text(firstValue(row, [
    'league', 'tournament_name', 'tournamentName', 'competition', 'category_name',
    'categoryName', 'tournament.name', 'competition.name', 'league.name',
  ])) || text(context.league) || 'Football';
  const country = text(firstValue(row, [
    'country', 'country_name', 'countryName', 'category', 'category.name',
  ])) || text(context.country) || null;
  const id = text(rawId) || hashKey(`${teams.home}|${teams.away}|${start}`);

  return {
    event_id: `sportybet:${id}`,
    game_id: text(firstValue(row, ['game_id', 'gameId'])) || id,
    provider_fixture_id: id,
    league,
    country,
    league_id: firstValue(row, ['tournament_id', 'tournamentId', 'league_id', 'leagueId', 'tournament.id']) || null,
    home_team: teams.home,
    away_team: teams.away,
    home_team_id: firstValue(row, ['home_team_id', 'homeTeamId', 'home.id', 'homeTeam.id']) || null,
    away_team_id: firstValue(row, ['away_team_id', 'awayTeamId', 'away.id', 'awayTeam.id']) || null,
    start_time: start,
    kickoff: start ? new Date(start).toISOString() : null,
    match_status: text(firstValue(row, [
      'match_status', 'matchStatus', 'status', 'state', 'eventStatus', 'eventStatusDesc',
      'statusDescription',
    ])) || 'Not start',
    oddsHome: odds.home,
    oddsDraw: odds.draw,
    oddsAway: odds.away,
    market_id: '1',
    odds_source: 'sportybet-public',
    source: 'sportybet-public',
    search_query: `${teams.home} vs ${teams.away}`,
  };
}

function listFrom(candidate, keys) {
  for (const key of keys) {
    const value = firstValue(candidate, [key]);
    if (Array.isArray(value)) return value;
  }
  return [];
}

function collectEventsFromObject(root) {
  const output = [];
  const seen = new Set();
  const roots = [root, root?.data, root?.payload, root?.result, root?.response].filter(Boolean);
  const tournamentKeys = [
    'tournaments', 'tournamentList', 'tournament_list', 'categories', 'categoryList',
    'competitions', 'competitionList', 'data.tournaments', 'data.tournamentList',
  ];

  const add = (raw, context = {}) => {
    const row = eventCandidate(raw, context);
    if (row && !seen.has(row.event_id)) {
      seen.add(row.event_id);
      output.push(row);
    }
  };

  for (const candidate of roots) {
    const directEvents = listFrom(candidate, ['events', 'eventList', 'matches', 'fixtures', 'items', 'data.events']);
    for (const raw of directEvents) add(raw);

    for (const key of tournamentKeys) {
      const tournaments = listFrom(candidate, [key]);
      for (const tournament of tournaments) {
        const context = {
          league: firstValue(tournament, ['tournament_name', 'tournamentName', 'name', 'category', 'leagueName']),
          country: firstValue(tournament, ['country', 'country_name', 'countryName', 'categoryName', 'category.name']),
        };
        const events = listFrom(tournament, ['events', 'eventList', 'matches', 'fixtures', 'items']);
        for (const raw of events) add(raw, context);
      }
    }
  }

  for (const array of valuesDeep(root)) {
    for (const raw of array) add(raw);
  }
  return output;
}

function tipCandidate(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const fixture = text(firstValue(raw, ['fixture', 'event', 'match', 'event_name', 'eventName', 'name'])) || (() => {
    const teams = extractTeams(raw);
    return teams.home && teams.away ? `${teams.home} vs ${teams.away}` : '';
  })();
  const market = text(firstValue(raw, ['market', 'market_name', 'marketName', 'bet_type', 'betType', 'group', 'description', 'desc']));
  const pick = text(firstValue(raw, ['pick', 'selection', 'outcome', 'tip', 'choice', 'selection_name', 'selectionName']));
  if (!fixture || !market || !pick) return null;
  const kickoff = epochMs(firstValue(raw, ['kickoff', 'start_time', 'startTime', 'event_time', 'eventTime', 'date', 'estimateStartTime']));
  return {
    fixture,
    market,
    pick,
    odds: number(firstValue(raw, ['odds', 'odd', 'price', 'selection_odds', 'selectionOdds'])) || null,
    league: text(firstValue(raw, ['league', 'competition', 'tournament', 'category', 'tournamentName'])) || null,
    kickoff: kickoff ? new Date(kickoff).toISOString() : null,
    result: text(firstValue(raw, ['result', 'status', 'settlement'])) || 'unavailable',
  };
}

function codeCandidate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const code = text(firstValue(raw, [
    'code', 'booking_code', 'bookingCode', 'bet_code', 'betCode', 'coupon_code',
    'couponCode', 'share_code', 'shareCode',
  ])).toUpperCase();
  if (!/^[A-Z0-9]{4,20}$/.test(code)) return null;
  let rawTips = [];
  for (const key of ['selections_detail', 'selection_details', 'tips', 'legs', 'selections', 'outcomes', 'bets']) {
    if (Array.isArray(raw?.[key])) { rawTips = raw[key]; break; }
  }
  const tips = rawTips.map(tipCandidate).filter(Boolean);
  const created = safeDate(firstValue(raw, ['created_at', 'createdAt', 'scraped_at', 'scrapedAt', 'published_at', 'publishedAt']))?.toISOString()
    || new Date().toISOString();
  return {
    id: text(raw.id) || hashKey(code),
    code,
    title: text(firstValue(raw, ['title', 'headline', 'name', 'description'])) || 'Public SportyBet code',
    odds: number(firstValue(raw, ['total_odds', 'totalOdds', 'odds', 'totalOdd'])) || null,
    selections: number(firstValue(raw, ['selections_count', 'selectionCount', 'selectionsCount', 'betCount'])) || tips.length,
    author: text(firstValue(raw, ['author', 'tipster', 'creator', 'source_name', 'sourceName'])) || 'SportyBet Code Hub',
    tag: text(firstValue(raw, ['category', 'tag', 'market'])) || 'Code Hub',
    status: 'upcoming',
    result: firstValue(raw, ['result', 'settlement']) || null,
    created_at: created,
    expires_at: safeDate(firstValue(raw, ['expires_at', 'expiresAt', 'valid_until', 'validUntil']))?.toISOString() || null,
    source_url: /^https:\/\//i.test(text(firstValue(raw, ['source_url', 'sourceUrl', 'url', 'public_url', 'publicUrl'])))
      ? text(firstValue(raw, ['source_url', 'sourceUrl', 'url', 'public_url', 'publicUrl']))
      : `https://www.sportybet.com/${cleanCountry()}/m/code-hub/codes`,
    tips,
  };
}


function numericNear(context, patterns, { min = 0, max = Number.MAX_SAFE_INTEGER, anchor = 0 } = {}) {
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const pattern of patterns) {
    const flags = [...new Set(`${pattern.flags || ''}g`.split(''))].join('');
    const re = new RegExp(pattern.source, flags);
    for (const match of context.matchAll(re)) {
      const value = number(match?.[1]);
      if (!Number.isFinite(value) || value < min || value > max) continue;
      const distance = Math.abs((match.index || 0) - anchor);
      if (distance < bestDistance) { best = value; bestDistance = distance; }
    }
  }
  return best;
}

function collectCodesFromHtml(body) {
  const raw = decodeHtml(String(body || ''));
  const sources = [raw, decodeJsEscapes(raw)];
  const found = new Map();
  const add = (code, index, source, method) => {
    const clean = text(code).toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(clean)) return;
    const from = Math.max(0, index - 450);
    const to = Math.min(source.length, index + 700);
    const context = source.slice(from, to);
    const odds = numericNear(context, [
      /(?:total[_\s-]*odds?|totalOdd|totalOdds)[^0-9]{0,70}([0-9]+(?:\.[0-9]+)?)/i,
      /([0-9]+(?:\.[0-9]+)?)\s*(?:total\s*)?odds\b/i,
    ], { min: 1.01, max: 10000000, anchor: index - from });
    const selections = numericNear(context, [
      /(?:selections?[_\s-]*count|selectionCount|selectionsCount|betCount)[^0-9]{0,60}(\d{1,3})/i,
      /(\d{1,3})\s*(?:selections?|picks?|events?|legs?)\b/i,
    ], { min: 1, max: 250, anchor: index - from });
    const existing = found.get(clean);
    const candidate = {
      id: hashKey(clean),
      code: clean,
      title: 'Free public SportyBet code',
      odds,
      selections: selections || 0,
      author: 'SportyBet Code Hub',
      tag: 'Code Hub',
      status: 'upcoming',
      result: null,
      created_at: new Date().toISOString(),
      expires_at: null,
      source_url: `https://www.sportybet.com/${cleanCountry()}/m/code-hub/codes`,
      tips: [],
      extraction_method: method,
    };
    if (!existing || (!existing.odds && candidate.odds) || (!existing.selections && candidate.selections)) {
      found.set(clean, { ...existing, ...candidate, odds: candidate.odds || existing?.odds || null, selections: candidate.selections || existing?.selections || 0 });
    }
  };

  const patterns = [
    { method: 'data-attribute', re: /data-(?:booking-|bet-|coupon-|share-)?code\s*=\s*["']([A-Z0-9]{6})["']/gi },
    { method: 'json-key', re: /(?:bookingCode|booking_code|betCode|bet_code|couponCode|coupon_code|shareCode|share_code)\s*["']?\s*[:=]\s*["']([A-Z0-9]{6})["']/gi },
    { method: 'visible-label', re: /\b(?:booking|bet|coupon|share)\s*code\b[^A-Z0-9]{0,50}([A-Z0-9]{6})\b/gi },
  ];
  for (const source of sources) {
    for (const { method, re } of patterns) {
      for (const match of source.matchAll(re)) add(match[1], match.index || 0, source, method);
    }
  }
  return [...found.values()];
}

function collectCodesFromObject(root) {
  const output = [];
  const seen = new Set();
  for (const array of valuesDeep(root)) {
    for (const raw of array) {
      const row = codeCandidate(raw);
      if (row && !seen.has(row.code)) {
        seen.add(row.code);
        output.push(row);
      }
    }
  }
  const rootCode = codeCandidate(root);
  if (rootCode && !seen.has(rootCode.code)) output.push(rootCode);
  return output;
}

async function expandCode(item, template) {
  if (!template || item.tips.length) return item;
  const url = renderTemplate(template, { country: cleanCountry(), code: item.code });
  const response = await fetchPublic(url, { timeoutMs: number(env('UPSTREAM_TIMEOUT_MS', '16000')) || 16000 });
  const candidates = jsonCandidates(response.body, response.contentType);
  for (const candidate of candidates) {
    const direct = codeCandidate(candidate);
    if (direct?.tips?.length) return { ...item, ...direct, code: item.code, title: item.title || direct.title };
    const codes = collectCodesFromObject(candidate);
    const matching = codes.find((row) => row.code === item.code && row.tips.length);
    if (matching) return { ...item, ...matching };
  }
  return item;
}

export function getSportyBetPublicStatus() {
  return JSON.parse(JSON.stringify(status));
}

export function sportyBetPublicConfigured() {
  return collectorEnabled() && Boolean(
    configuredUrl('SPORTYBET_PUBLIC_EVENTS_URL', DEFAULT_EVENTS_URL).value
    || configuredUrl('SPORTYBET_PUBLIC_CODEHUB_URL', DEFAULT_CODEHUB_URL).value,
  );
}

export async function collectSportyBetEvents({ days = 3, maxPages } = {}) {
  if (!collectorEnabled()) return [];
  const country = cleanCountry();
  const configured = configuredUrl('SPORTYBET_PUBLIC_EVENTS_URL', DEFAULT_EVENTS_URL);
  status.events.configured = Boolean(configured.value);
  status.events.url_source = configured.source;
  status.events.last_attempt_at = new Date().toISOString();
  status.events.diagnostic = emptyDiagnostic();

  const pages = Math.max(1, Math.min(10, number(maxPages || env('SPORTYBET_MAX_PAGES', '3')) || 3));
  const output = [];
  const seen = new Set();
  let lastResponse = null;
  let lastCandidates = [];

  try {
    for (let page = 1; page <= pages; page += 1) {
      const url = renderTemplate(configured.value, { country, page, days });
      const response = await fetchPublic(url, { timeoutMs: number(env('UPSTREAM_TIMEOUT_MS', '16000')) || 16000 });
      const candidates = jsonCandidates(response.body, response.contentType);
      lastResponse = response;
      lastCandidates = candidates;
      updateDiagnostic(status.events, response, candidates, {
        pages_attempted: page,
        parsed_before_filter: output.length,
      });

      if (!candidates.length) {
        const kind = classifyBody(response.body, response.contentType);
        if (kind === 'html') throw new Error('SportyBet returned HTML instead of the public JSON feed');
        if (kind === 'empty') throw new Error('SportyBet returned an empty response');
        throw new Error('SportyBet returned a response that was not readable JSON');
      }

      let batch = [];
      for (const candidate of candidates) batch.push(...collectEventsFromObject(candidate));
      for (const row of batch) {
        if (!seen.has(row.event_id)) {
          seen.add(row.event_id);
          output.push(row);
        }
      }

      updateDiagnostic(status.events, response, candidates, {
        pages_attempted: page,
        parsed_before_filter: output.length,
      });

      if (!batch.length) {
        const keys = status.events.diagnostic.sample_object_keys.slice(0, 2).join(' | ');
        throw new Error(`SportyBet JSON schema was not recognized${keys ? ` (${keys})` : ''}`);
      }
      if (batch.length < 50) break;
    }

    const now = Date.now() - 6 * 3600000;
    const end = Date.now() + Math.max(1, number(days) || 3) * 86400000 + 86400000;
    const filtered = output
      .filter((row) => !row.start_time || (row.start_time >= now && row.start_time <= end))
      .sort((a, b) => (a.start_time || 0) - (b.start_time || 0));

    updateDiagnostic(status.events, lastResponse, lastCandidates, {
      pages_attempted: status.events.diagnostic.pages_attempted,
      parsed_before_filter: output.length,
      filtered_out: Math.max(0, output.length - filtered.length),
    });
    status.events.last_success_at = new Date().toISOString();
    status.events.last_error = null;
    status.events.count = filtered.length;
    return filtered;
  } catch (error) {
    status.events.last_error = publicError(error);
    status.events.count = 0;
    throw error;
  }
}

export async function collectSportyBetCodes({ limit = 24 } = {}) {
  if (!collectorEnabled()) return [];
  const country = cleanCountry();
  const configured = configuredUrl('SPORTYBET_PUBLIC_CODEHUB_URL', DEFAULT_CODEHUB_URL);
  status.codes.configured = Boolean(configured.value);
  status.codes.url_source = configured.source;
  status.codes.last_attempt_at = new Date().toISOString();
  status.codes.diagnostic = emptyDiagnostic();

  try {
    const url = renderTemplate(configured.value, { country, page: 1, limit });
    const response = await fetchPublic(url, { timeoutMs: number(env('UPSTREAM_TIMEOUT_MS', '16000')) || 16000 });
    const candidates = jsonCandidates(response.body, response.contentType);
    const htmlItems = collectCodesFromHtml(response.body);
    const extractionMethods = new Set();
    if (candidates.length) extractionMethods.add('embedded-json');
    for (const item of htmlItems) extractionMethods.add(item.extraction_method || 'html');
    updateDiagnostic(status.codes, response, candidates, {
      pages_attempted: 1,
      html_codes_found: htmlItems.length,
      extraction_methods: [...extractionMethods],
      script_tags_found: [...String(response.body || '').matchAll(/<script\b/gi)].length,
    });

    let items = [];
    for (const candidate of candidates) items.push(...collectCodesFromObject(candidate));
    items.push(...htmlItems);
    const map = new Map();
    for (const item of items) {
      if (!map.has(item.code)) map.set(item.code, item);
      else {
        const existing = map.get(item.code);
        map.set(item.code, {
          ...existing,
          ...item,
          odds: item.odds || existing.odds || null,
          selections: item.selections || existing.selections || item.tips?.length || existing.tips?.length || 0,
          tips: item.tips?.length ? item.tips : existing.tips || [],
        });
      }
    }
    items = [...map.values()].slice(0, Math.max(1, Math.min(100, number(limit) || 24)));

    const template = text(env('SPORTYBET_PUBLIC_BOOKING_URL_TEMPLATE'));
    const expansionLimit = Math.max(0, Math.min(20, number(env('SPORTYBET_CODE_EXPANSION_LIMIT', '6')) || 6));
    if (template && items.length) {
      for (let i = 0; i < Math.min(items.length, expansionLimit); i += 1) {
        try { items[i] = await expandCode(items[i], template); } catch {}
      }
    }

    status.codes.diagnostic.parsed_before_filter = items.length;
    if (!items.length) {
      const kind = classifyBody(response.body, response.contentType);
      if (kind === 'html') {
        throw new Error('SportyBet Code Hub loaded, but no public booking codes were embedded in the server HTML or page state');
      }
      if (!candidates.length) throw new Error('SportyBet Code Hub returned no readable JSON or HTML code data');
      throw new Error('SportyBet Code Hub data was readable, but its booking-code schema was not recognized');
    }

    status.codes.last_success_at = new Date().toISOString();
    status.codes.last_error = null;
    status.codes.count = items.length;
    return items;
  } catch (error) {
    status.codes.last_error = publicError(error);
    status.codes.count = 0;
    throw error;
  }
}

export const __test = {
  jsonCandidates,
  collectEventsFromObject,
  collectCodesFromObject,
  collectCodesFromHtml,
  eventCandidate,
  codeCandidate,
  renderTemplate,
  extractTeams,
  extract1x2,
};
