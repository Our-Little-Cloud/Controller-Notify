const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, Notification } = require('electron');
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
require('dotenv').config();

// Performance & low-memory Chromium command line switches
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=64');

const store = new Store({
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
    controllerImage: ''
  }
});

// Run initial migration for existing single-channel configs
const initialChannels = migrateChannelsStore(store.store);
if (initialChannels.length > 0 && (!store.get('channels') || store.get('channels').length === 0)) {
  store.set('channels', initialChannels);
}

let tray = null;
let isQuitting = false;

// Initialize deep WindowManager module
const windowManager = require('./windowManager').createWindowManager({ store });

// Initialize deep LiveMonitor module
const liveMonitor = createLiveMonitor({
  store,
  checkLiveStatusFn: checkLiveStatusUnified,
  onStreamLive: (streamData, manual) => {
    if (store.get('showNotifications', true)) {
      windowManager.createPopupWindow(streamData);
      if (manual) {
        showNotification('🎮 LIVE!', `"${streamData.title}" is now live`);
      }
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
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Check Now',
      click: () => {
        if (Notification.isSupported()) {
          new Notification({
            title: 'Controller Notify',
            body: '🔍 Checking monitored channels live status...'
          }).show();
        }
        liveMonitor.checkNow(true);
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
    },
    { label: 'Settings', click: () => windowManager.createSettingsWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  
  tray.setContextMenu(contextMenu);
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
  } else {
    const count = channels.length;
    const name = count === 1 ? (channels[0].title || channels[0].handle || 'Streamer') : `${count} channels`;
    tray.setToolTip(count > 0 ? `Controller Notify is watching ${name}...` : 'Controller Notify (No channels configured)');
  }
}

function updateTrayIcon(isLive) {
  if (!tray) return;
  const iconName = isLive ? 'tray-icon-live.png' : 'tray-icon.png';
  const iconPath = path.join(__dirname, '../../assets/', iconName);
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray.setImage(trayIcon);
}

function showNotification(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body, silent: true }).show();
  }
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

ipcMain.on('open-external-url', (_, url) => {
  if (url && typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
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
  const streamData = customData || {
    videoId: '0muHFBSiybw',
    title: 'lofi hip hop radio 📚 - beats to relax/study to',
    channelTitle: 'Lofi Girl',
    thumbnail: 'https://i.ytimg.com/vi/0muHFBSiybw/hqdefault.jpg'
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

ipcMain.on('click-stream', (_, targetVideoId) => {
  const status = liveMonitor.getStatus();
  const videoId = targetVideoId || status.streamData?.videoId;
  
  if (videoId && videoId !== 'live') {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
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