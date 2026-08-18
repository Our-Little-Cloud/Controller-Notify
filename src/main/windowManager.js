/**
 * WindowManager deep module for Controller Notify.
 * Encapsulates BrowserWindow creation, screen geometry calculations,
 * smooth sliding animation physics, auto-hide timers, and destruction safety.
 */

const { BrowserWindow, screen } = require('electron');
const path = require('path');

/**
 * Calculates screen coordinates for the notification popup based on corner preference.
 *
 * @param {string} corner - 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
 * @param {number} workWidth - Display work area width
 * @param {number} workHeight - Display work area height
 * @param {number} popupWidth - Width of the popup (320px)
 * @param {number} popupHeight - Height of the popup (140px)
 * @returns {{ x: number, startY: number, targetY: number, exitY: number }}
 */
function calculatePopupCoordinates(corner, workWidth, workHeight, popupWidth = 320, popupHeight = 140) {
  let x = workWidth - popupWidth;
  let targetY = workHeight - popupHeight;
  let startY = workHeight;
  let exitY = workHeight;

  switch (corner) {
    case 'bottom-left':
      x = 0;
      targetY = workHeight - popupHeight;
      startY = workHeight;
      exitY = workHeight;
      break;
    case 'top-right':
      x = workWidth - popupWidth;
      targetY = 0;
      startY = -popupHeight;
      exitY = -popupHeight;
      break;
    case 'top-left':
      x = 0;
      targetY = 0;
      startY = -popupHeight;
      exitY = -popupHeight;
      break;
    case 'bottom-right':
    default:
      x = workWidth - popupWidth;
      targetY = workHeight - popupHeight;
      startY = workHeight;
      exitY = workHeight;
      break;
  }

  return { x, startY, targetY, exitY };
}

/**
 * Factory function creating a WindowManager instance.
 *
 * @param {object} options
 * @param {object} options.store - electron-store instance
 */
function createWindowManager({ store } = {}) {
  let settingsWindow = null;
  let popupWindow = null;
  let playerWindow = null;
  let autoHideTimer = null;
  let isQuitting = false;

  function createSettingsWindow() {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      if (settingsWindow.isMinimized()) {
        settingsWindow.restore();
      }
      settingsWindow.show();
      settingsWindow.focus();
      return settingsWindow;
    }

    settingsWindow = new BrowserWindow({
      width: 580,
      height: 620,
      frame: false,
      resizable: false,
      icon: path.join(__dirname, '../../assets/icon.png'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true
      },
      title: 'Controller Notify - Settings'
    });

    settingsWindow.loadFile(path.join(__dirname, '../renderer/settings/index.html'));

    settingsWindow.on('closed', () => {
      settingsWindow = null;
    });

    return settingsWindow;
  }

  function getSettingsWindow() {
    return settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : null;
  }

  function broadcastToSettings(channel, data) {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      try {
        settingsWindow.webContents.send(channel, data);
      } catch (err) {
        console.warn(`Failed to broadcast ${channel} to settingsWindow:`, err.message);
      }
    }
  }

  function createPopupWindow(streamData) {
    // Clean up any existing active popup
    if (popupWindow && !popupWindow.isDestroyed()) {
      try {
        popupWindow.destroy();
      } catch (e) {}
      popupWindow = null;
    }

    if (autoHideTimer) {
      clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const popupWidth = 320;
    const popupHeight = 140;
    const corner = store ? store.get('popupCorner', 'bottom-right') : 'bottom-right';
    const coords = calculatePopupCoordinates(corner, width, height, popupWidth, popupHeight);

    popupWindow = new BrowserWindow({
      width: popupWidth,
      height: popupHeight,
      x: coords.x,
      y: coords.startY,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload-popup.js'),
        nodeIntegration: false,
        contextIsolation: true
      },
      show: false
    });

    const currentWin = popupWindow;
    currentWin.loadFile(path.join(__dirname, '../renderer/popup/index.html'));

    currentWin.webContents.on('did-finish-load', () => {
      if (!currentWin || currentWin.isDestroyed()) return;
      try {
        currentWin.webContents.send('stream-data', streamData);
      } catch (e) {
        console.warn('Failed to send stream-data to popup:', e.message);
      }
      animatePopupIn(currentWin, coords);
    });

    currentWin.on('closed', () => {
      if (popupWindow === currentWin) {
        popupWindow = null;
      }
    });

    return currentWin;
  }

  function animatePopupIn(targetWin, coords) {
    if (!targetWin || targetWin.isDestroyed()) return;

    const startY = coords.startY;
    const targetY = coords.targetY;
    const duration = 400;
    const startTime = Date.now();

    function step() {
      if (!targetWin || targetWin.isDestroyed()) return;
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentY = startY + (targetY - startY) * eased;

      targetWin.setPosition(coords.x, Math.round(currentY));

      if (progress < 1) {
        setTimeout(step, 16);
      } else {
        targetWin.show();
        startAutoHideTimer(targetWin, coords);
      }
    }

    step();
  }

  function animatePopupOut(targetWin = popupWindow, coords = null) {
    if (!targetWin || targetWin.isDestroyed()) return;

    if (autoHideTimer) {
      clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const corner = store ? store.get('popupCorner', 'bottom-right') : 'bottom-right';
    const computedCoords = coords || calculatePopupCoordinates(corner, width, height);

    const startY = targetWin.getPosition()[1];
    const exitY = computedCoords.exitY;
    const duration = 300;
    const startTime = Date.now();

    function step() {
      if (!targetWin || targetWin.isDestroyed()) return;
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = Math.pow(progress, 3);
      const currentY = startY + (exitY - startY) * eased;

      targetWin.setPosition(computedCoords.x, Math.round(currentY));

      if (progress < 1) {
        setTimeout(step, 16);
      } else {
        try {
          targetWin.close();
        } catch (e) {}
      }
    }

    step();
  }

  function startAutoHideTimer(targetWin, coords) {
    const duration = store ? store.get('autoHideDuration', 10000) : 10000;
    if (autoHideTimer) clearTimeout(autoHideTimer);

    autoHideTimer = setTimeout(() => {
      if (targetWin && !targetWin.isDestroyed()) {
        animatePopupOut(targetWin, coords);
      }
    }, duration);
  }

  function openInAppPlayer(url) {
    if (playerWindow && !playerWindow.isDestroyed()) {
      playerWindow.loadURL(url);
      playerWindow.show();
      playerWindow.focus();
      return playerWindow;
    }

    playerWindow = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      },
      title: 'Controller Notify - Live Stream'
    });

    playerWindow.loadURL(url);
    playerWindow.on('closed', () => {
      playerWindow = null;
    });

    return playerWindow;
  }

  function setQuitting(quitting = true) {
    isQuitting = quitting;
  }

  return {
    createSettingsWindow,
    getSettingsWindow,
    broadcastToSettings,
    createPopupWindow,
    animatePopupOut,
    openInAppPlayer,
    setQuitting,
    calculatePopupCoordinates
  };
}

module.exports = {
  createWindowManager,
  calculatePopupCoordinates
};
