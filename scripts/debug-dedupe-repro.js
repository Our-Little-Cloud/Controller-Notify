const { createEspnProvider } = require('E:/OwnProject/ControllerCutie/src/main/football');
const { createFootballMonitor } = require('E:/OwnProject/ControllerCutie/src/main/footballMonitor');
const { namesMatch } = require('E:/OwnProject/ControllerCutie/src/main/footballManager');
const store = {
  _d: {},
  get(k, d) { return k in this._d ? this._d[k] : d; },
  set(k, v) { this._d[k] = v; }
};
// Simulate the STALE duplicate the user had cached under old spelling/id
store._d['footballFixtures'] = [{
  id: 'espn:bayern-munich-vs-borussia-dortmund@na',
  kickoffUtc: new Date(Date.now() + 3600000).toISOString(),
  status: 'live', minute: "45+3'",
  homeTeam: { id: '', name: 'FC Bayern München', crest: '' },
  awayTeam: { id: '', name: 'Borussia Dortmund', crest: '' },
  competition: { code: '', name: '' }, score: { home: 0, away: 0 }, pseudo: true
}];
const espn = createEspnProvider({
  fetchFn: (u) => fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }),
  onError: (e, s) => console.log('ESPN-ERR', s || '', e.message)
});
const mon = createFootballMonitor({
  store,
  favoriteTeams: [{ id: '', name: 'Bayern Munich', crest: '', competitionCode: 'BL1' }],
  pinnedFixtures: [], leagues: ['PL', 'PD', 'BL1', 'CL'], reminderMinutes: 15, liveBoost: true,
  espnProvider: espn, fdProvider: null, paceMs: 300,
  onFixtureEvent: (e) => console.log('EVENT:', e.type, e.homeName, e.awayName),
  onStatusUpdate: () => {},
  onError: (e) => console.log('ERR:', e.message)
});
(async () => {
  await mon.checkSweep();
  const fx = store.get('footballFixtures', []);
  const sc = fx.filter(f => f.competition.code === 'GER-SC' ||
    (f.homeTeam.name + f.awayTeam.name).toLowerCase().includes('bayern'));
  console.log('supercup/bayern entries:', sc.length);
  sc.forEach(f => console.log(' -', f.id, '|', f.competition.code, '|', f.status, f.minute || ''));
  console.log('watched(FC Bayern München spelling):', namesMatch('FC Bayern München', 'Bayern Munich'));
})();

