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
 */
function createFdProvider({ apiKey, fetchFn } = {}) {
  if (!apiKey) {
    throw new Error('football-data.org provider requires an API key');
  }
  if (typeof fetchFn !== 'function') {
    throw new Error('fetchFn is required');
  }

  async function fetchSchedule(leagueCode, dateFrom, dateTo) {
    const url = `${FD_BASE}/competitions/${encodeURIComponent(leagueCode)}/matches` +
      `?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`;
    let res;
    try {
      res = await fetchFn(url, { headers: { 'X-Auth-Token': apiKey } });
    } catch (err) {
      err.message = `football-data.org network error for ${leagueCode}: ${err.message}`;
      throw err;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`football-data.org ${leagueCode} failed with HTTP ${res.status}: ${body.message || ''}`);
    }
    const data = await res.json();
    return (data.matches || []).map(normalizeFixture).filter(Boolean);
  }

  return { name: 'football-data.org', fetchSchedule };
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
