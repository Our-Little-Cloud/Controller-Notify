const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  filterScheduleFixtures,
  ALL_CUP_CODES,
  LEAGUE_CUPS
} = require('../src/main/footballManager');
const { createEspnProvider } = require('../src/main/football');

describe('Football Side Cups & Categories TDD', () => {
  const sampleFixtures = [
    {
      id: 'fix-pl-1',
      homeTeam: { name: 'Arsenal' },
      awayTeam: { name: 'Chelsea' },
      competition: { code: 'PL', name: 'Premier League' }
    },
    {
      id: 'fix-fa-1',
      homeTeam: { name: 'Manchester City' },
      awayTeam: { name: 'Liverpool' },
      competition: { code: 'ENG-FA', name: 'FA Cup' }
    },
    {
      id: 'fix-lc-1',
      homeTeam: { name: 'Tottenham Hotspur' },
      awayTeam: { name: 'Newcastle United' },
      competition: { code: 'ENG-LC', name: 'Carabao Cup' }
    },
    {
      id: 'fix-cdr-1',
      homeTeam: { name: 'Barcelona' },
      awayTeam: { name: 'Real Madrid' },
      competition: { code: 'ESP-CDR', name: 'Copa del Rey' }
    },
    {
      id: 'fix-ci-1',
      homeTeam: { name: 'Juventus' },
      awayTeam: { name: 'Inter Milan' },
      competition: { code: 'ITA-CI', name: 'Coppa Italia' }
    },
    {
      id: 'fix-bl-1',
      homeTeam: { name: 'Bayern Munich' },
      awayTeam: { name: 'Borussia Dortmund' },
      competition: { code: 'BL1', name: 'Bundesliga' }
    },
    {
      id: 'fix-dfb-1',
      homeTeam: { name: 'RB Leipzig' },
      awayTeam: { name: 'Bayer Leverkusen' },
      competition: { code: 'GER-PK', name: 'DFB-Pokal' }
    }
  ];

  describe('Big 5 League Cup Inclusion', () => {
    it('should include FA Cup and Carabao Cup when PL (Premier League) is selected', () => {
      const filtered = filterScheduleFixtures(sampleFixtures, { leagues: ['PL'] });
      const codes = filtered.map(f => f.competition.code);
      assert.ok(codes.includes('PL'), 'Premier League fixtures must be included');
      assert.ok(codes.includes('ENG-FA'), 'FA Cup fixtures must be included under PL');
      assert.ok(codes.includes('ENG-LC'), 'Carabao Cup fixtures must be included under PL');
      assert.ok(!codes.includes('ESP-CDR'), 'Copa del Rey should not be included under PL');
      assert.ok(!codes.includes('GER-PK'), 'DFB-Pokal should not be included under PL');
    });

    it('should include Copa del Rey when PD (La Liga) is selected', () => {
      const filtered = filterScheduleFixtures(sampleFixtures, { leagues: ['PD'] });
      const codes = filtered.map(f => f.competition.code);
      assert.ok(codes.includes('ESP-CDR'), 'Copa del Rey fixtures must be included under PD');
      assert.ok(!codes.includes('ENG-FA'), 'FA Cup fixtures should not be included under PD');
    });

    it('should include DFB-Pokal when BL1 (Bundesliga) is selected', () => {
      const filtered = filterScheduleFixtures(sampleFixtures, { leagues: ['BL1'] });
      const codes = filtered.map(f => f.competition.code);
      assert.ok(codes.includes('BL1'), 'Bundesliga fixtures must be included');
      assert.ok(codes.includes('GER-PK'), 'DFB-Pokal fixtures must be included under BL1');
      assert.ok(!codes.includes('ENG-LC'), 'Carabao Cup should not be included under BL1');
    });
  });

  describe('Other Cup Category Filtering', () => {
    it('should include all domestic side cup fixtures when __CUPS__ is selected', () => {
      const filtered = filterScheduleFixtures(sampleFixtures, { leagues: ['__CUPS__'] });
      const codes = filtered.map(f => f.competition.code);
      assert.ok(codes.includes('ENG-FA'), 'FA Cup must appear under __CUPS__');
      assert.ok(codes.includes('ENG-LC'), 'Carabao Cup must appear under __CUPS__');
      assert.ok(codes.includes('ESP-CDR'), 'Copa del Rey must appear under __CUPS__');
      assert.ok(codes.includes('ITA-CI'), 'Coppa Italia must appear under __CUPS__');
      assert.ok(codes.includes('GER-PK'), 'DFB-Pokal must appear under __CUPS__');
      assert.ok(!codes.includes('PL'), 'Regular league match should not appear under __CUPS__ unless watched');
      assert.ok(!codes.includes('BL1'), 'Regular league match should not appear under __CUPS__ unless watched');
    });

    it('should allow multi-selecting a league and Other Cup', () => {
      const filtered = filterScheduleFixtures(sampleFixtures, { leagues: ['BL1', '__CUPS__'] });
      const codes = filtered.map(f => f.competition.code);
      assert.ok(codes.includes('BL1'));
      assert.ok(codes.includes('GER-PK'));
      assert.ok(codes.includes('ENG-FA'));
      assert.ok(codes.includes('ESP-CDR'));
    });
  });

  describe('ESPN Cup Scoreboard & Calendar Integration', () => {
    it('fetchFixtures queries default scoreboard without invalid date range', async () => {
      const urlsCalled = [];
      const fetchFn = async (url) => {
        urlsCalled.push(url);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            leagues: [{ name: 'English Carabao Cup' }],
            events: [
              {
                id: 'espn-cup-1',
                date: '2026-09-17T18:30Z',
                status: { type: { state: 'post', completed: true } },
                competitions: [{
                  competitors: [
                    { homeAway: 'home', score: 2, team: { displayName: 'Manchester City' } },
                    { homeAway: 'away', score: 1, team: { displayName: 'Norwich City' } }
                  ]
                }]
              }
            ]
          })
        };
      };

      const provider = createEspnProvider({ fetchFn });
      const fixtures = await provider.fetchFixtures('ENG-LC', '2026-09-15', '2026-09-22');

      assert.equal(fixtures.length, 1);
      assert.equal(fixtures[0].competition.code, 'ENG-LC');
      assert.equal(fixtures[0].homeTeam.name, 'Manchester City');
      assert.equal(fixtures[0].awayTeam.name, 'Norwich City');
      // Must not contain failing hyphenated date range
      assert.ok(!urlsCalled.some(u => u.includes('dates=20260915-20260922')));
      assert.ok(urlsCalled.some(u => u.endsWith('/eng.league_cup/scoreboard')));
    });
  });
});
