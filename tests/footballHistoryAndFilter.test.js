const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createFootballMonitor, HISTORY_KEY: FB_HISTORY_KEY } = require('../src/main/footballMonitor');
const { createLiveMonitor, HISTORY_KEY: LIVE_HISTORY_KEY } = require('../src/main/liveMonitor');

function createMemoryStore(initial = {}) {
  const data = { ...initial };
  return {
    store: data,
    get: (key, def) => (key in data ? data[key] : def),
    set: (key, val) => { data[key] = val; },
    _data: data
  };
}

describe('Notification History & Match Filtering TDD', () => {
  describe('Slice 1: History Clear & Delete on FootballMonitor', () => {
    it('should clear match history and event log on clearHistory()', () => {
      const store = createMemoryStore({
        [FB_HISTORY_KEY]: [
          { fixtureId: 'fix1', title: 'Arsenal vs Chelsea', timestamp: 1000 }
        ],
        matchEventLog: { fix1: { kickoff: true } }
      });

      const monitor = createFootballMonitor({ store });
      assert.equal(typeof monitor.clearHistory, 'function', 'FootballMonitor must provide clearHistory()');

      monitor.clearHistory();

      assert.deepEqual(store.get(FB_HISTORY_KEY, []), []);
      assert.deepEqual(store.get('matchEventLog', {}), {});
    });

    it('should delete a single match history item by fixtureId / timestamp', () => {
      const store = createMemoryStore({
        [FB_HISTORY_KEY]: [
          { fixtureId: 'fix1', title: 'Arsenal vs Chelsea', timestamp: 1000 },
          { fixtureId: 'fix2', title: 'Liverpool vs Everton', timestamp: 2000 }
        ]
      });

      const monitor = createFootballMonitor({ store });
      assert.equal(typeof monitor.deleteHistoryItem, 'function', 'FootballMonitor must provide deleteHistoryItem()');

      monitor.deleteHistoryItem({ fixtureId: 'fix1', timestamp: 1000 });

      const remaining = store.get(FB_HISTORY_KEY, []);
      assert.equal(remaining.length, 1);
      assert.equal(remaining[0].fixtureId, 'fix2');
    });
  });

  describe('Slice 2: Delete History Item on LiveMonitor', () => {
    it('should delete a single stream history item by videoId', () => {
      const store = createMemoryStore({
        [LIVE_HISTORY_KEY]: [
          { videoId: 'vid1', title: 'Stream 1', timestamp: 1000 },
          { videoId: 'vid2', title: 'Stream 2', timestamp: 2000 }
        ]
      });

      const monitor = createLiveMonitor({ store });
      assert.equal(typeof monitor.deleteHistoryItem, 'function', 'LiveMonitor must provide deleteHistoryItem()');

      monitor.deleteHistoryItem({ videoId: 'vid1' });

      const remaining = monitor.getHistory();
      assert.equal(remaining.length, 1);
      assert.equal(remaining[0].videoId, 'vid2');
    });
  });

  describe('Slice 3: Strict Notification & History Filtering (Favorites & Pins only)', () => {
    it('should NOT emit event or record history for non-favorite, non-pinned match', async () => {
      const store = createMemoryStore();
      const events = [];
      const monitor = createFootballMonitor({
        store,
        favoriteTeams: [{ name: 'Arsenal' }],
        pinnedFixtures: [],
        nowFn: () => 1000000000,
        onFixtureEvent: (e) => events.push(e),
        espnProvider: {
          fetchLiveState: async () => [
            // Tottenham vs West Ham - neither is favorite nor pinned
            {
              homeName: 'Tottenham',
              awayName: 'West Ham',
              state: 'in',
              minute: "25'",
              scoreHome: 1,
              scoreAway: 0,
              kickoffUtc: '2026-08-22T16:30:00Z'
            },
            // Arsenal vs Chelsea - Arsenal is favorite
            {
              homeName: 'Arsenal',
              awayName: 'Chelsea',
              state: 'in',
              minute: "10'",
              scoreHome: 0,
              scoreAway: 0,
              kickoffUtc: '2026-08-22T16:30:00Z'
            }
          ]
        }
      });

      await monitor.checkWatch();

      // Only Arsenal match should have triggered an event and been added to match history
      const history = store.get(FB_HISTORY_KEY, []);
      assert.equal(history.length, 1, 'Only the favorite match should be in history');
      assert.ok(history[0].title.includes('Arsenal'), 'History must belong to favorite team');

      assert.equal(events.length, 1, 'Only favorite match should trigger notification');
      assert.ok(events[0].homeName === 'Arsenal' || events[0].awayName === 'Arsenal');
    });

    it('should support dynamic updateWatched to update favorites and pinned fixtures immediately', async () => {
      const store = createMemoryStore();
      const events = [];
      const monitor = createFootballMonitor({
        store,
        favoriteTeams: [], // starts empty
        pinnedFixtures: [],
        nowFn: () => 1000000000,
        onFixtureEvent: (e) => events.push(e),
        espnProvider: {
          fetchLiveState: async () => [
            {
              homeName: 'Real Madrid',
              awayName: 'Barcelona',
              state: 'in',
              minute: "15'",
              scoreHome: 1,
              scoreAway: 0,
              kickoffUtc: '2026-08-22T16:30:00Z'
            }
          ]
        }
      });

      assert.equal(typeof monitor.updateWatched, 'function', 'FootballMonitor must expose updateWatched()');

      // First check: not favorite, should NOT emit or record
      await monitor.checkWatch();
      assert.equal(store.get(FB_HISTORY_KEY, []).length, 0);
      assert.equal(events.length, 0);

      // Dynamically add Real Madrid as favorite
      monitor.updateWatched({
        favoriteTeams: [{ name: 'Real Madrid' }],
        pinnedFixtures: []
      });

      // Second check: now favorite, should emit/record
      await monitor.checkWatch();
      assert.equal(store.get(FB_HISTORY_KEY, []).length, 1);
      assert.equal(events.length, 1);
      assert.equal(events[0].homeName, 'Real Madrid');
    });
  });

  describe('Slice 4: IPC and Preload Contracts', () => {
    const fs = require('node:fs');
    const path = require('node:path');

    it('should expose deleteHistoryItem in preload.js', () => {
      const preloadPath = path.join(__dirname, '../src/main/preload.js');
      const content = fs.readFileSync(preloadPath, 'utf8');
      assert.ok(content.includes('deleteHistoryItem:'), 'preload.js must expose deleteHistoryItem');
      assert.ok(content.includes('delete-history-item'), 'preload.js must invoke delete-history-item channel');
    });

    it('should register clear-history and delete-history-item in main.js', () => {
      const mainPath = path.join(__dirname, '../src/main/main.js');
      const content = fs.readFileSync(mainPath, 'utf8');
      assert.ok(content.includes("ipcMain.handle('clear-history'"), 'main.js must handle clear-history');
      assert.ok(content.includes("ipcMain.handle('delete-history-item'"), 'main.js must handle delete-history-item');
    });
  });
});
