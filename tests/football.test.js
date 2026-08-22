const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  LEAGUES,
  createFdProvider,
  createEspnProvider
} = require('../src/main/football');

describe('Football Providers Tests', () => {
  describe('League registry', () => {
    it('covers all 12 free competitions with espn slugs', () => {
      const codes = LEAGUES.map(l => l.code);
      for (const code of ['PL', 'PD', 'SA', 'BL1', 'FL1', 'CL', 'WC', 'EC', 'ELC', 'DED', 'PPL', 'BSA']) {
        assert.ok(codes.includes(code), `missing ${code}`);
      }
      const pl = LEAGUES.find(l => l.code === 'PL');
      assert.equal(pl.espnSlug, 'eng.1');
      const cl = LEAGUES.find(l => l.code === 'CL');
      assert.equal(cl.espnSlug, 'uefa.champions');
    });
  });

  describe('football-data.org provider', () => {
    it('fetches and normalizes fixtures with auth header', async () => {
      let captured;
      const fetchFn = async (url, opts) => {
        captured = { url, opts };
        return {
          ok: true,
          status: 200,
          json: async () => ({
            matches: [{
              id: 452312,
              utcDate: '2026-08-22T16:30:00Z',
              status: 'TIMED',
              homeTeam: { id: 57, name: 'Arsenal', crest: '' },
              awayTeam: { id: 47, name: 'Tottenham Hotspur', crest: '' },
              competition: { code: 'PL', name: 'Premier League' },
              score: { fullTime: { home: null, away: null } }
            }]
          })
        };
      };
      const provider = createFdProvider({ apiKey: 'test-key', fetchFn });
      const fixtures = await provider.fetchSchedule('PL', '2026-08-20', '2026-08-27');

      assert.ok(captured.url.includes('/v4/competitions/PL/matches'));
      assert.ok(captured.url.includes('dateFrom=2026-08-20'));
      assert.equal(captured.opts.headers['X-Auth-Token'], 'test-key');
      assert.equal(fixtures.length, 1);
      assert.equal(fixtures[0].status, 'scheduled');
    });

    it('throws with HTTP status context on API error (never swallowed)', async () => {
      const fetchFn = async () => ({ ok: false, status: 429, json: async () => ({ message: 'rate limited' }) });
      const provider = createFdProvider({ apiKey: 'k', fetchFn });
      await assert.rejects(() => provider.fetchSchedule('PL', 'a', 'b'), /429/);
    });

    it('requires an api key at construction', () => {
      assert.throws(() => createFdProvider({ fetchFn: async () => ({}) }));
    });
  });

  describe('ESPN Live Boost provider', () => {
    const scoreboard = {
      leagues: [{ abbreviation: 'ENG PL' }],
      events: [{
        id: 'e1',
        date: '2026-08-22T16:30:00Z',
        status: { clock: 5400, displayClock: "90'+4'", type: { state: 'in', completed: false, shortDetail: 'FT - ENGLISH PREMIER LEAGUE' } },
        competitions: [{
          competitors: [
            { homeAway: 'home', score: '1', team: { displayName: 'Brentford' } },
            { homeAway: 'away', score: '0', team: { displayName: 'Tottenham Hotspur' } }
          ]
        }]
      }, {
        id: 'e2',
        date: '2026-08-22T18:00:00Z',
        status: { type: { state: 'post', completed: true, shortDetail: 'FT' } },
        competitions: [{
          competitors: [
            { homeAway: 'home', score: '3', team: { displayName: 'Arsenal' } },
            { homeAway: 'away', score: '1', team: { displayName: 'Chelsea' } }
          ]
        }]
      }]
    };

    function fakeFetch(expectedSlug) {
      return async (url) => {
        assert.ok(url.includes(`soccer/${expectedSlug}/scoreboard`));
        return { ok: true, status: 200, json: async () => scoreboard };
      };
    }

    it('maps scoreboard events to live states per league', async () => {
      const provider = createEspnProvider({ fetchFn: fakeFetch('eng.1') });
      const states = await provider.fetchLiveState(['PL']);
      assert.equal(states.length, 2);
      const live = states.find(s => s.state === 'in');
      assert.equal(live.homeName, 'Brentford');
      assert.equal(live.minute, "90'+4'");
      const done = states.find(s => s.state === 'post');
      assert.equal(done.scoreHome, 3);
    });

    it('skips a failing league but preserves the error via onError callback', async () => {
      const seen = [];
      const fetchFn = async (url) => {
        if (url.includes('ger.1')) throw new Error('boom');
        return { ok: true, status: 200, json: async () => ({ events: [] }) };
      };
      const provider = createEspnProvider({
        fetchFn,
        onError: (err, slug) => seen.push([slug, err.message])
      });
      const states = await provider.fetchLiveState(['BL1', 'PL']);
      assert.deepEqual(states, []);
      assert.equal(seen.length, 1);
      assert.equal(seen[0][0], 'BL1');
    });
  });
});
