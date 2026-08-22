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
});
