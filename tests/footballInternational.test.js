const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { espnSlugFor, codeForEspnSlug, LEAGUES } = require('../src/main/football');

describe('International Competitions — Seam 1: Provider Registry', () => {
  it('resolves ESPN slug for UEFA Nations League (UNL -> uefa.nations)', () => {
    assert.equal(espnSlugFor('UNL'), 'uefa.nations');
  });

  it('resolves league code from ESPN slug (uefa.nations -> UNL)', () => {
    assert.equal(codeForEspnSlug('uefa.nations'), 'UNL');
  });

  it('resolves ESPN slug for International Friendlies (INT-FR -> fifa.friendly)', () => {
    assert.equal(espnSlugFor('INT-FR'), 'fifa.friendly');
  });

  it('resolves league code from ESPN slug (fifa.friendly -> INT-FR)', () => {
    assert.equal(codeForEspnSlug('fifa.friendly'), 'INT-FR');
  });

  it('includes UNL and INT-FR in LEAGUES registry', () => {
    const unl = LEAGUES.find(l => l.code === 'UNL');
    assert.ok(unl, 'UNL must be in LEAGUES');
    assert.equal(unl.espnSlug, 'uefa.nations');

    const fr = LEAGUES.find(l => l.code === 'INT-FR');
    assert.ok(fr, 'INT-FR must be in LEAGUES');
    assert.equal(fr.espnSlug, 'fifa.friendly');
  });
});

const {
  filterScheduleFixtures,
  isBigMatch,
  searchBigClubs,
  ALL_INTERNATIONAL_CODES
} = require('../src/main/footballManager');

describe('International Competitions — Seam 2: Domain Logic & Filtering', () => {
  const internationalFixtures = [
    {
      id: 'fix-unl-1',
      homeTeam: { name: 'France' },
      awayTeam: { name: 'Germany' },
      competition: { code: 'UNL', name: 'UEFA Nations League' }
    },
    {
      id: 'fix-wc-1',
      homeTeam: { name: 'Brazil' },
      awayTeam: { name: 'Argentina' },
      competition: { code: 'WC', name: 'FIFA World Cup' }
    },
    {
      id: 'fix-ec-1',
      homeTeam: { name: 'Spain' },
      awayTeam: { name: 'England' },
      competition: { code: 'EC', name: 'UEFA European Championship' }
    },
    {
      id: 'fix-fr-1',
      homeTeam: { name: 'Portugal' },
      awayTeam: { name: 'Netherlands' },
      competition: { code: 'INT-FR', name: 'International Friendly' }
    },
    {
      id: 'fix-pl-1',
      homeTeam: { name: 'Arsenal' },
      awayTeam: { name: 'Chelsea' },
      competition: { code: 'PL', name: 'Premier League' }
    },
    {
      id: 'fix-unl-small',
      homeTeam: { name: 'Armenia' },
      awayTeam: { name: 'Montenegro' },
      competition: { code: 'UNL', name: 'UEFA Nations League' }
    }
  ];

  it('exports ALL_INTERNATIONAL_CODES with UNL, WC, EC, INT-FR', () => {
    assert.ok(Array.isArray(ALL_INTERNATIONAL_CODES));
    assert.ok(ALL_INTERNATIONAL_CODES.includes('UNL'));
    assert.ok(ALL_INTERNATIONAL_CODES.includes('WC'));
    assert.ok(ALL_INTERNATIONAL_CODES.includes('EC'));
    assert.ok(ALL_INTERNATIONAL_CODES.includes('INT-FR'));
  });

  it('filters all international fixtures when __INTL__ chip is enabled', () => {
    const results = filterScheduleFixtures(internationalFixtures, { leagues: ['__INTL__'] });
    const ids = results.map(r => r.id);
    assert.deepEqual(ids.sort(), ['fix-ec-1', 'fix-fr-1', 'fix-unl-1', 'fix-unl-small', 'fix-wc-1'].sort());
    assert.equal(ids.includes('fix-pl-1'), false);
  });

  it('filters specifically to UNL when UNL chip is enabled', () => {
    const results = filterScheduleFixtures(internationalFixtures, { leagues: ['UNL'] });
    const ids = results.map(r => r.id);
    assert.deepEqual(ids.sort(), ['fix-unl-1', 'fix-unl-small'].sort());
  });

  it('identifies marquee clashes between elite nations as Big Match', () => {
    assert.equal(isBigMatch(internationalFixtures[0]), true, 'France vs Germany should be Big Match');
    assert.equal(isBigMatch(internationalFixtures[1]), true, 'Brazil vs Argentina should be Big Match');
    assert.equal(isBigMatch(internationalFixtures[2]), true, 'Spain vs England should be Big Match');
    assert.equal(isBigMatch(internationalFixtures[3]), true, 'Portugal vs Netherlands should be Big Match');
    assert.equal(isBigMatch(internationalFixtures[5]), false, 'Armenia vs Montenegro should NOT be Big Match');
  });

  it('finds national teams when searching with competitionCode INTL', () => {
    const sampleClubs = [
      { name: 'Arsenal', competitionCode: 'PL', elite: true },
      { name: 'England', competitionCode: 'INTL', elite: true },
      { name: 'France', competitionCode: 'INTL', elite: true },
      { name: 'Spain', competitionCode: 'INTL', elite: true }
    ];
    const results = searchBigClubs(sampleClubs, 'eng', { competitionCode: 'INTL' });
    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'England');
  });
});

const { createFootballMonitor, FIXTURES_KEY } = require('../src/main/footballMonitor');

describe('International Competitions — Seam 3: Monitor & Sweeper', () => {
  function memoryStore(initial = {}) {
    const data = { ...initial };
    return {
      get: (key, def) => (key in data ? data[key] : def),
      set: (key, val) => { data[key] = val; }
    };
  }

  it('sweeps UNL fixtures when __INTL__ is in leagues', async () => {
    const store = memoryStore({ [FIXTURES_KEY]: [] });
    const fetchedLeagues = [];
    const espnProvider = {
      fetchSchedule: async (code) => {
        fetchedLeagues.push(code);
        if (code === 'UNL') {
          return [{
            id: 'espn:unl-123',
            kickoffUtc: new Date(Date.now() + 3600000).toISOString(),
            status: 'scheduled',
            minute: null,
            homeTeam: { id: '448', name: 'England', crest: '' },
            awayTeam: { id: '449', name: 'Germany', crest: '' },
            competition: { code: 'UNL', name: 'UEFA Nations League' },
            score: { home: null, away: null }
          }];
        }
        return [];
      },
      fetchFixtures: async () => []
    };

    const monitor = createFootballMonitor({
      store,
      leagues: ['__INTL__'],
      espnProvider,
      cupsEnabled: false,
      liveBoost: false
    });

    await monitor.checkSweep();

    assert.ok(fetchedLeagues.includes('UNL'), 'checkSweep must query UNL when __INTL__ is enabled');
    const cached = store.get(FIXTURES_KEY, []);
    assert.equal(cached.length, 1);
    assert.equal(cached[0].id, 'espn:unl-123');
    assert.equal(cached[0].homeTeam.name, 'England');
  });

  it('sweeps UNL fixtures when UNL is explicitly in leagues', async () => {
    const store = memoryStore({ [FIXTURES_KEY]: [] });
    const fetchedLeagues = [];
    const espnProvider = {
      fetchSchedule: async (code) => {
        fetchedLeagues.push(code);
        return [];
      },
      fetchFixtures: async () => []
    };

    const monitor = createFootballMonitor({
      store,
      leagues: ['UNL'],
      espnProvider,
      cupsEnabled: false,
      liveBoost: false
    });

    await monitor.checkSweep();
    assert.ok(fetchedLeagues.includes('UNL'), 'checkSweep must query UNL when UNL is enabled');
  });
});

const { resolveEspnIdentity } = require('../src/main/football');

describe('International Competitions — Seam 4: ESPN Identity Resolution', () => {
  it('resolves national team identity using uefa.nations directory', async () => {
    const directoriesChecked = [];
    const mockProvider = {
      fetchTeamDirectory: async (slug) => {
        directoriesChecked.push(slug);
        if (slug === 'uefa.nations') {
          return [
            { id: '448', name: 'England', espnSlug: 'uefa.nations' },
            { id: '449', name: 'France', espnSlug: 'uefa.nations' }
          ];
        }
        return [];
      }
    };

    const identity = await resolveEspnIdentity('England', mockProvider);
    assert.ok(directoriesChecked.includes('uefa.nations'), 'Must scan uefa.nations directory');
    assert.deepEqual(identity, { espnSlug: 'uefa.nations', espnTeamId: '448' });
  });

  it('resolves club teams before national teams if found in club directories', async () => {
    const mockProvider = {
      fetchTeamDirectory: async (slug) => {
        if (slug === 'eng.1') {
          return [{ id: '359', name: 'Arsenal', espnSlug: 'eng.1' }];
        }
        return [];
      }
    };

    const identity = await resolveEspnIdentity('Arsenal', mockProvider);
    assert.deepEqual(identity, { espnSlug: 'eng.1', espnTeamId: '359' });
  });
});



