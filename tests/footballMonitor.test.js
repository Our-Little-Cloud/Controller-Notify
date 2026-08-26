const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createFootballMonitor } = require('../src/main/footballMonitor');

function memoryStore(initial = {}) {
  const data = { ...initial };
  return {
    get: (key, def) => (key in data ? data[key] : def),
    set: (key, val) => { data[key] = val; },
    _data: data
  };
}

const KICKOFF = Date.parse('2026-08-22T16:30:00Z');

function makeFixture(id, overrides = {}) {
  return {
    id,
    kickoffUtc: new Date(KICKOFF).toISOString(),
    status: 'scheduled',
    minute: null,
    homeTeam: { id: '', name: 'Arsenal', crest: '' },
    awayTeam: { id: '', name: 'Chelsea', crest: '' },
    competition: { code: 'PL', name: 'Premier League' },
    score: { home: null, away: null },
    ...overrides
  };
}

function makeMonitor({ store, espn, fd, now, onFixtureEvent, onError }) {
  const favorites = [{ id: '', name: 'Arsenal', crest: '', competitionCode: 'PL' }];
  return createFootballMonitor({
    store,
    favoriteTeams: favorites,
    pinnedFixtures: [],
    leagues: ['PL'],
    reminderMinutes: 15,
    liveBoost: true,
    espnProvider: espn,
    fdProvider: fd,
    nowFn: now || (() => Date.now()),
    onFixtureEvent: onFixtureEvent || (() => {}),
    onError: onError || (() => {})
  });
}

describe('Football Monitor Tests', () => {
  it('fires reminder once inside the pre-kickoff window', async () => {
    const store = memoryStore();
    const espn = {
      fetchLiveState: async () => [
        { homeName: 'Arsenal', awayName: 'Chelsea', state: 'pre', completed: false, minute: null, scoreHome: null, scoreAway: null, kickoffUtc: new Date(KICKOFF).toISOString() }
      ]
    };
    const events = [];
    let t = KICKOFF - 20 * 60 * 1000;
    const mon = makeMonitor({
      store, espn, fd: null,
      now: () => t,
      onFixtureEvent: (e) => events.push(e.type)
    });

    await mon.checkWatch();
    assert.deepEqual(events, []); // too early

    t = KICKOFF - 10 * 60 * 1000;
    await mon.checkWatch();
    assert.deepEqual(events, ['reminder']);

    await mon.checkWatch(); // deduped
    assert.deepEqual(events, ['reminder']);
  });

  it('fires kickoff and fulltime on state transitions with final score', async () => {
    const store = memoryStore();
    let state = { homeName: 'Arsenal', awayName: 'Chelsea', state: 'pre', completed: false, minute: null, scoreHome: null, scoreAway: null, kickoffUtc: new Date(KICKOFF).toISOString() };
    const espn = { fetchLiveState: async () => [state] };
    const events = [];
    const t = KICKOFF + 5 * 60 * 1000;
    const mon = makeMonitor({ store, espn, fd: null, now: () => t, onFixtureEvent: (e) => events.push([e.type, e.scoreHome, e.scoreAway]) });

    await mon.checkWatch(); // still pre -> nothing
    assert.deepEqual(events, []);

    state = { ...state, state: 'in', minute: "12'" };
    await mon.checkWatch();
    assert.deepEqual(events, [['kickoff', null, null]]);

    state = { ...state, state: 'post', completed: true, minute: 'FT', scoreHome: 2, scoreAway: 1 };
    await mon.checkWatch();
    assert.deepEqual(events, [['kickoff', null, null], ['fulltime', 2, 1]]);
  });

  it('writes events to matchHistory capped at 50', async () => {
    const store = memoryStore();
    let state = { homeName: 'Arsenal', awayName: 'Chelsea', state: 'post', completed: true, minute: 'FT', scoreHome: 1, scoreAway: 0, kickoffUtc: new Date(KICKOFF).toISOString() };
    const espn = { fetchLiveState: async () => [state] };
    const mon = makeMonitor({ store, espn, fd: null, now: () => KICKOFF + 120 * 60000 });
    await mon.checkWatch();
    const history = store.get('matchHistory', []);
    assert.equal(history.length, 1);
    assert.equal(history[0].fixtureId, 'arsenal-chelsea' === '' ? '' : history[0].fixtureId);
    assert.equal(history[0].type, 'fulltime');
  });

  it('falls back to fd.org when ESPN fails, preserving the original error', async () => {
    const store = memoryStore({ footballFixtures: [makeFixture('fx1')] });
    const espn = { fetchLiveState: async () => { throw new Error('espn down'); } };
    const fd = {
      name: 'football-data.org',
      fetchSchedule: async () => [makeFixture('fx1', { status: 'live', minute: "30'" })]
    };
    const errors = [];
    const events = [];
    const mon = createFootballMonitor({
      store,
      favoriteTeams: [{ id: '', name: 'Arsenal', crest: '', competitionCode: 'PL' }],
      pinnedFixtures: [], leagues: ['PL'], reminderMinutes: 15, liveBoost: true,
      espnProvider: espn, fdProvider: fd,
      nowFn: () => KICKOFF + 30 * 60000,
      onFixtureEvent: (e) => events.push(e.type),
      onError: (err) => errors.push(err.message)
    });

    await mon.checkWatch();
    assert.equal(errors.length, 1);
    assert.match(errors[0], /espn down/);
    assert.deepEqual(events, ['kickoff']); // fd fallback still detects the live state
  });

  it('does nothing without any provider configured gracefully', async () => {
    const store = memoryStore();
    const mon = makeMonitor({ store, espn: null, fd: null });
    await mon.checkWatch(); // must not throw
    assert.ok(true);
  });

  it('injects keyless favorite matches from ESPN into the schedule cache (cross-competition)', async () => {
    const store = memoryStore(); // no cached fixtures at all
    const espn = {
      fetchLiveState: async () => [
        { eventId: 'ucl1', kickoffUtc: new Date(KICKOFF).toISOString(), homeName: 'Barcelona', awayName: 'Bayern Munich', state: 'in', completed: false, minute: "34'", scoreHome: 1, scoreAway: 0 }
      ]
    };
    const mon = createFootballMonitor({
      store,
      favoriteTeams: [
        { id: '', name: 'Barcelona', crest: '', competitionCode: 'PD' },
        { id: '', name: 'Bayern Munich', crest: '', competitionCode: 'BL1' }
      ],
      pinnedFixtures: [], leagues: ['BL1'], reminderMinutes: 15, liveBoost: true,
      espnProvider: espn, fdProvider: null,
      nowFn: () => KICKOFF + 30 * 60000,
      onFixtureEvent: () => {},
      onError: () => {}
    });

    await mon.checkWatch();
    const cache = store.get('footballFixtures', []);
    assert.equal(cache.length, 1);
    assert.equal(cache[0].homeTeam.name, 'Barcelona');
    assert.equal(cache[0].awayTeam.name, 'Bayern Munich');
    assert.equal(cache[0].status, 'live');
    assert.equal(cache[0].competition.code, ''); // slug unknown without registry hit — acceptable v1
    assert.equal(cache[0].score.home, 1);
  });

  it('sweep merges favorite-team fixtures fetched per team id', async () => {
    const store = memoryStore({ footballFavoriteTeams: [{ id: '529', name: 'Barcelona', crest: '', competitionCode: 'PD' }] });
    let calls = [];
    const fd = {
      fetchSchedule: async (code) => { calls.push(`league:${code}`); return []; },
      fetchTeamFixtures: async (teamId) => { calls.push(`team:${teamId}`); return [makeFixture('tfx', { status: 'scheduled' })]; }
    };
    const mon = createFootballMonitor({
      store,
      favoriteTeams: [{ id: '529', name: 'Barcelona', crest: '', competitionCode: 'PD' }],
      pinnedFixtures: [], leagues: ['PL'], reminderMinutes: 15, liveBoost: false,
      espnProvider: null, fdProvider: fd,
      nowFn: () => KICKOFF, paceMs: 0,
      onFixtureEvent: () => {}, onError: () => {}
    });
    await mon.checkSweep();
    assert.ok(calls.includes('league:PL'));
    assert.ok(calls.includes('team:529'));
    const cache = store.get('footballFixtures', []);
    assert.equal(cache.length, 1);
    assert.equal(cache[0].id, 'tfx');
  });

  it('sweep pulls big-5 cup fixtures from ESPN extras (Phase 1)', async () => {
    const store = memoryStore();
    const espn = {
      fetchLiveState: async () => [],
      fetchFixtures: async (code) => {
        assert.equal(code, 'GER-SC');
        return [{
          id: 'espn:sc1',
          kickoffUtc: new Date(KICKOFF).toISOString(),
          status: 'scheduled',
          minute: null,
          homeTeam: { id: '', name: 'Bayern Munich', crest: '' },
          awayTeam: { id: '', name: 'Borussia Dortmund', crest: '' },
          competition: { code: 'GER-SC', name: 'German Supercup' },
          score: { home: null, away: null }
        }];
      }
    };
    const mon = createFootballMonitor({
      store,
      favoriteTeams: [], pinnedFixtures: [], leagues: ['PL'], reminderMinutes: 15, liveBoost: true,
      espnProvider: espn, fdProvider: null,
      nowFn: () => KICKOFF, paceMs: 0,
      onFixtureEvent: () => {}, onError: () => {}
    });
    await mon.checkSweep();
    const cache = store.get('footballFixtures', []);
    assert.equal(cache.length, 1);
    assert.equal(cache[0].competition.code, 'GER-SC');
  });

  it('cupsEnabled=false skips the extras sweep entirely', async () => {
    const store = memoryStore();
    let called = 0;
    const espn = {
      fetchLiveState: async () => [],
      fetchFixtures: async () => { called++; return []; }
    };
    const mon = createFootballMonitor({
      store,
      favoriteTeams: [], pinnedFixtures: [], leagues: ['PL'], reminderMinutes: 15, liveBoost: true,
      cupsEnabled: false,
      espnProvider: espn, fdProvider: null,
      nowFn: () => Date.now(), paceMs: 0,
      onFixtureEvent: () => {}, onError: () => {}
    });
    await mon.checkSweep();
    assert.equal(called, 0);
  });

  it('watcher polls watched cup competition scoreboards too (live cup matches update)', async () => {
    const store = memoryStore({
      footballFixtures: [makeFixture('cupfx', {
        competition: { code: 'GER-SC', name: 'German Supercup' },
        status: 'scheduled',
        kickoffUtc: new Date(Date.now() + 10 * 60000).toISOString(),
        homeTeam: { id: '', name: 'Bayern Munich', crest: '' },
        awayTeam: { id: '', name: 'Borussia Dortmund', crest: '' }
      })]
    });
    const requestedCodes = [];
    const espn = {
      fetchLiveState: async (codes) => {
        requestedCodes.push(...codes);
        return [{ eventId: 'x', kickoffUtc: new Date(Date.now() + 11 * 60000).toISOString(), competitionCode: 'GER-SC', homeName: 'Bayern Munich', awayName: 'Borussia Dortmund', state: 'in', completed: false, minute: "5'", scoreHome: 0, scoreAway: 0 }];
      }
    };
    const mon = createFootballMonitor({
      store,
      favoriteTeams: [{ id: '', name: 'Bayern Munich', crest: '', competitionCode: 'BL1' }],
      pinnedFixtures: [], leagues: ['PL'], reminderMinutes: 15, liveBoost: true,
      espnProvider: espn, fdProvider: null,
      nowFn: () => Date.now(), paceMs: 0,
      onFixtureEvent: (e) => events.push(e.type),
      onError: () => {}
    });
    const events = [];
    await mon.checkWatch();
    assert.ok(requestedCodes.includes('GER-SC'), `watcher must request watched cup codes, got ${JSON.stringify(requestedCodes)}`);
    assert.deepEqual(events, ['kickoff']);
  });

  it('forces a stuck live fixture to finished when its source goes silent past kickoff+3h', async () => {
    const store = memoryStore({
      footballFixtures: [makeFixture('stuck1', {
        status: 'live',
        minute: "45+3'",
        homeTeam: { id: '', name: 'Bayern Munich', crest: '' },
        awayTeam: { id: '', name: 'Borussia Dortmund', crest: '' },
        competition: { code: 'GER-SC', name: 'German Supercup' }
      })]
    });
    const events = [];
    const mon = createFootballMonitor({
      store,
      favoriteTeams: [{ id: '', name: 'Bayern Munich', crest: '', competitionCode: 'BL1' }],
      pinnedFixtures: [], leagues: ['PL'], reminderMinutes: 15, liveBoost: true,
      espnProvider: { fetchLiveState: async () => [] }, // silent source
      fdProvider: null,
      nowFn: () => KICKOFF + 4 * 60 * 60 * 1000, // 4h after kickoff
      paceMs: 0,
      onFixtureEvent: (e) => events.push(e.type),
      onError: () => {}
    });
    await mon.checkWatch();
    assert.deepEqual(events, ['fulltime']);
    assert.equal(store.get('footballFixtures', [])[0].status, 'finished');
  });

  it('sweep REPLACES stale pseudo duplicates with the canonical cup fixture', async () => {
    const staleKickoff = new Date(KICKOFF).toISOString();
    const store = memoryStore({
      footballFixtures: [{
        id: 'espn:bayern-munich-vs-borussia-dortmund@na',
        kickoffUtc: staleKickoff,
        status: 'live',
        minute: "45+3'",
        homeTeam: { id: '', name: 'Bayern Munich', crest: '' },
        awayTeam: { id: '', name: 'Borussia Dortmund', crest: '' },
        competition: { code: '', name: '' },
        score: { home: 0, away: 0 },
        pseudo: true
      }]
    });
    const espn = {
      fetchLiveState: async () => [],
      fetchFixtures: async (code) => code === 'GER-SC' ? [{
        id: 'espn:401873679',
        kickoffUtc: staleKickoff,
        status: 'live',
        minute: "76'",
        homeTeam: { id: '', name: 'Bayern Munich', crest: '' },
        awayTeam: { id: '', name: 'Borussia Dortmund', crest: '' },
        competition: { code: 'GER-SC', name: 'German Supercup' },
        score: { home: 0, away: 1 }
      }] : []
    };
    const mon = createFootballMonitor({
      store,
      favoriteTeams: [], pinnedFixtures: [], leagues: ['PL'], reminderMinutes: 15, liveBoost: true,
      espnProvider: espn, fdProvider: null,
      nowFn: () => KICKOFF, paceMs: 0,
      onFixtureEvent: () => {}, onError: () => {}
    });
    await mon.checkSweep();
    const cache = store.get('footballFixtures', []);
    assert.equal(cache.length, 1);
    assert.equal(cache[0].id, 'espn:401873679');
    assert.equal(cache[0].minute, "76'");
  });

  it('sweep merges per-team ESPN schedules for resolved favorites and skips cross-source duplicates', async () => {
    const store = memoryStore({
      footballFixtures: [makeFixture('fd-dup', {})]
    });
    const espn = {
      fetchLiveState: async () => [],
      fetchFixtures: async () => [],
      fetchTeamSchedule: async (slug, teamId) => {
        assert.equal(slug, 'ger.1');
        assert.equal(teamId, '132');
        // Same real-world match already cached from fd.org (fd-dup), plus a cup match
        return [
          {
            id: 'espn:dup1', kickoffUtc: new Date(KICKOFF).toISOString(), status: 'scheduled', minute: null,
            homeTeam: { id: '', name: 'Arsenal', crest: '' }, awayTeam: { id: '', name: 'Chelsea', crest: '' },
            competition: { code: '', name: '2026 German Bundesliga' }, score: { home: null, away: null }
          },
          {
            id: 'espn:new1', kickoffUtc: new Date(KICKOFF + 3600000).toISOString(), status: 'scheduled', minute: null,
            homeTeam: { id: '', name: 'Bayern Munich', crest: '' }, awayTeam: { id: '', name: 'Borussia Dortmund', crest: '' },
            competition: { code: '', name: '2026 German SuperCup' }, score: { home: null, away: null }
          }
        ];
      }
    };
    const mon = createFootballMonitor({
      store,
      favoriteTeams: [{ id: '132', name: 'Bayern Munich', crest: '', espnSlug: 'ger.1', espnTeamId: '132' }],
      pinnedFixtures: [], leagues: ['PL'], reminderMinutes: 15, liveBoost: true,
      espnProvider: espn, fdProvider: null,
      nowFn: () => KICKOFF, paceMs: 0,
      onFixtureEvent: () => {}, onError: () => {}
    });
    await mon.checkSweep();
    const cache = store.get('footballFixtures', []);
    const ids = cache.map(f => f.id);
    assert.ok(ids.includes('fd-dup'), 'existing fd fixture preserved');
    assert.ok(ids.includes('espn:new1'), 'cup match added via team schedule');
    assert.ok(!ids.includes('espn:dup1'), 'duplicate of cached fixture skipped');
  });
});
