/**
 * FootballMonitor deep module for Controller Notify.
 * Two-timer polling (sweeper + watcher), Fixture Event machine
 * (Reminder / Kickoff / Full-time), dedup, and match history persistence.
 * Providers are injected; ESPN failures degrade to fd.org with the original
 * error preserved via onError (never swallowed — CLAUDE.md rule 3).
 */

const {
  isWatchedFixture,
  normalizeClubName
} = require('./footballManager');
const { EXTRA_LEAGUES } = require('./football');

const FIXTURES_KEY = 'footballFixtures';
const EVENT_LOG_KEY = 'matchEventLog';
const HISTORY_KEY = 'matchHistory';
const MAX_HISTORY = 50;

function statusFromEspnState(state) {
  if (state === 'post') return 'finished';
  if (state === 'in') return 'live';
  return 'scheduled';
}

function createFootballMonitor({
  store,
  favoriteTeams = [],
  pinnedFixtures = [],
  leagues = ['PL', 'PD', 'BL1', 'CL'],
  reminderMinutes = 15,
  liveBoost = true,
  cupsEnabled = true,
  espnProvider = null,
  fdProvider = null,
  nowFn = () => Date.now(),
  onFixtureEvent = () => {},
  onStatusUpdate = () => {},
  onError = () => {},
  watchIntervalMs = 75 * 1000,
  sweepIntervalMs = 6 * 60 * 60 * 1000,
  paceMs = 7000
} = {}) {
  if (!store) throw new Error('store instance is required for FootballMonitor');

  let watchTimer = null;
  let sweepTimer = null;
  let lastStatuses = {}; // targetId -> previous status
  let lastSweep = null;
  let lastWatch = null;

  function getFiredLog() {
    return store.get(EVENT_LOG_KEY, {});
  }

  function markFired(targetId, type) {
    const log = getFiredLog();
    if (!log[targetId]) log[targetId] = {};
    log[targetId][type] = true;
    store.set(EVENT_LOG_KEY, log);
  }

  function addHistory(event) {
    const history = store.get(HISTORY_KEY, []);
    history.unshift({
      fixtureId: event.fixtureId,
      type: event.type,
      title: `${event.homeName} vs ${event.awayName}`,
      homeName: event.homeName,
      awayName: event.awayName,
      competitionCode: event.competitionCode,
      scoreHome: event.scoreHome != null ? event.scoreHome : null,
      scoreAway: event.scoreAway != null ? event.scoreAway : null,
      timestamp: Date.now()
    });
    store.set(HISTORY_KEY, history.slice(0, MAX_HISTORY));
  }

  function emit(type, target, extraScore) {
    const event = {
      type,
      fixtureId: target.id,
      homeName: target.homeName,
      awayName: target.awayName,
      competitionCode: target.competitionCode,
      kickoffUtc: target.kickoffUtc,
      scoreHome: extraScore ? extraScore.home : null,
      scoreAway: extraScore ? extraScore.away : null
    };
    markFired(target.id, type);
    addHistory(event);
    try {
      onFixtureEvent(event);
    } catch (err) {
      onError(err, target.id);
    }
  }

  async function processTargets(targets, statuses) {
    const firedLog = getFiredLog();
    const now = nowFn();

    for (const target of targets) {
      const prev = lastStatuses[target.id] || target.cachedStatus || null;
      const cur = statuses.get(target.id) || target.status;

      const fired = firedLog[target.id] || {};

      // Reminder inside [kickoff - reminderMinutes, kickoff)
      const kickoffMs = target.kickoffMs;
      if (
        !fired.reminder &&
        cur === 'scheduled' &&
        kickoffMs != null &&
        now >= kickoffMs - reminderMinutes * 60 * 1000 &&
        now < kickoffMs
      ) {
        emit('reminder', target);
      }

      if (!fired.kickoff && prev === 'scheduled' && cur === 'live') {
        emit('kickoff', target);
      }

      if (!fired.fulltime && cur === 'finished' && prev !== 'finished') {
        emit('fulltime', target, { home: target.scoreHome, away: target.scoreAway });
      }

      lastStatuses[target.id] = cur;
      persistStatus(target, cur);
    }
  }

  function persistStatus(target, status) {
    if (!target.fromCache) return;
    const fixtures = store.get(FIXTURES_KEY, []);
    const idx = fixtures.findIndex(f => f.id === target.id);
    if (idx < 0) return;
    fixtures[idx] = {
      ...fixtures[idx],
      status,
      minute: target.minute,
      score: {
        home: target.scoreHome != null ? target.scoreHome : fixtures[idx].score.home,
        away: target.scoreAway != null ? target.scoreAway : fixtures[idx].score.away
      }
    };
    store.set(FIXTURES_KEY, fixtures);
  }

  /**
   * Watcher tick. Live Boost ON: one ESPN scoreboard pass per league, matched
   * by normalized club names. On failure (or boost OFF): fd.org schedule
   * re-fetch per league containing watched fixtures.
   */
  async function checkWatch() {
    lastWatch = Date.now();
    const now = nowFn();
    const windowStartMs = 30 * 60 * 1000;   // 30 min before kickoff
    const windowEndMs = 2 * 60 * 60 * 1000 + 45 * 60 * 1000; // 2h45m after kickoff

    const cached = store.get(FIXTURES_KEY, []);
    const watchedCached = cached.filter(f =>
      (isWatchedFixture(f, favoriteTeams, pinnedFixtures) ||
        pinnedFixtures.some(p => p.id === f.id)) &&
      (() => {
        // Watcher only polls inside active match windows (plan §2.3)
        if (!f.kickoffUtc) return true;
        const k = Date.parse(f.kickoffUtc);
        return now >= k - windowStartMs && now <= k + windowEndMs;
      })()
    );

    const targets = new Map();
    for (const f of watchedCached) {
      targets.set(f.id, {
        id: f.id,
        homeName: f.homeTeam.name,
        awayName: f.awayTeam.name,
        competitionCode: f.competition.code,
        kickoffUtc: f.kickoffUtc,
        kickoffMs: f.kickoffUtc ? Date.parse(f.kickoffUtc) : null,
        status: f.status,
        cachedStatus: f.status,
        fromCache: true
      });
    }

    let statuses = new Map();

    if (espnProvider && liveBoost) {
      try {
        const states = await espnProvider.fetchLiveState(leagues);
        for (const s of states) {
          const homeKey = normalizeClubName(s.homeName);
          const awayKey = normalizeClubName(s.awayName);

          // Match against cached watched fixtures by club name...
          const match = [...targets.values()].find(t =>
            normalizeClubName(t.homeName) === homeKey && normalizeClubName(t.awayName) === awayKey
          );

          if (match) {
            match.status = statusFromEspnState(s.state);
            match.minute = s.minute;
            match.scoreHome = s.scoreHome;
            match.scoreAway = s.scoreAway;
            statuses.set(match.id, match.status);
          } else if (
            favoriteTeams.some(t =>
              normalizeClubName(t.name) === homeKey || normalizeClubName(t.name) === awayKey
            )
          ) {
            // ...or surface favorite matches not yet in cache (keyless-friendly)
            const pseudoId = `espn:${homeKey}-${awayKey}`;
            const target = {
              id: pseudoId,
              homeName: s.homeName,
              awayName: s.awayName,
              competitionCode: s.competitionCode || '',
              kickoffUtc: s.kickoffUtc || null,
              kickoffMs: s.kickoffUtc ? Date.parse(s.kickoffUtc) : null,
              status: statusFromEspnState(s.state),
              cachedStatus: null,
              fromCache: false,
              minute: s.minute,
              scoreHome: s.scoreHome,
              scoreAway: s.scoreAway
            };
            targets.set(pseudoId, target);
            statuses.set(pseudoId, target.status);
            upsertPseudoFixture(target);
          }
        }
      } catch (err) {
        // Preserve original error context before degrading to fd.org
        err.message = `ESPN Live Boost failed (${err.message}); falling back to football-data.org`;
        onError(err);
        statuses = await fdFallback(watchedCached, targets);
      }
    } else {
      statuses = await fdFallback(watchedCached, targets);
    }

    await processTargets([...targets.values()], statuses);
    onStatusUpdate(getStatus());
    return getStatus();
  }

  /**
   * Keyless favorites: write ESPN-discovered favorite matches into the
   * fixtures cache so the Matches tab shows them even though their
   * competition was never swept. Pruned naturally by sweep cutoff.
   */
  function upsertPseudoFixture(target) {
    const fixtures = store.get(FIXTURES_KEY, []);
    const idx = fixtures.findIndex(f => f.id === target.id);
    const entry = {
      id: target.id,
      kickoffUtc: target.kickoffUtc,
      status: target.status,
      minute: target.minute != null ? target.minute : null,
      homeTeam: { id: '', name: target.homeName, crest: '' },
      awayTeam: { id: '', name: target.awayName, crest: '' },
      competition: { code: target.competitionCode || '', name: target.competitionCode || 'LIVE' },
      score: {
        home: target.scoreHome != null ? target.scoreHome : null,
        away: target.scoreAway != null ? target.scoreAway : null
      },
      pseudo: true
    };
    if (idx >= 0) {
      fixtures[idx] = { ...fixtures[idx], ...entry };
    } else {
      fixtures.push(entry);
    }
    store.set(FIXTURES_KEY, fixtures);
  }

  async function fdFallback(watchedCached, targets) {
    if (!fdProvider) return new Map();
    const statuses = new Map();
    const leagueSet = new Set(
      watchedCached.map(f => f.competition.code).filter(c => leagues.includes(c))
    );
    for (const code of leagueSet) {
      try {
        const dayMs = 24 * 60 * 60 * 1000;
        const from = new Date(nowFn() - dayMs).toISOString().slice(0, 10);
        const to = new Date(nowFn() + 7 * dayMs).toISOString().slice(0, 10);
        const fixtures = await fdProvider.fetchSchedule(code, from, to);
        for (const f of fixtures) {
          const match = [...targets.values()].find(t =>
            normalizeClubName(t.homeName) === normalizeClubName(f.homeTeam.name) &&
            normalizeClubName(t.awayName) === normalizeClubName(f.awayTeam.name)
          ) || (targets.has(f.id) ? targets.get(f.id) : null);
          if (match) {
            match.status = f.status;
            match.minute = f.minute;
            match.scoreHome = f.score.home;
            match.scoreAway = f.score.away;
          }
          statuses.set(match ? match.id : f.id, f.status);
        }
      } catch (err) {
        err.message = `football-data.org ${code} failed during watcher: ${err.message}`;
        onError(err, code);
      }
      if (paceMs > 0 && leagueSet.size > 1) {
        await new Promise(res => setTimeout(res, paceMs));
      }
    }
    return statuses;
  }

  function sameFixture(a, b) {
    if (!a || !b) return false;
    const sameSides =
      normalizeClubName(a.homeTeam && a.homeTeam.name) === normalizeClubName(b.homeTeam && b.homeTeam.name) &&
      normalizeClubName(a.awayTeam && a.awayTeam.name) === normalizeClubName(b.awayTeam && b.awayTeam.name);
    const sameDay = a.kickoffUtc && b.kickoffUtc &&
      new Date(a.kickoffUtc).toDateString() === new Date(b.kickoffUtc).toDateString();
    return sameSides && (sameDay || !a.kickoffUtc || !b.kickoffUtc);
  }

  /** Sweeper tick: refresh schedules — fd.org leagues, ESPN big-5 cups,
   *  and per-team ESPN schedules for resolved favorites. */
  async function checkSweep() {
    lastSweep = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const from = new Date(nowFn() - dayMs).toISOString().slice(0, 10);
    const to = new Date(nowFn() + 7 * dayMs).toISOString().slice(0, 10);
    const merged = new Map(store.get(FIXTURES_KEY, []).map(f => [f.id, f]));

    // Phase 1: ESPN-only cup competitions (big-5), keyless
    if (espnProvider && liveBoost && cupsEnabled) {
      for (let i = 0; i < EXTRA_LEAGUES.length; i++) {
        try {
          const cupFixtures = await espnProvider.fetchFixtures(EXTRA_LEAGUES[i].code, from, to);
          for (const f of cupFixtures) {
            const dup = [...merged.values()].find(existing => existing.id === f.id || sameFixture(existing, f));
            if (!dup) merged.set(f.id, f);
          }
        } catch (err) {
          err.message = `ESPN ${EXTRA_LEAGUES[i].code} sweep failed: ${err.message}`;
          onError(err, EXTRA_LEAGUES[i].code);
        }
        if (paceMs > 0 && i < EXTRA_LEAGUES.length - 1) {
          await new Promise(res => setTimeout(res, paceMs));
        }
      }

      // Phase 2: per-team schedules for favorites resolved with an ESPN identity
      const espnFavorites = favoriteTeams.filter(t => t.espnSlug && t.espnTeamId);
      for (let i = 0; i < espnFavorites.length; i++) {
        const fav = espnFavorites[i];
        try {
          const teamFixtures = await espnProvider.fetchTeamSchedule(fav.espnSlug, fav.espnTeamId);
          for (const f of teamFixtures) {
            const dup = [...merged.values()].find(existing => existing.id === f.id || sameFixture(existing, f));
            if (!dup) merged.set(f.id, { ...f, viaFavorite: fav.name });
          }
        } catch (err) {
          err.message = `ESPN team schedule for ${fav.name} (${fav.espnSlug}/${fav.espnTeamId}) failed: ${err.message}`;
          onError(err, fav.espnSlug);
        }
        if (paceMs > 0 && i < espnFavorites.length - 1) {
          await new Promise(res => setTimeout(res, paceMs));
        }
      }
    }

    if (fdProvider) {
      for (let i = 0; i < leagues.length; i++) {
        const code = leagues[i];
        try {
          const fixtures = await fdProvider.fetchSchedule(code, from, to);
          for (const f of fixtures) merged.set(f.id, f);
        } catch (err) {
          err.message = `football-data.org ${code} sweep failed: ${err.message}`;
          onError(err, code);
        }
        if (paceMs > 0 && i < leagues.length - 1) {
          await new Promise(res => setTimeout(res, paceMs));
        }
      }

      // Favorite teams: fetch their fixtures across ALL competitions so
      // matches outside enabled leagues still surface (plan Q10).
      const keyedFavorites = favoriteTeams.filter(t => t.id && /^\d+$/.test(String(t.id)));
      for (let i = 0; i < keyedFavorites.length; i++) {
        try {
          const teamFixtures = await fdProvider.fetchTeamFixtures(keyedFavorites[i].id, from, to);
          for (const f of teamFixtures) merged.set(f.id, f);
        } catch (err) {
          err.message = `football-data.org team ${keyedFavorites[i].id} fixtures failed: ${err.message}`;
          onError(err, keyedFavorites[i].id);
        }
        if (paceMs > 0 && i < keyedFavorites.length - 1) {
          await new Promise(res => setTimeout(res, paceMs));
        }
      }
    }

    const all = [...merged.values()];
    const cutoff = nowFn() - 2 * dayMs;
    store.set(FIXTURES_KEY, all.filter(f => !f.kickoffUtc || Date.parse(f.kickoffUtc) > cutoff));
    onStatusUpdate(getStatus());
    return getStatus();
  }

  function getStatus() {
    const cached = store.get(FIXTURES_KEY, []);
    const watched = cached.filter(f => isWatchedFixture(f, favoriteTeams, pinnedFixtures));
    const upcoming = watched
      .filter(f => f.status !== 'finished')
      .sort((a, b) => Date.parse(a.kickoffUtc || 0) - Date.parse(b.kickoffUtc || 0));
    return {
      nextWatched: upcoming[0] || null,
      liveWatched: watched.filter(f => f.status === 'live'),
      watchedCount: watched.length,
      lastSweep,
      lastWatch
    };
  }

  function start() {
    stop();
    watchTimer = setInterval(() => {
      Promise.resolve(checkWatch()).catch(err => onError(err));
    }, watchIntervalMs);
    sweepTimer = setInterval(() => {
      Promise.resolve(checkSweep()).catch(err => onError(err));
    }, sweepIntervalMs);
  }

  function stop() {
    if (watchTimer) { clearInterval(watchTimer); watchTimer = null; }
    if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null; }
  }

  return { start, stop, checkWatch, checkSweep, getStatus };
}

module.exports = { createFootballMonitor, FIXTURES_KEY, HISTORY_KEY, EVENT_LOG_KEY };
