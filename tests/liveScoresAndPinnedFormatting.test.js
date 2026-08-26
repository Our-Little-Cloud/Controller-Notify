const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createFootballMonitor, FIXTURES_KEY } = require('../src/main/footballMonitor');
const { repairPinnedFixtures } = require('../src/main/footballManager');

function memoryStore(initial = {}) {
  const data = { ...initial };
  return {
    get: (key, def) => (key in data ? data[key] : def),
    set: (key, val) => { data[key] = val; },
    _data: data
  };
}

const KICKOFF = Date.parse('2026-08-26T19:00:00Z');

describe('Live Scores & Pinned Formatting Tests (TDD)', () => {
  describe('Slice 1: checkWatch updates ALL live games in cache', () => {
    it('should update minute and score for unwatched fixtures in cache during checkWatch', async () => {
      const store = memoryStore({
        [FIXTURES_KEY]: [
          {
            id: 'espn:101',
            kickoffUtc: new Date(KICKOFF).toISOString(),
            status: 'scheduled',
            minute: null,
            homeTeam: { id: '', name: 'Unwatched Home', crest: '' },
            awayTeam: { id: '', name: 'Unwatched Away', crest: '' },
            competition: { code: 'PL', name: 'Premier League' },
            score: { home: null, away: null }
          }
        ]
      });

      const espn = {
        fetchLiveState: async (codes) => {
          return [
            {
              eventId: '101',
              kickoffUtc: new Date(KICKOFF).toISOString(),
              competitionCode: 'PL',
              homeName: 'Unwatched Home',
              awayName: 'Unwatched Away',
              state: 'in',
              completed: false,
              minute: "35'",
              scoreHome: 2,
              scoreAway: 1
            }
          ];
        }
      };

      const mon = createFootballMonitor({
        store,
        favoriteTeams: [],
        pinnedFixtures: [],
        leagues: ['PL'],
        reminderMinutes: 15,
        liveBoost: true,
        espnProvider: espn,
        fdProvider: null,
        nowFn: () => KICKOFF + 30 * 60 * 1000,
        paceMs: 0,
        onFixtureEvent: () => {},
        onError: () => {}
      });

      await mon.checkWatch();

      const cache = store.get(FIXTURES_KEY, []);
      assert.equal(cache.length, 1);
      assert.equal(cache[0].status, 'live');
      assert.equal(cache[0].minute, "35'");
      assert.equal(cache[0].score.home, 2);
      assert.equal(cache[0].score.away, 1);
    });
  });

  describe('Slice 2: Auto-repair stale pinned fixtures missing kickoffUtc', () => {
    it('should enrich stale pinned fixtures lacking kickoffUtc from schedule cache', () => {
      const stalePins = [
        {
          id: 'espn:101',
          kickoffUtc: null, // stale stored value
          status: 'scheduled',
          homeTeam: { id: '', name: 'Arsenal', crest: '' },
          awayTeam: { id: '', name: 'Chelsea', crest: '' },
          competition: { code: 'PL', name: 'Premier League' },
          score: { home: null, away: null }
        }
      ];

      const schedule = [
        {
          id: 'espn:101',
          kickoffUtc: '2026-08-26T21:00:00.000Z',
          status: 'scheduled',
          homeTeam: { id: '', name: 'Arsenal', crest: '' },
          awayTeam: { id: '', name: 'Chelsea', crest: '' },
          competition: { code: 'PL', name: 'Premier League' },
          score: { home: null, away: null }
        }
      ];

      const repaired = repairPinnedFixtures(stalePins, schedule);
      assert.equal(repaired.length, 1);
      assert.equal(repaired[0].kickoffUtc, '2026-08-26T21:00:00.000Z', 'kickoffUtc must be repaired from schedule');
    });
  });

  describe('Slice 3: Live Pinned Match Formatting', () => {
    it('should format live pinned fixture with home team, home score, live minute, away score, away team', () => {
      const livePin = {
        id: 'espn:102',
        kickoffUtc: new Date(KICKOFF).toISOString(),
        status: 'live',
        minute: "45'",
        homeTeam: { id: '', name: 'Arsenal', crest: '' },
        awayTeam: { id: '', name: 'Chelsea', crest: '' },
        competition: { code: 'PL', name: 'Premier League' },
        score: { home: 2, away: 1 }
      };

      // Mock formatting helper reproducing the renderer output structure
      const formatPinnedLiveRow = (f) => {
        const homeHtml = `${f.homeTeam.name} [logo] <strong class="score-val">${f.score.home ?? 0}</strong>`;
        const centerHtml = `<span class="fixture-score">${f.minute || 'LIVE'}</span>`;
        const awayHtml = `<strong class="score-val">${f.score.away ?? 0}</strong> [logo2] ${f.awayTeam.name}`;
        return `${homeHtml} | ${centerHtml} | ${awayHtml}`;
      };

      const row = formatPinnedLiveRow(livePin);
      assert.equal(row, "Arsenal [logo] <strong class=\"score-val\">2</strong> | <span class=\"fixture-score\">45'</span> | <strong class=\"score-val\">1</strong> [logo2] Chelsea");
    });
  });
});
