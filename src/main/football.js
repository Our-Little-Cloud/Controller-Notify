/**
 * Football data providers for Controller Notify.
 * Adapter seam (plan §2.1): football-data.org v4 as primary provider,
 * ESPN public scoreboard API as optional keyless "Live Boost" provider.
 */

const { normalizeFixture } = require('./footballManager');

const FD_BASE = 'https://api.football-data.org/v4';
const ESPN_BASE = 'https://site.web.api.espn.com/apis/site/v2/sports/soccer';

// Single registry: fd.org competition code is canonical, ESPN slug travels with it.
const LEAGUES = [
  { code: 'PL', name: 'Premier League', espnSlug: 'eng.1' },
  { code: 'PD', name: 'La Liga', espnSlug: 'esp.1' },
  { code: 'SA', name: 'Serie A', espnSlug: 'ita.1' },
  { code: 'BL1', name: 'Bundesliga', espnSlug: 'ger.1' },
  { code: 'FL1', name: 'Ligue 1', espnSlug: 'fra.1' },
  { code: 'CL', name: 'Champions League', espnSlug: 'uefa.champions' },
  { code: 'WC', name: 'World Cup', espnSlug: 'fifa.world' },
  { code: 'EC', name: 'European Championship', espnSlug: 'uefa.euro' },
  { code: 'ELC', name: 'Championship', espnSlug: 'eng.2' },
  { code: 'DED', name: 'Eredivisie', espnSlug: 'ned.1' },
  { code: 'PPL', name: 'Primeira Liga', espnSlug: 'por.1' },
  { code: 'BSA', name: 'Brasileirão Série A', espnSlug: 'bra.1' }
];

/**
 * ESPN-only cup competitions for the big-5 European countries (Phase 1):
 * these have no fd.org free-tier competition, so their fixtures come purely
 * from ESPN scoreboards. Slugs verified live 2026-08-22.
 */
const EXTRA_LEAGUES = [
  { code: 'ENG-FA', name: 'FA Cup', espnSlug: 'eng.fa', source: 'espn' },
  { code: 'ENG-LC', name: 'Carabao Cup', espnSlug: 'eng.league_cup', source: 'espn' },
  { code: 'ESP-CDR', name: 'Copa del Rey', espnSlug: 'esp.copa_del_rey', source: 'espn' },
  { code: 'ITA-CI', name: 'Coppa Italia', espnSlug: 'ita.coppa_italia', source: 'espn' },
  { code: 'GER-PK', name: 'DFB-Pokal', espnSlug: 'ger.dfb_pokal', source: 'espn' },
  { code: 'GER-SC', name: 'DFL-Supercup', espnSlug: 'ger.super_cup', source: 'espn' },
  { code: 'FRA-TC', name: 'Trophée des Champions', espnSlug: 'fra.super_cup', source: 'espn' }
];

function espnSlugFor(code) {
  const league = [...LEAGUES, ...EXTRA_LEAGUES].find(l => l.code === code);
  return league ? league.espnSlug : null;
}

function codeForEspnSlug(slug) {
  if (!slug) return '';
  const league = [...LEAGUES, ...EXTRA_LEAGUES].find(l => l.espnSlug === slug);
  return league ? league.code : '';
}

function getTeamCrest(teamObj) {
  if (!teamObj) return '';
  if (teamObj.logo) return teamObj.logo;
  if (Array.isArray(teamObj.logos) && teamObj.logos.length > 0 && teamObj.logos[0].href) {
    return teamObj.logos[0].href;
  }
  return '';
}

/**
 * @deprecated football-data.org provider — no longer wired in production
 * (main.js uses ESPN as the sole source). Kept for potential future use.
 *
 * Primary provider — football-data.org v4.
 * Throttling follows the documented policy (docs.football-data.org/general/v4/policies.html):
 * free plan = 10 requests/minute. We combine a polite fixed pacing gap with
 * ADAPTIVE gating driven by the official response headers (docs.football-data.org
 * /general/v4/lookup_tables.html): X-RequestsAvailable (remaining requests) and
 * X-RequestCounter-Reset (seconds left to reset the counter), and honor the
 * reset window on 429 responses.
 */
function createFdProvider({
  apiKey,
  fetchFn,
  sleepFn = (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  minRequestGapMs = 7000,
  minRequestsAvailable = 2,
  maxRetries = 1
} = {}) {
  if (!apiKey) {
    throw new Error('football-data.org provider requires an API key');
  }
  if (typeof fetchFn !== 'function') {
    throw new Error('fetchFn is required');
  }

  let lastRequestAt = 0;
  let lastAvailable = null;
  let lastResetSeconds = null;

  function readHeader(headers, name) {
    if (!headers || typeof headers.get !== 'function') return null;
    const raw = headers.get(name);
    if (raw == null) return null;
    const parsed = parseInt(raw, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  function updateFromHeaders(headers) {
    const available = readHeader(headers, 'x-requestsavailable');
    const reset = readHeader(headers, 'x-requestcounter-reset');
    if (available != null) lastAvailable = available;
    if (reset != null) lastResetSeconds = reset;
    return { available: lastAvailable, reset: lastResetSeconds };
  }

  async function throttleGate() {
    // 1) Polite fixed pacing between consecutive requests
    const sinceLast = Date.now() - lastRequestAt;
    if (lastRequestAt > 0 && sinceLast < minRequestGapMs) {
      await sleepFn(minRequestGapMs - sinceLast);
    }
    // 2) Adaptive wait: remaining requests at/below the safety floor ->
    //    sleep out the documented reset window before touching the API again
    if (lastAvailable != null && lastAvailable <= minRequestsAvailable && lastResetSeconds != null) {
      await sleepFn((lastResetSeconds + 1) * 1000);
      lastAvailable = null; // consumed; unknown until the next response
    }
    lastRequestAt = Date.now();
  }

  async function requestOnce(url, opts) {
    await throttleGate();
    let res;
    try {
      res = await fetchFn(url, opts);
    } catch (err) {
      err.message = `football-data.org network error for ${url}: ${err.message}`;
      throw err;
    }
    updateFromHeaders(res && res.headers);
    return res;
  }

  async function apiGet(url) {
    let res = await requestOnce(url, { headers: { 'X-Auth-Token': apiKey } });

    // Honor the reset window on throttling responses, then retry once
    if (!res.ok && res.status === 429 && maxRetries > 0) {
      const reset = readHeader(res && res.headers, 'x-requestcounter-reset');
      await sleepFn(((reset != null ? reset : 60) + 1) * 1000);
      res = await requestOnce(url, optsHeaders());
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`football-data.org request failed with HTTP ${res.status}: ${body.message || ''} (${url})`);
    }
    return res.json();
  }

  function optsHeaders() {
    return { headers: { 'X-Auth-Token': apiKey } };
  }

  async function fetchSchedule(leagueCode, dateFrom, dateTo) {
    const url = `${FD_BASE}/competitions/${encodeURIComponent(leagueCode)}/matches` +
      `?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`;
    const data = await apiGet(url);
    return (data.matches || []).map(normalizeFixture).filter(Boolean);
  }

  /**
   * All fixtures of a specific team across ALL its competitions (league,
   * cups, Europe) within the date window — used so Favorite Teams surface
   * matches even outside the enabled league filters.
   */
  async function fetchTeamFixtures(teamId, dateFrom, dateTo) {
    const url = `${FD_BASE}/teams/${encodeURIComponent(teamId)}/matches` +
      `?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`;
    const data = await apiGet(url);
    return (data.matches || []).map(normalizeFixture).filter(Boolean);
  }

  function getThrottleState() {
    return { lastAvailable, lastResetSeconds };
  }

  return { name: 'football-data.org', fetchSchedule, fetchTeamFixtures, getThrottleState };
}

function espnStatusFromState(state) {
  if (state === 'post') return 'finished';
  if (state === 'in') return 'live';
  return 'scheduled';
}

function formatEspnMinute(status) {
  if (!status) return null;
  const type = status.type || {};
  if (type.state !== 'in') return null;
  const short = type.shortDetail ? String(type.shortDetail).trim() : '';
  if (short && (short.includes("'") || short === 'HT' || short === 'HALFTIME')) {
    return short;
  }
  const clock = status.displayClock;
  if (clock != null && clock !== '') {
    const clkStr = String(clock).trim();
    if (clkStr === '0' || clkStr === '0.0') return "1'";
    return clkStr.includes("'") ? clkStr : `${clkStr}'`;
  }
  return short || 'LIVE';
}

/**
 * Live Boost provider — ESPN public scoreboard (keyless, unofficial).
 */
function createEspnProvider({ baseUrl = ESPN_BASE, fetchFn, onError = () => {} } = {}) {
  if (typeof fetchFn !== 'function') {
    throw new Error('fetchFn is required');
  }

  function eventToFixture(event, code, leagueName) {
    const status = event.status || {};
    const statusType = status.type || {};
    const competitions = event.competitions || [];
    const comp = competitions[0] || {};
    const competitors = comp.competitors || [];
    const home = competitors.find(c => c.homeAway === 'home');
    const away = competitors.find(c => c.homeAway === 'away');
    if (!home || !away) return null;
    const resolvedCode = code || (event.league && codeForEspnSlug(event.league.slug)) || '';
    return {
      id: `espn:${event.id}`,
      kickoffUtc: event.date || null,
      status: espnStatusFromState(statusType.state),
      minute: formatEspnMinute(status),
      homeTeam: { id: '', name: home.team && home.team.displayName || '', crest: getTeamCrest(home.team) },
      awayTeam: { id: '', name: away.team && away.team.displayName || '', crest: getTeamCrest(away.team) },
      competition: { code: resolvedCode, name: leagueName || '' },
      score: {
        home: home.score != null ? Number(home.score) : null,
        away: away.score != null ? Number(away.score) : null
      }
    };
  }

  async function fetchJsonOk(url) {
    let res;
    try {
      res = await fetchFn(url);
    } catch (err) {
      throw new Error(`ESPN network error for ${url}: ${err.message}`);
    }
    if (!res.ok) {
      throw new Error(`ESPN request failed with HTTP ${res.status} (${url})`);
    }
    return res.json();
  }

  /**
   * Phase 1: full fixture list for an EXTRA cup competition within a date
   * range (scoreboard supports YYYYMMDD-YYYYMMDD ranges).
   */
  async function fetchFixtures(code, dateFrom, dateTo) {
    const slug = espnSlugFor(code);
    if (!slug) return [];
    const compact = (d) => String(d).replace(/-/g, '');
    const url = `${baseUrl}/${slug}/scoreboard?dates=${compact(dateFrom)}-${compact(dateTo)}`;
    const data = await fetchJsonOk(url);
    const leagueName = (data.leagues && data.leagues[0] && data.leagues[0].name) || '';
    return (data.events || [])
      .map(e => eventToFixture(e, code, leagueName))
      .filter(Boolean);
  }

  /**
   * Phase 2: a specific team's fixtures via its own schedule endpoint
   * (?fixture=true unlocks the upcoming-fixture list). Covers ANY competition
   * the team plays — cups, super cups — independent of league filters.
   */
  async function fetchTeamSchedule(slug, teamId) {
    const url = `${baseUrl}/${slug}/teams/${encodeURIComponent(teamId)}/schedule?fixture=true`;
    const data = await fetchJsonOk(url);
    const leagueSlug = (data.league && data.league.slug) || slug;
    const leagueCode = codeForEspnSlug(leagueSlug);
    const leagueName = (data.league && data.league.name) || (data.season && data.season.displayName) || '';
    return (data.events || [])
      .map(e => eventToFixture(e, leagueCode, leagueName))
      .filter(Boolean);
  }

  /**
   * Phase 2: resolve ESPN team ids by listing a league's teams.
   */
  async function fetchTeamDirectory(slug) {
    const url = `${baseUrl}/${slug}/teams`;
    const data = await fetchJsonOk(url);
    const teamsNode = data.sports && data.sports[0] && data.sports[0].leagues &&
      data.sports[0].leagues[0] && data.sports[0].leagues[0].teams || [];
    return teamsNode
      .map(t => t.team)
      .filter(Boolean)
      .map(t => ({ id: String(t.id), name: t.displayName || t.name || '', espnSlug: slug }));
  }

  async function fetchLeagueState(slug, code) {
    const url = `${ESPN_BASE}/${slug}/scoreboard`;
    let res;
    try {
      res = await fetchFn(url);
    } catch (err) {
      onError(err, code);
      return [];
    }
    if (!res.ok) {
      onError(new Error(`ESPN scoreboard HTTP ${res.status}`), code);
      return [];
    }
    const data = await res.json();
    const events = data.events || [];
    const states = [];
    for (const event of events) {
      const statusType = (event.status && event.status.type) || {};
      const competitors = ((event.competitions && event.competitions[0]) || {}).competitors || [];
      const home = competitors.find(c => c.homeAway === 'home');
      const away = competitors.find(c => c.homeAway === 'away');
      if (!home || !away) continue;
      states.push({
        eventId: event.id,
        kickoffUtc: event.date || null,
        competitionCode: code || '',
        homeName: home.team && home.team.displayName || '',
        awayName: away.team && away.team.displayName || '',
        state: statusType.state || 'pre',
        completed: Boolean(statusType.completed),
        minute: (event.status && event.status.displayClock) || null,
        scoreHome: home.score != null ? Number(home.score) : null,
        scoreAway: away.score != null ? Number(away.score) : null
      });
    }
    return states;
  }

  async function fetchLiveState(leagueCodes = []) {
    const all = [];
    for (const code of leagueCodes) {
      const slug = espnSlugFor(code);
      if (!slug) continue;
      all.push(...await fetchLeagueState(slug, code));
    }
    return all;
  }

  return {
    name: 'espn-live-boost',
    fetchLiveState,
    fetchFixtures,
    fetchSchedule: fetchFixtures,
    fetchTeamSchedule,
    fetchTeamDirectory
  };
}

module.exports = { LEAGUES, EXTRA_LEAGUES, createFdProvider, createEspnProvider };
