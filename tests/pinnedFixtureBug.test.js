const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeFixture, togglePinnedFixture, isWatchedFixture } = require('../src/main/footballManager');

describe('Pinned Fixture Normalization Bug', () => {
  it('should preserve kickoffUtc when normalizing an already-normalized or ESPN fixture', () => {
    const fixture = {
      id: 'espn:12345',
      kickoffUtc: '2026-08-26T19:00:00.000Z',
      status: 'scheduled',
      minute: null,
      homeTeam: { id: '', name: 'Arsenal', crest: '' },
      awayTeam: { id: '', name: 'Chelsea', crest: '' },
      competition: { code: 'PL', name: 'Premier League' },
      score: { home: null, away: null }
    };

    const normalized = normalizeFixture(fixture);
    assert.equal(normalized.kickoffUtc, '2026-08-26T19:00:00.000Z', 'kickoffUtc must not be wiped to null');
    assert.equal(normalized.status, 'scheduled', 'status must be preserved');
  });

  it('should preserve live status and score when normalizing an already-normalized fixture', () => {
    const fixture = {
      id: 'espn:12345',
      kickoffUtc: '2026-08-26T19:00:00.000Z',
      status: 'live',
      minute: '45',
      homeTeam: { id: '', name: 'Arsenal', crest: '' },
      awayTeam: { id: '', name: 'Chelsea', crest: '' },
      competition: { code: 'PL', name: 'Premier League' },
      score: { home: 2, away: 1 }
    };

    const normalized = normalizeFixture(fixture);
    assert.equal(normalized.kickoffUtc, '2026-08-26T19:00:00.000Z');
    assert.equal(normalized.status, 'live');
    assert.equal(normalized.score.home, 2);
    assert.equal(normalized.score.away, 1);
  });

  it('should preserve kickoffUtc when togglePinnedFixture is called with a fixture', () => {
    const fixture = {
      id: 'espn:12345',
      kickoffUtc: '2026-08-26T19:00:00.000Z',
      status: 'scheduled',
      homeTeam: { id: '', name: 'Arsenal', crest: '' },
      awayTeam: { id: '', name: 'Chelsea', crest: '' },
      competition: { code: 'PL', name: 'Premier League' },
      score: { home: null, away: null }
    };

    const pinnedList = togglePinnedFixture([], fixture);
    assert.equal(pinnedList.length, 1);
    assert.equal(pinnedList[0].kickoffUtc, '2026-08-26T19:00:00.000Z', 'pinned fixture kickoffUtc must not be null');
  });
});
