const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeFixture,
  STATUS_MAP,
  addFavoriteTeam,
  removeFavoriteTeam,
  togglePinnedFixture,
  isWatchedFixture,
  filterScheduleFixtures,
  isBigMatch,
  monogram,
  loadBigClubs,
  searchBigClubs
} = require('../src/main/footballManager');

describe('Football Manager Tests', () => {
  describe('Fixture Normalization', () => {
    it('should normalize a scheduled fd.org fixture (status TIMED)', () => {
      const raw = {
        id: 452312,
        utcDate: '2026-08-22T16:30:00Z',
        status: 'TIMED',
        minute: null,
        homeTeam: { id: 57, name: 'Arsenal', crest: 'https://crests.football-data.org/57.png' },
        awayTeam: { id: 47, name: 'Tottenham Hotspur', crest: 'https://crests.football-data.org/47.png' },
        competition: { code: 'PL', name: 'Premier League', emblem: 'https://crests.football-data.org/PL.png' },
        score: { fullTime: { home: null, away: null } }
      };

      const fx = normalizeFixture(raw);

      assert.equal(fx.id, '452312');
      assert.equal(fx.kickoffUtc, '2026-08-22T16:30:00Z');
      assert.equal(fx.status, 'scheduled');
      assert.equal(fx.homeTeam.name, 'Arsenal');
      assert.equal(fx.awayTeam.name, 'Tottenham Hotspur');
      assert.equal(fx.competition.code, 'PL');
      assert.equal(fx.score.home, null);
      assert.equal(fx.score.away, null);
    });

    it('should map IN_PLAY to live keeping score', () => {
      const raw = {
        id: 452313,
        utcDate: '2026-08-22T18:00:00Z',
        status: 'IN_PLAY',
        minute: '63',
        homeTeam: { id: 64, name: 'Liverpool', crest: '' },
        awayTeam: { id: 65, name: 'Manchester City', crest: '' },
        competition: { code: 'PL', name: 'Premier League' },
        score: { fullTime: { home: 1, away: 2 } }
      };

      const fx = normalizeFixture(raw);
      assert.equal(fx.status, 'live');
      assert.equal(fx.score.home, 1);
      assert.equal(fx.score.away, 2);
    });

    it('should map FINISHED to finished with final score', () => {
      const raw = {
        id: 452314,
        utcDate: '2026-08-21T19:00:00Z',
        status: 'FINISHED',
        minute: '90',
        homeTeam: { id: 529, name: 'Barcelona', crest: '' },
        awayTeam: { id: 541, name: 'Real Madrid', crest: '' },
        competition: { code: 'PD', name: 'Primera Division' },
        score: { fullTime: { home: 3, away: 1 } }
      };

      const fx = normalizeFixture(raw);
      assert.equal(fx.status, 'finished');
      assert.equal(fx.score.home, 3);
      assert.equal(fx.score.away, 1);
    });

    it('should return null for null/empty input or missing id', () => {
      assert.equal(normalizeFixture(null), null);
      assert.equal(normalizeFixture({}), null);
      assert.equal(normalizeFixture({ utcDate: '2026-01-01T00:00:00Z' }), null);
    });

    it('should drop cancelled fixtures entirely (glossary status flow)', () => {
      assert.equal(normalizeFixture({
        id: 1, utcDate: '2026-08-22T16:30:00Z', status: 'CANCELLED',
        homeTeam: { name: 'A' }, awayTeam: { name: 'B' }, competition: {}
      }), null);
    });
  });

  describe('Favorite Team CRUD', () => {
    const arsenal = { id: '57', name: 'Arsenal', crest: 'https://crests.football-data.org/57.png', competitionCode: 'PL' };

    it('should add a favorite team and normalize its shape', () => {
      const list = addFavoriteTeam([], { id: 57, name: 'Arsenal', crest: 'https://crests.football-data.org/57.png', competitionCode: 'PL' });
      assert.equal(list.length, 1);
      assert.equal(list[0].id, '57');
      assert.equal(list[0].name, 'Arsenal');
      assert.equal(list[0].competitionCode, 'PL');
    });

    it('should dedupe by team id when adding twice', () => {
      let list = addFavoriteTeam([], arsenal);
      list = addFavoriteTeam(list, { id: '57', name: 'Arsenal FC', crest: '', competitionCode: 'PL' });
      assert.equal(list.length, 1);
      assert.equal(list[0].name, 'Arsenal FC');
    });

    it('should throw on invalid team data (no id and no name)', () => {
      assert.throws(() => addFavoriteTeam([], {}));
    });

    it('should remove by team id only when id matches', () => {
      const list = addFavoriteTeam([], arsenal);
      const after = removeFavoriteTeam(list, '999');
      assert.equal(after.length, 1);
      const gone = removeFavoriteTeam(list, '57');
      assert.equal(gone.length, 0);
    });

    it('keyless favorites (no id) dedupe and remove by name', () => {
      let list = addFavoriteTeam([], { id: '', name: 'Arsenal', crest: '', competitionCode: 'PL' });
      list = addFavoriteTeam(list, { id: '', name: 'Chelsea', crest: '', competitionCode: 'PL' });
      list = addFavoriteTeam(list, { id: '', name: 'arsenal', crest: '', competitionCode: 'PL' });
      assert.equal(list.length, 2, 'duplicate keyless favorite replaces original');

      list = removeFavoriteTeam(list, 'Arsenal');
      assert.equal(list.length, 1);
      assert.equal(list[0].name, 'Chelsea');
    });
  });

  describe('Pinned Fixture & Watched Fixture rules', () => {
    const fixture = normalizeFixture({
      id: 452312,
      utcDate: '2026-08-22T16:30:00Z',
      status: 'TIMED',
      homeTeam: { id: 57, name: 'Arsenal', crest: '' },
      awayTeam: { id: 47, name: 'Tottenham Hotspur', crest: '' },
      competition: { code: 'PL', name: 'Premier League' },
      score: { fullTime: { home: null, away: null } }
    });

    it('should pin a fixture and dedupe by id (toggle off removes)', () => {
      let pins = togglePinnedFixture([], fixture);
      assert.equal(pins.length, 1);
      assert.equal(pins[0].id, '452312');
      pins = togglePinnedFixture(pins, fixture);
      assert.equal(pins.length, 0);
    });

    it('should throw when pinning invalid data', () => {
      assert.throws(() => togglePinnedFixture([], null));
      assert.throws(() => togglePinnedFixture([], { utcDate: 'x' }));
    });

    it('watched = favorite team playing OR pinned', () => {
      const favorites = [{ id: '57', name: 'Arsenal', crest: '', competitionCode: 'PL' }];
      assert.equal(isWatchedFixture(fixture, favorites, []), true);
      assert.equal(isWatchedFixture(fixture, [], [fixture]), true);
      assert.equal(isWatchedFixture(fixture, [], []), false);
    });

    it('is NOT watched when only the opponent is favorited... actually both sides count', () => {
      const favorites = [{ id: '47', name: 'Tottenham Hotspur', crest: '', competitionCode: 'PL' }];
      assert.equal(isWatchedFixture(fixture, favorites, []), true);
    });

    it('match by team id OR normalized name (keyless big-clubs favorites have no provider id)', () => {
      const keylessFavorites = [{ id: '', name: 'Arsenal', crest: '', competitionCode: 'PL' }];
      assert.equal(isWatchedFixture(fixture, keylessFavorites, []), true);
      const otherTeamFav = [{ id: '', name: 'chelsea', crest: '', competitionCode: 'PL' }];
      assert.equal(isWatchedFixture(fixture, otherTeamFav, []), false);
    });
  });

  describe('Schedule filtering & Big Match', () => {
    const mk = (id, code, home, away) => ({
      id, kickoffUtc: '2026-08-22T16:30:00Z', status: 'scheduled',
      homeTeam: { id: '', name: home, crest: '' },
      awayTeam: { id: '', name: away, crest: '' },
      competition: { code, name: code }, score: { home: null, away: null }
    });
    const plMatch = () => mk('1', 'PL', 'Arsenal', 'Chelsea');
    const laligaMatch = () => mk('2', 'PD', 'Getafe', 'Osasuna');
    const favorites = [{ id: '', name: 'Getafe', crest: '', competitionCode: 'PD' }];

    it('favorites fixtures always included; others must pass league filter', () => {
      const out = filterScheduleFixtures([plMatch(), laligaMatch()], {
        leagues: ['BL1'], favoriteTeams: favorites, pinnedFixtures: []
      });
      assert.deepEqual(out.map(f => f.id), ['2']);
      const both = filterScheduleFixtures([plMatch(), laligaMatch()], {
        leagues: ['PL', 'PD'], favoriteTeams: [], pinnedFixtures: []
      });
      assert.deepEqual(both.map(f => f.id), ['1', '2']);
    });

    it('pinned fixtures included regardless of league filter', () => {
      const pin = plMatch();
      const out = filterScheduleFixtures([plMatch(), laligaMatch()], {
        leagues: ['BL1'], favoriteTeams: [], pinnedFixtures: [pin]
      });
      assert.deepEqual(out.map(f => f.id), ['1']);
    });

    it('big match only when BOTH teams are elite clubs', () => {
      assert.equal(isBigMatch(mk('3', 'CL', 'Real Madrid', 'Manchester City')), true);
      assert.equal(isBigMatch(mk('4', 'PL', 'Arsenal', 'Brentford')), false);
      assert.equal(isBigMatch(null), false);
    });

    it('monogram returns initials data for crest fallback', () => {
      const m = monogram('Tottenham Hotspur');
      assert.equal(m.initials.length, 2);
      assert.match(m.color, /^#/);
      assert.equal(monogram('').initials, '?');
    });
  });

  describe('Keyless big-clubs list (Q7 fallback)', () => {
    it('loads bundled clubs with required fields', () => {
      const clubs = loadBigClubs();
      assert.ok(clubs.length >= 100);
      for (const c of clubs) {
        assert.ok(c.name, 'club name required');
        assert.ok(c.competitionCode, 'competitionCode required');
        assert.equal(typeof c.elite, 'boolean');
      }
    });

    it('searches case-insensitively, optionally scoped to one competition', () => {
      const all = loadBigClubs();
      const hits = searchBigClubs(all, 'real madrid');
      assert.equal(hits.length, 1);
      assert.equal(hits[0].elite, true);

      const plOnly = searchBigClubs(all, '', { competitionCode: 'PL' });
      assert.ok(plOnly.length >= 15);
      assert.ok(plOnly.every(c => c.competitionCode === 'PL'));

      assert.deepEqual(searchBigClubs(all, ''), []);
    });
  });
});
