const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  LEAGUES,
  EXTRA_LEAGUES,
  createFdProvider,
  createEspnProvider
} = require('../src/main/football');

function headersLike(map) {
  return { get: (name) => map[String(name).toLowerCase()] ?? null };
}

function espnEventJson(id, state, opts = {}) {
  return {
    id,
    date: opts.date || '2026-08-22T18:30Z',
    status: {
      displayClock: opts.minute || null,
      type: { state, completed: state === 'post' }
    },
    competitions: [{
      competitors: [
        { homeAway: 'home', score: opts.home != null ? String(opts.home) : null, team: { displayName: opts.homeName || 'Bayern Munich' } },
        { homeAway: 'away', score: opts.away != null ? String(opts.away) : null, team: { displayName: opts.awayName || 'Borussia Dortmund' } }
      ]
    }]
  };
}

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

    it('retries a 429 without reset header once (bounded default backoff), then throws with status context', async () => {
      const delays = [];
      const sleepFn = (ms) => { delays.push(ms); return Promise.resolve(); };
      let calls = 0;
      const fetchFn = async () => {
        calls++;
        return { ok: false, status: 429, headers: null, json: async () => ({ message: 'rate limited' }) };
      };
      const provider = createFdProvider({ apiKey: 'k', fetchFn, sleepFn });
      await assert.rejects(() => provider.fetchSchedule('PL', 'a', 'b'), /429/);
      assert.equal(calls, 2);
      assert.ok(delays.some(d => d >= 60000), 'default bounded backoff of ~60s applied when no reset header');
    });
  });

  describe('ESPN extra competitions (big-5 cups, Phase 1)', () => {
    it('registers the verified big-5 cup slugs without colliding with fd.org codes', () => {
      const fdCodes = new Set(LEAGUES.map(l => l.code));
      const expected = [
        ['ENG-FA', 'eng.fa'],
        ['ENG-LC', 'eng.league_cup'],
        ['ESP-CDR', 'esp.copa_del_rey'],
        ['ITA-CI', 'ita.coppa_italia'],
        ['GER-PK', 'ger.dfb_pokal'],
        ['GER-SC', 'ger.super_cup'],
        ['FRA-TC', 'fra.super_cup']
      ];
      assert.ok(EXTRA_LEAGUES.length >= expected.length);
      for (const [code, slug] of expected) {
        const entry = EXTRA_LEAGUES.find(l => l.code === code);
        assert.ok(entry, `missing extra league ${code}`);
        assert.equal(entry.espnSlug, slug);
        assert.equal(entry.source, 'espn');
        assert.ok(!fdCodes.has(code), `${code} must not collide with fd.org codes`);
      }
    });

    it('fetchFixtures maps scoreboard events (incl. scheduled) to fixture shape', async () => {
      let captured;
      const fetchFn = async (url) => {
        captured = url;
        return {
          ok: true, status: 200,
          json: async () => ({
            leagues: [{ name: 'German Supercup' }],
            events: [
              espnEventJson('e1', 'pre', { date: '2026-08-22T18:30Z' }),
              espnEventJson('e2', 'in', { minute: "12'", home: 1, away: 0 })
            ]
          })
        };
      };
      const provider = createEspnProvider({ fetchFn });
      const fixtures = await provider.fetchFixtures('GER-SC', '2026-08-21', '2026-08-28');

      assert.ok(captured.includes('soccer/ger.super_cup/scoreboard'));
      assert.ok(captured.includes('dates=20260821-20260828'), `expected ESPN date range in ${captured}`);
      assert.equal(fixtures.length, 2);
      const scheduled = fixtures[0];
      assert.equal(scheduled.status, 'scheduled');
      assert.equal(scheduled.homeTeam.name, 'Bayern Munich');
      assert.equal(scheduled.competition.code, 'GER-SC');
      assert.equal(fixtures[1].status, 'live');
      assert.equal(fixtures[1].score.home, 1);
    });

    it('fetchTeamSchedule uses fixture=true and maps team fixtures across cups', async () => {
      let captured;
      const fetchFn = async (url) => {
        captured = url;
        return {
          ok: true, status: 200,
          json: async () => ({
            team: { displayName: 'Bayern Munich' },
            events: [espnEventJson('supercup-e1', 'in', { minute: "34'", home: 0, away: 1 })]
          })
        };
      };
      const provider = createEspnProvider({ fetchFn });
      const fixtures = await provider.fetchTeamSchedule('ger.1', '132');

      assert.ok(captured.includes('/teams/132/schedule?fixture=true'), `unexpected URL ${captured}`);
      assert.equal(fixtures.length, 1);
      assert.equal(fixtures[0].status, 'live');
      assert.equal(fixtures[0].awayTeam.name, 'Borussia Dortmund');
    });

    it('fetchTeamDirectory resolves ESPN team ids from the big-5 league teams list', async () => {
      let captured;
      const fetchFn = async (url) => {
        captured = url;
        return {
          ok: true, status: 200,
          json: async () => ({
            sports: [{ leagues: [{ teams: [
              { team: { id: '598', displayName: '1. FC Union Berlin' } },
              { team: { id: '132', displayName: 'Bayern Munich' } }
            ] }] }]
          })
        };
      };
      const provider = createEspnProvider({ fetchFn });
      const directory = await provider.fetchTeamDirectory('ger.1');

      assert.ok(captured.includes('soccer/ger.1/teams'));
      assert.deepEqual(directory, [
        { id: '598', name: '1. FC Union Berlin', espnSlug: 'ger.1' },
        { id: '132', name: 'Bayern Munich', espnSlug: 'ger.1' }
      ]);
    });

    it('requires an api key at construction', () => {
      assert.throws(() => createFdProvider({ fetchFn: async () => ({}) }));
    });

    it('tracks X-RequestsAvailable / X-RequestCounter-Reset and waits for the reset window near the limit', async () => {
      const delays = [];
      const sleepFn = (ms) => { delays.push(ms); return Promise.resolve(); };
      let calls = 0;
      const fetchFn = async () => {
        calls++;
        if (calls === 1) {
          // First response reports only 1 remaining request, window resets in 12s
          return {
            ok: true, status: 200,
            headers: headersLike({ 'x-requestsavailable': '1', 'x-requestcounter-reset': '12' }),
            json: async () => ({ matches: [] })
          };
        }
        return {
          ok: true, status: 200,
          headers: headersLike({ 'x-requestsavailable': '9', 'x-requestcounter-reset': '60' }),
          json: async () => ({ matches: [] })
        };
      };
      const provider = createFdProvider({ apiKey: 'k', fetchFn, sleepFn });

      await provider.fetchSchedule('PL', 'a', 'b');
      await provider.fetchSchedule('PL', 'a', 'b');

      assert.equal(calls, 2);
      assert.ok(delays.some(d => d >= 12000), `expected a >=12s adaptive wait, got ${JSON.stringify(delays)}`);
      assert.equal(provider.getThrottleState().lastAvailable, 9);
    });

    it('retries once after honoring X-RequestCounter-Reset on a 429', async () => {
      const delays = [];
      const sleepFn = (ms) => { delays.push(ms); return Promise.resolve(); };
      let calls = 0;
      const fetchFn = async () => {
        calls++;
        if (calls === 1) {
          return {
            ok: false, status: 429,
            headers: headersLike({ 'x-requestcounter-reset': '8' }),
            json: async () => ({ message: 'too many requests' })
          };
        }
        return {
          ok: true, status: 200,
          headers: headersLike({ 'x-requestcounter': '2', 'x-requestcounter-reset': '55' }),
          json: async () => ({ matches: [{ id: 1, utcDate: '2026-08-22T16:30:00Z', status: 'TIMED', homeTeam: { name: 'A' }, awayTeam: { name: 'B' }, competition: {} }] })
        };
      };
      const provider = createFdProvider({ apiKey: 'k', fetchFn, sleepFn });
      const fixtures = await provider.fetchSchedule('PL', 'a', 'b');

      assert.equal(calls, 2);
      assert.ok(delays.some(d => d >= 8000), `expected an >=8s reset wait, got ${JSON.stringify(delays)}`);
      assert.equal(fixtures.length, 1);
    });

    it('still throws with status context on non-429 errors', async () => {
      const fetchFn = async () => ({ ok: false, status: 403, headers: null, json: async () => ({ message: 'nope' }) });
      const provider = createFdProvider({ apiKey: 'k', fetchFn, sleepFn: () => Promise.resolve() });
      await assert.rejects(() => provider.fetchSchedule('PL', 'a', 'b'), /403/);
    });

    it('fetches a favorite team fixtures across all its competitions', async () => {
      let captured;
      const fetchFn = async (url, opts) => {
        captured = { url, opts };
        return {
          ok: true, status: 200,
          headers: null,
          json: async () => ({
            matches: [{
              id: 900001,
              utcDate: '2026-08-22T19:00:00Z',
              status: 'IN_PLAY',
              minute: "34'",
              homeTeam: { id: 529, name: 'Barcelona', crest: '' },
              awayTeam: { id: 5013, name: 'Chelsea', crest: '' },
              competition: { code: 'CL', name: 'Champions League' },
              score: { fullTime: { home: 1, away: 0 } }
            }]
          })
        };
      };
      const provider = createFdProvider({ apiKey: 'k', fetchFn, sleepFn: () => Promise.resolve() });
      const fixtures = await provider.fetchTeamFixtures('529', '2026-08-21', '2026-08-28');

      assert.ok(captured.url.includes('/v4/teams/529/matches'));
      assert.ok(captured.url.includes('dateFrom=2026-08-21'));
      assert.equal(captured.opts.headers['X-Auth-Token'], 'k');
      assert.equal(fixtures.length, 1);
      assert.equal(fixtures[0].status, 'live');
      assert.equal(fixtures[0].competition.code, 'CL');
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
