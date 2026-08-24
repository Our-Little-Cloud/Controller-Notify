const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { checkLiveStatus, getChannelIdFromUrl, checkLiveStatusFree, checkLiveStatusUnified } = require('./youtube');
const {
  normalizeChannel,
  parseSubscriptionsCsv,
  addChannelToList,
  removeChannelFromList,
  toggleChannelEnabled,
  migrateChannelsStore
} = require('./channelManager');
const { createLiveMonitor, HISTORY_KEY, MAX_HISTORY } = require('./liveMonitor');
const { LEAGUES, createEspnProvider } = require('./football');
const {
  loadBigClubs,
  searchBigClubs,
  addFavoriteTeam,
  removeFavoriteTeam,
  togglePinnedFixture,
  normalizeFixture,
  isBigMatch,
  isWatchedFixture,
  normalizeClubName
} = require('./footballManager');
const { createFootballMonitor, FIXTURES_KEY } = require('./footballMonitor');
require('dotenv').config();

// Performance & low-memory Chromium command line switches
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=64');

const store = new Store({
  clearInvalidConfig: true,
  deserialize: (text) => JSON.parse(typeof text === 'string' ? text.replace(/^\uFEFF/, '') : text),
  defaults: {
    apiKey: process.env.YOUTUBE_API_KEY || '',
    channels: [],
    channelId: '',
    channelUrl: '',
    popupCorner: 'bottom-right',
    autoHideDuration: 10000,
    showNotifications: true,
    openInBrowser: true,
    launchAtStartup: false,
    controllerImage: '',
    footballEnabled: true,
    footballApiKey: '',
    footballFavoriteTeams: [],
    footballPinnedFixtures: [],
    footballLeagues: ['PL', 'PD', 'BL1', 'CL'],
    footballAllLeagues: true,
    footballCupsEnabled: true,
    footballLiveBoost: true,
    matchReminderMinutes: 15,
    matchEventLog: {},
    matchHistory: []
  }
});

// Run initial migration for existing single-channel configs
const initialChannels = migrateChannelsStore(store.store);
if (initialChannels.length > 0 && (!store.get('channels') || store.get('channels').length === 0)) {
  store.set('channels', initialChannels);
} else {
  const existingChannels = store.get('channels', []);
  if (Array.isArray(existingChannels) && existingChannels.length > 0) {
    store.set('channels', existingChannels.map(normalizeChannel));
  }
}

let tray = null;
let isQuitting = false;

// Initialize deep WindowManager module
const windowManager = require('./windowManager').createWindowManager({ store });

// --- Football wiring -------------------------------------------------------

let bigClubsCache = null;
try {
  bigClubsCache = loadBigClubs();
} catch (err) {
  console.error('Failed to load bundled big-clubs list:', err.stack || err);
}

let footballMonitor = null;

function buildFootballMonitor() {
  if (footballMonitor) footballMonitor.stop();
  const logFootballError = (err) => {
    console.error('[FootballMonitor]', err && err.stack ? err.stack : err);
  };
  // football-data.org deprecated: ESPN is now the sole data source
  // (schedules via scoreboards/extras + per-team schedules for resolved favorites).
  const fdProvider = null;
  const espnProvider = createEspnProvider({
    fetchFn: (url) => fetch(url),
    onError: logFootballError
  });

  footballMonitor = createFootballMonitor({
    store,
    favoriteTeams: store.get('footballFavoriteTeams', []),
    pinnedFixtures: store.get('footballPinnedFixtures', []),
    leagues: store.get('footballAllLeagues', true)
      ? LEAGUES.map(l => l.code)
      : store.get('footballLeagues', ['PL', 'PD', 'BL1', 'CL']),
    cupsEnabled: store.get('footballCupsEnabled', true),
    reminderMinutes: store.get('matchReminderMinutes', 15),
    liveBoost: store.get('footballLiveBoost', true),
    espnProvider,
    fdProvider,
    onFixtureEvent: (event) => {
      if (!store.get('showNotifications', true)) return;
      const { type: eventType, ...rest } = event;
      const payload = {
        ...rest,
        eventType,
        type: 'football',
        theme: store.get('theme', 'pink'),
        reminderMinutes: store.get('matchReminderMinutes', 15)
      };
      windowManager.createPopupWindow(payload);
    },
    onError: logFootballError,
    onStatusUpdate: () => broadcastFootballStatus()
  });
  return footballMonitor;
}

function isFootballEnabled() {
  return store.get('footballEnabled', true) === true;
}

function startFootballIfEnabled() {
  if (isFootballEnabled()) {
    buildFootballMonitor().start();
  } else if (footballMonitor) {
    footballMonitor.stop();
  }
}

// Wiring-level guard: disabled football IPC resolves {disabled:true} (plan §2.6)
function guardFootball(handlerFn) {
  return async (...args) => {
    if (!isFootballEnabled()) {
      return { success: false, disabled: true };
    }
    try {
      return await handlerFn(...args);
    } catch (err) {
      console.error('[Football IPC]', err && err.stack ? err.stack : err);
      return { success: false, error: err.message };
    }
  };
}


// Initialize deep LiveMonitor module
const liveMonitor = createLiveMonitor({
  store,
  checkLiveStatusFn: checkLiveStatusUnified,
  onStreamLive: (streamData) => {
    if (store.get('showNotifications', true)) {
      const payload = { theme: store.get('theme', 'pink'), ...streamData };
      windowManager.createPopupWindow(payload);
    }
  },
  onStatusUpdate: (statusSnapshot) => {
    const isAnyLive = statusSnapshot.isLive;
    updateTrayIcon(isAnyLive);
    updateTrayTooltip(isAnyLive, statusSnapshot.liveChannels);
    windowManager.broadcastToSettings('live-status-updated', statusSnapshot);
  }
});

function updateTrayContextMenu() {
  if (!tray) return;
  const showNotifs = store.get('showNotifications', true);

  const template = [
    {
      label: 'Check Now',
      click: async () => {
        // Corner-popup feedback instead of OS notifications (fully deprecated)
        const status = await Promise.resolve(liveMonitor.checkNow(true));
        const liveCount = (status.liveChannels || []).length;
        if (liveCount === 0) {
          windowManager.createPopupWindow({
            theme: store.get('theme', 'pink'),
            title: 'Nobody is live right now',
            channelTitle: `Checked ${(status.channels || []).length} channels`
          });
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Show Notifications',
      type: 'checkbox',
      checked: showNotifs,
      click: (menuItem) => {
        store.set('showNotifications', menuItem.checked);
        windowManager.broadcastToSettings('notification-setting-changed', menuItem.checked);
      }
    }
  ];

  template.push(
    { label: 'Settings', click: () => windowManager.createSettingsWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  );

  tray.setContextMenu(Menu.buildFromTemplate(template));
}

function createTray() {
  const iconPath = path.join(__dirname, '../../assets/tray-icon.png');
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  updateTrayTooltip(false);
  updateTrayContextMenu();
  
  tray.on('click', () => windowManager.createSettingsWindow());
  tray.on('double-click', () => windowManager.createSettingsWindow());
}

function updateTrayTooltip(isLive, liveChannels = []) {
  if (!tray) return;
  const channels = store.get('channels', []);
  if (isLive && liveChannels.length > 0) {
    const titles = liveChannels.map(c => c.title || c.handle || 'Streamer');
    const display = titles.slice(0, 2).join(', ') + (titles.length > 2 ? ` +${titles.length - 2} more` : '');
    tray.setToolTip(`🎮 ${display} is LIVE!`);
    return;
  }

  // Football: live or next watched fixture (Q12)
  if (isFootballEnabled() && footballMonitor) {
    const fb = footballMonitor.getStatus();
    if (fb.liveWatched && fb.liveWatched.length > 0) {
      const m = fb.liveWatched[0];
      const score = m.score && m.score.home != null ? ` ${m.score.home}-${m.score.away}` : '';
      tray.setToolTip(`⚽ LIVE:${score} ${m.homeTeam.name} vs ${m.awayTeam.name}`);
      return;
    }
    if (fb.nextWatched) {
      const f = fb.nextWatched;
      const time = new Date(f.kickoffUtc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      tray.setToolTip(`⚽ Next: ${f.homeTeam.name} vs ${f.awayTeam.name} · ${time}`);
      return;
    }
  }

  const count = channels.length;
  const name = count === 1 ? (channels[0].title || channels[0].handle || 'Streamer') : `${count} channels`;
  tray.setToolTip(count > 0 ? `Controller Notify is watching ${name}...` : 'Controller Notify (No channels configured)');
}

function updateTrayIcon(isLive) {
  if (!tray) return;
  const iconName = isLive ? 'tray-icon-live.png' : 'tray-icon.png';
  const iconPath = path.join(__dirname, '../../assets/', iconName);
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray.setImage(trayIcon);
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    windowManager.createSettingsWindow();
  });

  app.whenReady().then(() => {
    createTray();
    liveMonitor.start();
    startFootballIfEnabled();
    
    const launchAtStartup = store.get('launchAtStartup');
    app.setLoginItemSettings({ openAtLogin: launchAtStartup });
    
    // Open settings window on initial launch so the user sees the app
    windowManager.createSettingsWindow();
    
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) windowManager.createSettingsWindow();
    });
  });
}

app.on('window-all-closed', () => {
  // Don't quit if tray exists (app runs in background)
  if (tray) return;
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  windowManager.setQuitting(true);
  liveMonitor.stop();
  if (footballMonitor) footballMonitor.stop();
});

ipcMain.handle('get-settings', () => {
  return { ...store.store };
});

ipcMain.handle('save-settings', async (_, settings) => {
  const oldApiKey = store.get('apiKey');
  const oldChannelId = store.get('channelId');
  const oldChannelUrl = store.get('channelUrl');
  
  if (settings.channelUrl && (settings.channelUrl !== oldChannelUrl || !settings.channelId)) {
    try {
      const resolved = await getChannelIdFromUrl(settings.apiKey || oldApiKey, settings.channelUrl);
      if (resolved) {
        settings.channelId = resolved;
      }
    } catch (e) {
      // Keep provided or existing channelId if resolution fails
    }
  }

  Object.keys(settings).forEach(key => store.set(key, settings[key]));
  
  if (settings.launchAtStartup !== undefined) {
    app.setLoginItemSettings({ openAtLogin: settings.launchAtStartup });
  }
  
  const apiKeyChanged = settings.apiKey !== oldApiKey;
  const channelChanged = settings.channelId !== oldChannelId;
  const notifsChanged = settings.showNotifications !== undefined;
  
  if (notifsChanged) {
    updateTrayContextMenu();
  }
  
  if (apiKeyChanged || channelChanged) {
    liveMonitor.checkNow(false);
  }

  return { success: true, channelId: settings.channelId };
});

ipcMain.handle('get-live-status', () => {
  return liveMonitor.getStatus();
});

ipcMain.handle('check-live-now', async () => {
  return await liveMonitor.checkNow(true);
});

ipcMain.on('open-stream-url', (_, target) => {
  if (typeof target === 'string' && (target.startsWith('https://') || target.startsWith('http://'))) {
    shell.openExternal(target);
    return;
  }
  const id = target || currentStreamVideoId;
  if (id) {
    const url = `https://www.youtube.com/watch?v=${id}`;
    if (store.get('openInBrowser')) {
      shell.openExternal(url);
    } else {
      openInAppPlayer(url);
    }
  } else {
    const channelUrl = store.get('channelUrl');
    if (channelUrl) {
      const url = channelUrl.startsWith('http')
        ? channelUrl
        : `https://youtube.com/${channelUrl.startsWith('@') ? '' : '@'}${channelUrl}`;
      shell.openExternal(url);
    }
  }
});

ipcMain.on('open-external-url', (_, rawUrl) => {
  if (!rawUrl || typeof rawUrl !== 'string') return;
  let url = rawUrl.trim();
  if (!url) return;

  if (url.startsWith('https://') || url.startsWith('http://')) {
    shell.openExternal(url);
  } else if (url.startsWith('@')) {
    shell.openExternal(`https://www.youtube.com/${url}`);
  } else if (url.startsWith('UC') && url.length === 24) {
    shell.openExternal(`https://www.youtube.com/channel/${url}`);
  } else if (url.startsWith('youtube.com') || url.startsWith('www.youtube.com')) {
    shell.openExternal(`https://${url}`);
  } else {
    shell.openExternal(`https://www.youtube.com/@${url.replace(/^@/, '')}`);
  }
});

ipcMain.handle('test-api', async (_, { apiKey, channelId, channelUrl }) => {
  try {
    const input = (channelUrl || channelId || '').trim();
    if (!input) {
      return { success: false, error: 'Channel URL, handle, or ID is required' };
    }

    if (apiKey) {
      try {
        let resolvedChannelId = input;
        try {
          resolvedChannelId = await getChannelIdFromUrl(apiKey, input);
        } catch (resolveErr) {
          // If resolving handle fails with API key, proceed with input if it looks like an ID
        }

        const result = await checkLiveStatus(apiKey, resolvedChannelId);
        return { success: true, isLive: result.isLive, title: result.title, channelId: resolvedChannelId };
      } catch (apiError) {
        // If 429 Too Many Requests or 403 quota exceeded, seamlessly verify via Free Mode!
        const isRateLimit = apiError.message.includes('429') || apiError.message.includes('quota') || apiError.message.includes('403');
        try {
          const freeResult = await checkLiveStatusFree(input);
          return {
            success: true,
            isLive: freeResult.isLive,
            title: freeResult.title,
            channelId: input,
            warning: isRateLimit ? 'API key rate-limited (429) — Connected via Free Mode!' : undefined
          };
        } catch (freeErr) {
          return { success: false, error: apiError.message };
        }
      }
    }

    // Free Mode (no API key configured)
    const result = await checkLiveStatusFree(input);
    return { success: true, isLive: result.isLive, title: result.title, channelId: input };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('resolve-channel-id', async (_, { apiKey, channelUrl }) => {
  try {
    const channelId = await getChannelIdFromUrl(apiKey, channelUrl);
    return { success: true, channelId };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-channels', () => {
  return store.get('channels', []);
});

ipcMain.handle('add-channel', async (_, channelInput) => {
  try {
    if (!channelInput || typeof channelInput !== 'string') {
      return { success: false, error: 'Channel handle or URL is required' };
    }
    const trimmed = channelInput.trim();
    const apiKey = store.get('apiKey');
    let resolvedId = trimmed;

    if (apiKey) {
      try {
        resolvedId = await getChannelIdFromUrl(apiKey, trimmed);
      } catch (e) {
        // Fallback to input
      }
    }

    const currentChannels = store.get('channels', []);
    const updated = addChannelToList(currentChannels, {
      id: resolvedId,
      url: trimmed,
      title: trimmed.replace(/^.*[@/]/, '')
    });

    store.set('channels', updated);
    liveMonitor.checkNow(false);
    return { success: true, channels: updated };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('remove-channel', (_, channelId) => {
  const currentChannels = store.get('channels', []);
  const updated = removeChannelFromList(currentChannels, channelId);
  store.set('channels', updated);
  updateTrayTooltip(false);
  liveMonitor.checkNow(false);
  return { success: true, channels: updated };
});

ipcMain.handle('toggle-channel', (_, { channelId, enabled }) => {
  const currentChannels = store.get('channels', []);
  const updated = toggleChannelEnabled(currentChannels, channelId, enabled);
  store.set('channels', updated);
  liveMonitor.checkNow(false);
  return { success: true, channels: updated };
});

ipcMain.handle('import-subscriptions-csv', (_, csvContent) => {
  try {
    const parsed = parseSubscriptionsCsv(csvContent);
    if (parsed.length === 0) {
      return { success: false, error: 'No valid channels found in CSV' };
    }

    let channels = store.get('channels', []);
    for (const ch of parsed) {
      channels = addChannelToList(channels, ch);
    }

    store.set('channels', channels);
    liveMonitor.checkNow(false);
    return { success: true, count: parsed.length, channels };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-history', () => {
  return liveMonitor.getHistory();
});

ipcMain.handle('clear-history', () => {
  liveMonitor.clearHistory();
  return { success: true };
});

ipcMain.handle('mark-history-clicked', (_, videoId) => {
  liveMonitor.markHistoryClicked(videoId);
  return { success: true };
});

ipcMain.handle('test-notification', (_, customData) => {
  const activeTheme = store.get('theme', 'pink');
  const streamData = {
    videoId: '0muHFBSiybw',
    title: 'lofi hip hop radio 📚 - beats to relax/study to',
    channelTitle: 'Lofi Girl',
    thumbnail: 'https://i.ytimg.com/vi/0muHFBSiybw/hqdefault.jpg',
    theme: activeTheme,
    ...(customData || {})
  };
  windowManager.createPopupWindow(streamData);
  return { success: true };
});

ipcMain.on('close-settings', () => {
  const win = windowManager.getSettingsWindow();
  if (win) win.close();
});

ipcMain.on('minimize-settings', () => {
  const win = windowManager.getSettingsWindow();
  if (win) win.minimize();
});

ipcMain.on('click-stream', (_, targetVideoId, popupType) => {
  let videoId = targetVideoId;
  let type = popupType;

  if (typeof targetVideoId === 'object' && targetVideoId !== null) {
    videoId = targetVideoId.videoId;
    type = targetVideoId.type || type;
  }

  if (type === 'football' || videoId === 'football') {
    const settingsWin = windowManager.createSettingsWindow();
    if (settingsWin && settingsWin.webContents) {
      if (settingsWin.webContents.isLoading()) {
        settingsWin.webContents.once('did-finish-load', () => {
          windowManager.broadcastToSettings('select-tab', 'football');
        });
      } else {
        windowManager.broadcastToSettings('select-tab', 'football');
      }
    }
    windowManager.animatePopupOut();
    return;
  }

  const status = liveMonitor.getStatus();
  const id = videoId || status.streamData?.videoId;
  
  if (id && id !== 'live') {
    const url = `https://www.youtube.com/watch?v=${id}`;
    if (store.get('openInBrowser', true)) {
      shell.openExternal(url);
    } else {
      windowManager.openInAppPlayer(url);
    }
  } else {
    // Robust fallback: open channel URL if specific videoId was not parsed
    const liveCh = status.liveChannels && status.liveChannels.length > 0 ? status.liveChannels[0] : null;
    const url = liveCh?.url || liveCh?.currentStream?.url || (liveCh?.handle ? `https://www.youtube.com/${liveCh.handle.startsWith('@') ? liveCh.handle : '@' + liveCh.handle}` : null) || store.get('channelUrl');
    if (url) {
      shell.openExternal(url.startsWith('http') ? url : `https://www.youtube.com/${url}`);
    }
  }
  windowManager.animatePopupOut();
});

ipcMain.on('close-popup', () => {
  windowManager.animatePopupOut();
});

// --- Football IPC (guarded: {success:false, disabled:true} when off) --------

function broadcastFootballStatus() {
  if (!footballMonitor) return;
  try {
    windowManager.broadcastToSettings('football-status-updated', footballMonitor.getStatus());
    updateTrayTooltip(false);
    updateTrayContextMenu();
  } catch (err) {
    console.error('[Football] status broadcast failed:', err.stack || err);
  }
}

ipcMain.handle('get-football-state', guardFootball(() => ({
  success: true,
  enabled: true,
  apiKey: store.get('footballApiKey', ''),
  favoriteTeams: store.get('footballFavoriteTeams', []),
  pinnedFixtures: store.get('footballPinnedFixtures', []),
  leagues: store.get('footballLeagues', []),
  allLeagues: store.get('footballAllLeagues', true),
  cupsEnabled: store.get('footballCupsEnabled', true),
  liveBoost: store.get('footballLiveBoost', true),
  reminderMinutes: store.get('matchReminderMinutes', 15),
  status: footballMonitor ? footballMonitor.getStatus() : null
})));

ipcMain.handle('get-football-schedule', guardFootball(() => {
  const favorites = store.get('footballFavoriteTeams', []);
  const pins = store.get('footballPinnedFixtures', []);
  return {
    success: true,
    fixtures: store.get(FIXTURES_KEY, []).map(f => ({
      ...f,
      bigMatch: isBigMatch(f),
      watched: isWatchedFixture(f, favorites, pins)
    }))
  };
}));

ipcMain.handle('search-football-teams', guardFootball(async (_, { query = '', competitionCode = '' } = {}) => {
  // football-data.org deprecated — team search runs over the bundled
  // big-clubs list; ESPN per-team schedules cover fixtures after favoriting.
  return {
    success: true,
    source: 'bundled',
    teams: searchBigClubs(bigClubsCache || [], query, { competitionCode }).slice(0, 30)
  };
}));

// Phase 2: resolve a favorite team's ESPN identity (slug + team id) by
// scanning the big-5 league directories once each, cached in-memory.
let espnDirectoryCache = {};
function getEspnProvider() {
  return createEspnProvider({
    fetchFn: (url) => fetch(url),
    onError: (err) => console.error('[ESPN]', err && err.stack ? err.stack : err)
  });
}

async function resolveEspnIdentity(name) {
  const provider = getEspnProvider();
  const slugs = ['ger.1', 'eng.1', 'esp.1', 'ita.1', 'fra.1'];
  for (const slug of slugs) {
    try {
      if (!espnDirectoryCache[slug]) {
        espnDirectoryCache[slug] = await provider.fetchTeamDirectory(slug);
      }
      const hit = espnDirectoryCache[slug].find(t =>
        normalizeClubName(t.name) === normalizeClubName(name)
      );
      if (hit) return { espnSlug: hit.espnSlug, espnTeamId: hit.id };
    } catch (err) {
      console.error(`[Football] ESPN directory ${slug} failed:`, err.stack || err);
    }
  }
  return null;
}

ipcMain.handle('add-favorite-team', guardFootball(async (_, team) => {
  let updated = addFavoriteTeam(store.get('footballFavoriteTeams', []), team);
  // Best-effort: attach ESPN identity so per-team schedules cover cup matches too
  try {
    const identity = await resolveEspnIdentity(team.name || (updated[updated.length - 1] || {}).name);
    if (identity) {
      updated = updated.map(t =>
        normalizeClubName(t.name) === normalizeClubName(team.name || '') ? { ...t, ...identity } : t
      );
    }
  } catch (err) {
    console.error('[Football] ESPN identity resolution failed:', err.stack || err);
  }
  store.set('footballFavoriteTeams', updated);
  startFootballIfEnabled();
  return { success: true, favoriteTeams: updated };
}));

ipcMain.handle('remove-favorite-team', guardFootball((_, teamId) => {
  const updated = removeFavoriteTeam(store.get('footballFavoriteTeams', []), teamId);
  store.set('footballFavoriteTeams', updated);
  return { success: true, favoriteTeams: updated };
}));

ipcMain.handle('toggle-pin-fixture', guardFootball((_, fixture) => {
  const normalized = normalizeFixture(fixture);
  if (!normalized) throw new Error('Invalid fixture data');
  const updated = togglePinnedFixture(store.get('footballPinnedFixtures', []), normalized);
  store.set('footballPinnedFixtures', updated);
  if (footballMonitor) Promise.resolve(footballMonitor.checkWatch()).catch(err =>
    console.error('[Football] watch after pin failed:', err.stack || err));
  return { success: true, pinnedFixtures: updated };
}));

ipcMain.handle('set-football-leagues', guardFootball((_, payload) => {
  // Accepts { all, leagues, cupsEnabled } or a legacy bare array of league codes
  const isArray = Array.isArray(payload);
  const all = isArray ? undefined : payload.all;
  const leagues = isArray ? payload : (payload.leagues || []);
  const cupsEnabled = isArray ? undefined : payload.cupsEnabled;
  if (!Array.isArray(leagues)) throw new Error('leagues must be an array');
  const valid = leagues.filter(c => LEAGUES.some(l => l.code === c));
  store.set('footballLeagues', valid);
  if (all !== undefined) {
    store.set('footballAllLeagues', all === true);
  }
  if (cupsEnabled !== undefined) {
    store.set('footballCupsEnabled', cupsEnabled === true);
  }
  startFootballIfEnabled();
  return {
    success: true,
    allLeagues: store.get('footballAllLeagues', true),
    leagues: valid,
    cupsEnabled: store.get('footballCupsEnabled', true)
  };
}));

ipcMain.handle('set-football-enabled', (_, enabled) => {
  store.set('footballEnabled', enabled === true);
  startFootballIfEnabled();
  updateTrayContextMenu();
  windowManager.broadcastToSettings('football-setting-changed', enabled === true);
  return { success: true, enabled: enabled === true };
});

ipcMain.handle('check-football-now', guardFootball(async () => {
  if (!footballMonitor) return { success: false, error: 'Football monitor not running' };
  await footballMonitor.checkSweep();
  const status = await footballMonitor.checkWatch();
  broadcastFootballStatus();
  return { success: true, status };
}));

ipcMain.handle('test-football-notification', guardFootball(() => {
  const payload = {
    type: 'football',
    theme: store.get('theme', 'pink'),
    fixtureId: 'test',
    eventType: 'kickoff',
    eventLabel: 'KICKED OFF',
    homeName: 'Arsenal',
    awayName: 'Chelsea',
    homeCrest: '',
    awayCrest: '',
    competitionCode: 'PL',
    scoreHome: null,
    scoreAway: null,
    minute: null
  };
  windowManager.createPopupWindow(payload);
  return { success: true };
}));