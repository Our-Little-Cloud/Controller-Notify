/**
 * Football data providers for Controller Notify.
 * Adapter seam (plan §2.1): football-data.org v4 as primary provider,
 * ESPN public scoreboard API as optional keyless "Live Boost" provider.
 */

const { normalizeFixture } = require('./footballManager');

const FD_BASE = 'https://api.football-data.org/v4';
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

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

function espnSlugFor(code) {
  const league = LEAGUES.find(l => l.code === code);
  return league ? league.espnSlug : null;
}

/**
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

/**
 * Live Boost provider — ESPN public scoreboard (keyless, unofficial).
 * Returns flat live-state records; matching to fixtures happens in the monitor
 * via normalized club names (ESPN ids are never stored).
 */
function createEspnProvider({ fetchFn, onError = () => {} } = {}) {
  if (typeof fetchFn !== 'function') {
    throw new Error('fetchFn is required');
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
      const status = (event.status && event.status.type) || {};
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
        state: status.state || 'pre',
        completed: Boolean(status.completed),
        minute: event.status.displayClock || null,
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

  return { name: 'espn-live-boost', fetchLiveState };
}

module.exports = { LEAGUES, createFdProvider, createEspnProvider };
