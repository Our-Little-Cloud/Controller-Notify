/**
 * LiveMonitor deep module for Controller Notify.
 * Encapsulates multi-channel background polling, network pacing,
 * live stream deduplication, and notification history persistence.
 */

const { checkLiveStatusUnified } = require('./youtube');
const { migrateChannelsStore } = require('./channelManager');

const HISTORY_KEY = 'notificationHistory';
const MAX_HISTORY = 50;

/**
 * Factory function creating a deep LiveMonitor instance.
 *
 * @param {object} options
 * @param {object} options.store - electron-store instance or compatible storage
 * @param {Function} [options.checkLiveStatusFn] - Live status check function (defaults to checkLiveStatusUnified)
 * @param {Function} [options.onStreamLive] - Callback fired when a new live stream is detected
 * @param {Function} [options.onStatusUpdate] - Callback fired when live status or channel states change
 * @param {number} [options.intervalMs] - Polling interval in ms (default: 20 minutes)
 * @param {number} [options.paceMs] - Inter-channel network delay in ms (default: 300ms)
 */
function createLiveMonitor({
  store,
  checkLiveStatusFn = checkLiveStatusUnified,
  onStreamLive = () => {},
  onStatusUpdate = () => {},
  intervalMs = 20 * 60 * 1000,
  paceMs = 300
} = {}) {
  if (!store) {
    throw new Error('store instance is required for LiveMonitor');
  }

  let timer = null;
  let isChecking = false;
  let lastCheckedTime = null;
  let lastCheckStatus = 'idle'; // 'idle' | 'live' | 'offline' | 'error' | 'not_configured'
  let lastCheckError = null;
  let currentStreamData = null;
  let currentStreamVideoId = null;

  function addToHistory(streamData) {
    if (!streamData || !streamData.videoId) return;
    const history = store.get(HISTORY_KEY, []);
    const exists = history.some(item => item.videoId === streamData.videoId);
    if (exists) return;

    history.unshift({
      videoId: streamData.videoId,
      title: streamData.title,
      channelTitle: streamData.channelTitle,
      thumbnail: streamData.thumbnail,
      timestamp: Date.now(),
      clicked: false
    });
    store.set(HISTORY_KEY, history.slice(0, MAX_HISTORY));
  }

  function getHistory() {
    return store.get(HISTORY_KEY, []);
  }

  function clearHistory() {
    store.set(HISTORY_KEY, []);
    return true;
  }

  function markHistoryClicked(videoId) {
    const history = store.get(HISTORY_KEY, []);
    const item = history.find(h => h.videoId === videoId);
    if (item) {
      item.clicked = true;
      store.set(HISTORY_KEY, history);
    }
    return true;
  }

  function getStatus() {
    const channels = store.get('channels', []);
    const liveChannels = channels.filter(c => c.isLive && c.currentStream);
    return {
      isLive: liveChannels.length > 0,
      streamData: liveChannels.length > 0 ? liveChannels[0].currentStream : currentStreamData,
      liveChannels: liveChannels.map(c => c.currentStream),
      channels,
      lastChecked: lastCheckedTime,
      status: lastCheckStatus,
      error: lastCheckError,
      channelUrl: store.get('channelUrl'),
      channelId: store.get('channelId')
    };
  }

  function notifyStatusChange() {
    const statusSnapshot = getStatus();
    onStatusUpdate(statusSnapshot);
  }

  async function checkNow(manual = false) {
    if (isChecking) return getStatus();
    isChecking = true;

    const apiKey = store.get('apiKey', '');
    let channels = store.get('channels', []);

    // Perform lazy migration if channels list is empty but single channel exists
    if (channels.length === 0) {
      channels = migrateChannelsStore(store.store || store);
      if (channels.length > 0) {
        store.set('channels', channels);
      }
    }

    if (channels.length === 0 && !store.get('channelId') && !store.get('channelUrl')) {
      lastCheckedTime = Date.now();
      lastCheckStatus = 'not_configured';
      lastCheckError = 'No channels configured';
      currentStreamData = null;
      currentStreamVideoId = null;
      isChecking = false;
      notifyStatusChange();
      return getStatus();
    }

    try {
      lastCheckedTime = Date.now();
      const updatedChannels = [...channels];
      const liveChannels = [];

      for (let i = 0; i < updatedChannels.length; i++) {
        const ch = updatedChannels[i];
        if (ch.enabled === false) continue;

        try {
          const result = await checkLiveStatusFn({
            apiKey,
            channelId: ch.id,
            channelUrl: ch.url || ch.handle
          });

          ch.isLive = result.isLive;

          if (result.isLive) {
            ch.currentStream = result;
            liveChannels.push(ch);

            // Check if this is a new live broadcast for this channel
            if (result.videoId !== ch.lastLiveVideoId || manual) {
              ch.lastLiveVideoId = result.videoId;
              addToHistory(result);
              onStreamLive(result, manual);
            }
          } else {
            ch.currentStream = null;
          }

          // Polite inter-channel network pacing
          if (paceMs > 0 && i < updatedChannels.length - 1) {
            await new Promise(res => setTimeout(res, paceMs));
          }
        } catch (channelErr) {
          console.warn(`Error checking channel ${ch.title || ch.id}:`, channelErr.message);
        }
      }

      store.set('channels', updatedChannels);

      const isAnyLive = liveChannels.length > 0;
      if (isAnyLive) {
        lastCheckStatus = 'live';
        lastCheckError = null;
        currentStreamData = liveChannels[0].currentStream;
        currentStreamVideoId = liveChannels[0].currentStream?.videoId;
      } else {
        lastCheckStatus = 'offline';
        lastCheckError = null;
        currentStreamData = null;
        currentStreamVideoId = null;
      }
    } catch (error) {
      lastCheckedTime = Date.now();
      lastCheckStatus = 'error';
      lastCheckError = error.message;
    } finally {
      isChecking = false;
      notifyStatusChange();
    }

    return getStatus();
  }

  function start() {
    stop();
    timer = setInterval(() => checkNow(false), intervalMs);
    checkNow(false);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    start,
    stop,
    checkNow,
    getStatus,
    getHistory,
    clearHistory,
    addToHistory,
    markHistoryClicked
  };
}

module.exports = {
  createLiveMonitor,
  HISTORY_KEY,
  MAX_HISTORY
};
