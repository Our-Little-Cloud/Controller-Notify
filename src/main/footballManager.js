/**
 * Football Manager module for Controller Notify.
 * Pure logic: fixture normalization, favorites/pins CRUD, watched-fixture
 * rules, schedule filtering, and Big Match heuristic (per CONTEXT.md glossary).
 */

const STATUS_MAP = {
  SCHEDULED: 'scheduled',
  TIMED: 'scheduled',
  IN_PLAY: 'live',
  LIVE: 'live',
  PAUSED: 'live',
  EXTRA_TIME: 'live',
  PENALTY_SHOOTOUT: 'live',
  FINISHED: 'finished',
  AWARDED: 'finished',
  POSTPONED: 'scheduled',
  SUSPENDED: 'live'
};

function normalizeTeam(rawTeam) {
  if (!rawTeam) return null;
  return {
    id: rawTeam.id != null ? String(rawTeam.id) : '',
    name: rawTeam.name || rawTeam.shortName || 'Unknown',
    crest: rawTeam.crest || ''
  };
}

/**
 * Normalizes a football-data.org v4 match object to the canonical Fixture shape:
 * { id, kickoffUtc, status, homeTeam:{id,name,crest}, awayTeam:{...},
 *   competition:{code,name}, score:{home,away} }
 */
function normalizeFixture(raw) {
  if (!raw || raw.id == null) return null;
  // Cancelled fixtures are dropped entirely — the glossary status flow is
  // scheduled → live → finished, and a cancelled match is neither.
  if (raw.status === 'CANCELLED') return null;

  const fullTime = (raw.score && raw.score.fullTime) || {};

  return {
    id: String(raw.id),
    kickoffUtc: raw.utcDate || null,
    status: STATUS_MAP[raw.status] || 'scheduled',
    minute: raw.minute != null ? String(raw.minute) : null,
    homeTeam: normalizeTeam(raw.homeTeam) || { id: '', name: 'Unknown', crest: '' },
    awayTeam: normalizeTeam(raw.awayTeam) || { id: '', name: 'Unknown', crest: '' },
    competition: {
      code: (raw.competition && raw.competition.code) || '',
      name: (raw.competition && raw.competition.name) || ''
    },
    score: {
      home: fullTime.home != null ? fullTime.home : null,
      away: fullTime.away != null ? fullTime.away : null
    }
  };
}

/**
 * Normalizes a favorite team to canonical shape:
 * { id, name, crest, competitionCode }
 */
function normalizeFavoriteTeam(raw) {
  if (!raw || (raw.id == null && !raw.name)) return null;
  return {
    id: raw.id != null ? String(raw.id) : '',
    name: raw.name || 'Unknown',
    crest: raw.crest || '',
    competitionCode: raw.competitionCode || ''
  };
}

/**
 * Adds a Favorite Team to the list. Keyless favorites have no provider id,
 * so dedup falls back to normalized club name when id is empty (last write wins).
 */
function addFavoriteTeam(list = [], team) {
  const normalized = normalizeFavoriteTeam(team);
  if (!normalized) {
    throw new Error('Invalid favorite team data: id or name required');
  }
  const next = Array.isArray(list) ? [...list] : [];
  const idx = next.findIndex(t =>
    (normalized.id && t.id === normalized.id) ||
    (!normalized.id && normalizeClubName(t.name) === normalizeClubName(normalized.name))
  );
  if (idx >= 0) {
    next[idx] = normalized;
  } else {
    next.push(normalized);
  }
  return next;
}

/**
 * Removes a Favorite Team by id, or by case-insensitive name for keyless favorites.
 */
function removeFavoriteTeam(list = [], identifier) {
  if (!Array.isArray(list) || !identifier) return Array.isArray(list) ? [...list] : [];
  const idStr = String(identifier);
  const nameKey = normalizeClubName(identifier);
  return list.filter(t =>
    t.id !== idStr && normalizeClubName(t.name) !== nameKey
  );
}

/**
 * Toggles a Pinned Fixture in the list (dedup by fixture id).
 * Throws on invalid fixture data.
 */
function togglePinnedFixture(list = [], fixture) {
  if (!fixture || !fixture.id) {
    throw new Error('Invalid fixture data for pinning');
  }
  const next = Array.isArray(list) ? [...list] : [];
  const idx = next.findIndex(f => f.id === String(fixture.id));
  if (idx >= 0) {
    next.splice(idx, 1);
  } else {
    next.push(normalizeFixture(fixture) || fixture);
  }
  return next;
}

function normalizeClubName(name) {
  return String(name || '').toLowerCase().replace(/\s+fc$|\s+cf$|\s+afc$/, '').trim();
}

/**
 * Watched Fixture rule: a Favorite Team is playing OR the fixture is pinned.
 * Matches favorites by provider team id OR normalized club name so keyless
 * big-clubs favorites work before any API data exists.
 */
function isWatchedFixture(fixture, favoriteTeams = [], pinnedFixtures = []) {
  if (!fixture || !fixture.id) return false;
  if (pinnedFixtures.some(f => f.id === fixture.id)) return true;

  const sideNames = [normalizeClubName(fixture.homeTeam && fixture.homeTeam.name),
    normalizeClubName(fixture.awayTeam && fixture.awayTeam.name)];
  const sideIds = [fixture.homeTeam && fixture.homeTeam.id, fixture.awayTeam && fixture.awayTeam.id];

  return favoriteTeams.some(t => {
    const favId = t.id != null ? String(t.id) : '';
    if (favId && sideIds.includes(favId)) return true;
    const favName = normalizeClubName(t.name);
    return favName !== '' && sideNames.includes(favName);
  });
}

/**
 * Filters a fixture list for the Matches tab: Watched Fixtures always pass
 * (favorites override league filter); everything else must be in the
 * enabled league codes.
 */
function filterScheduleFixtures(fixtures = [], { leagues = [], favoriteTeams = [], pinnedFixtures = [] } = {}) {
  const enabled = new Set(leagues);
  return (Array.isArray(fixtures) ? fixtures : []).filter(f =>
    isWatchedFixture(f, favoriteTeams, pinnedFixtures) || enabled.has(f.competition && f.competition.code)
  );
}

// Big Match heuristic: both clubs in this elite set (normalized names).
// Names instead of provider ids — verifiable without an API key.
const ELITE_CLUBS = [
  'real madrid', 'barcelona', 'atletico madrid', 'sevilla', 'valencia',
  'manchester united', 'manchester city', 'liverpool', 'arsenal', 'chelsea',
  'tottenham hotspur', 'bayern munich', 'borussia dortmund', 'rb leipzig',
  'juventus', 'inter milan', 'inter', 'ac milan', 'milan', 'napoli', 'roma',
  'paris saint-germain', 'psg', 'marseille', 'lyon', 'ajax', 'porto',
  'benfica', 'sporting cp', 'chelsea fc'
].map(normalizeClubName);

const ELITE_SET = new Set(ELITE_CLUBS);

function isBigMatch(fixture) {
  if (!fixture || !fixture.homeTeam || !fixture.awayTeam) return false;
  const home = normalizeClubName(fixture.homeTeam.name);
  const away = normalizeClubName(fixture.awayTeam.name);
  return home !== '' && away !== '' && ELITE_SET.has(home) && ELITE_SET.has(away);
}

// Deterministic hue from club name so a given club always gets the same color.
function monogram(name) {
  const clean = String(name || '').trim();
  if (!clean) return { initials: '?', color: '#888888' };
  const words = clean.split(/\s+/).filter(Boolean);
  const initials = (words.length >= 2
    ? words[0][0] + words[1][0]
    : clean.slice(0, 2)).toUpperCase();
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  }
  const r = 40 + (hash % 180);
  const g = 40 + ((hash >> 3) % 180);
  const b = 40 + ((hash >> 6) % 180);
  return { initials, color: '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('') };
}

const path = require('path');
const fs = require('fs');

const BIG_CLUBS_PATH = path.join(__dirname, 'data', 'big-clubs.json');

/**
 * Loads the bundled big-clubs list for keyless favoriting (plan §2.4).
 * Throws on read/parse failure so callers can surface the error — never swallowed.
 */
function loadBigClubs() {
  const raw = fs.readFileSync(BIG_CLUBS_PATH, 'utf8');
  const clubs = JSON.parse(raw);
  if (!Array.isArray(clubs)) {
    throw new Error('big-clubs.json must contain an array');
  }
  return clubs;
}

/**
 * Case-insensitive substring search over a clubs list, optionally scoped to
 * one competition code. Empty query with no competition returns [] (avoid
 * dumping the whole list in the UI).
 */
function searchBigClubs(clubs = [], query = '', { competitionCode = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q && !competitionCode) return [];
  return clubs.filter(c => {
    if (competitionCode && c.competitionCode !== competitionCode) return false;
    if (!q) return true;
    return c.name.toLowerCase().includes(q);
  });
}

module.exports = {
  normalizeFixture,
  STATUS_MAP,
  addFavoriteTeam,
  removeFavoriteTeam,
  togglePinnedFixture,
  isWatchedFixture,
  filterScheduleFixtures,
  isBigMatch,
  monogram,
  normalizeClubName,
  loadBigClubs,
  searchBigClubs
};
