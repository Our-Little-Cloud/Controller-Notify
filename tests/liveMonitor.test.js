const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createLiveMonitor } = require('../src/main/liveMonitor');

// Lightweight in-memory fake store satisfying electron-store interface
function createFakeStore(initialData = {}) {
  const data = { ...initialData };
  return {
    store: data,
    get: (key, defaultValue) => (data[key] !== undefined ? data[key] : defaultValue),
    set: (key, value) => {
      data[key] = value;
    }
  };
}

describe('LiveMonitor Deep Module Tests', () => {
  describe('1. Polling & Stream Detection', () => {
    it('should detect newly live stream and trigger onStreamLive callback', async () => {
      const store = createFakeStore({
        channels: [
          { id: 'UC123', handle: '@streamer1', title: 'Streamer One', enabled: true, isLive: false }
        ]
      });

      let detectedStream = null;
      let liveEventFired = false;

      const mockCheckFn = async () => ({
        isLive: true,
        videoId: 'vid999',
        title: 'Championship Live Match',
        channelTitle: 'Streamer One',
        thumbnail: 'https://img.youtube.com/vi/vid999/hqdefault.jpg'
      });

      const monitor = createLiveMonitor({
        store,
        checkLiveStatusFn: mockCheckFn,
        paceMs: 0,
        onStreamLive: (stream) => {
          detectedStream = stream;
          liveEventFired = true;
        }
      });

      const status = await monitor.checkNow(false);

      assert.equal(liveEventFired, true);
      assert.equal(detectedStream.videoId, 'vid999');
      assert.equal(status.isLive, true);
      assert.equal(status.status, 'live');
      assert.equal(status.liveChannels.length, 1);

      // Verify channel was recorded into history
      const history = monitor.getHistory();
      assert.equal(history.length, 1);
      assert.equal(history[0].videoId, 'vid999');
      assert.equal(history[0].title, 'Championship Live Match');
    });

    it('should not re-trigger onStreamLive if videoId has not changed (deduplication)', async () => {
      const store = createFakeStore({
        channels: [
          { id: 'UC123', handle: '@streamer1', title: 'Streamer One', enabled: true, isLive: false }
        ]
      });

      let callCount = 0;
      const mockCheckFn = async () => ({
        isLive: true,
        videoId: 'vid999',
        title: 'Championship Live Match'
      });

      const monitor = createLiveMonitor({
        store,
        checkLiveStatusFn: mockCheckFn,
        paceMs: 0,
        onStreamLive: () => {
          callCount++;
        }
      });

      await monitor.checkNow(false);
      assert.equal(callCount, 1);

      // Second check with same video ID
      await monitor.checkNow(false);
      assert.equal(callCount, 1); // Deduplicated, should not fire again
    });
  });

  describe('2. History Management', () => {
    it('should mark history item as clicked and clear history on demand', async () => {
      const store = createFakeStore();
      const monitor = createLiveMonitor({ store });

      monitor.addToHistory({
        videoId: 'videoA',
        title: 'Stream A',
        channelTitle: 'Creator A'
      });

      let history = monitor.getHistory();
      assert.equal(history.length, 1);
      assert.equal(history[0].clicked, false);

      monitor.markHistoryClicked('videoA');
      history = monitor.getHistory();
      assert.equal(history[0].clicked, true);

      monitor.clearHistory();
      assert.equal(monitor.getHistory().length, 0);
    });
  });

  describe('3. Offline & Unconfigured Channel Handling', () => {
    it('should report not_configured when no channels or legacy URLs exist', async () => {
      const store = createFakeStore({ channels: [] });
      const monitor = createLiveMonitor({ store });

      const status = await monitor.checkNow(false);
      assert.equal(status.status, 'not_configured');
      assert.equal(status.isLive, false);
    });

    it('should report offline when channel is offline', async () => {
      const store = createFakeStore({
        channels: [
          { id: 'UC123', handle: '@offlineStreamer', enabled: true }
        ]
      });

      const mockCheckFn = async () => ({ isLive: false });
      const monitor = createLiveMonitor({
        store,
        checkLiveStatusFn: mockCheckFn,
        paceMs: 0
      });

      const status = await monitor.checkNow(false);
      assert.equal(status.status, 'offline');
      assert.equal(status.isLive, false);
    });
  });
});
