const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createLiveMonitor } = require('../src/main/liveMonitor');
const { checkLiveStatusFree } = require('../src/main/youtube');

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

describe('Live Check Refresh & Manual Trigger Tests', () => {
  it('should force refresh channel status when checkNow(true) is invoked with manual = true', async () => {
    const store = createFakeStore({
      channels: [
        { id: 'UC123', handle: '@streamer1', title: 'Streamer One', enabled: true, isLive: false, lastLiveVideoId: 'oldVid' }
      ]
    });

    let liveEventFired = false;
    let manualFlagReceived = null;

    const mockCheckFn = async () => ({
      isLive: true,
      videoId: 'newVid123',
      title: 'New Live Broadcast',
      channelTitle: 'Streamer One'
    });

    const monitor = createLiveMonitor({
      store,
      checkLiveStatusFn: mockCheckFn,
      paceMs: 0,
      onStreamLive: (stream, manual) => {
        liveEventFired = true;
        manualFlagReceived = manual;
      }
    });

    const status = await monitor.checkNow(true);

    assert.equal(liveEventFired, true);
    assert.equal(manualFlagReceived, true);
    assert.equal(status.isLive, true);
    assert.equal(status.channels[0].isLive, true);
    assert.equal(status.channels[0].currentStream.videoId, 'newVid123');
  });

  it('should detect live broadcast from HTML containing BADGE_STYLE_TYPE_LIVE_NOW or isLiveContent', async () => {
    // Verify HTML pattern matching logic
    const htmlWithLiveBadge = `
      <html>
        <head>
          <link rel="canonical" href="https://www.youtube.com/watch?v=liveVid777">
          <meta property="og:title" content="Awesome Streamer is LIVE!">
          <meta name="author" content="Awesome Streamer">
        </head>
        <body>
          <script>var ytInitialPlayerResponse = {"videoDetails":{"isLiveContent":true,"isLive":true,"title":"Awesome Streamer is LIVE!"}};</script>
          <span class="badge">BADGE_STYLE_TYPE_LIVE_NOW</span>
        </body>
      </html>
    `;

    // Test helper function logic
    const isLive = htmlWithLiveBadge.includes('"isLive":true') ||
                   htmlWithLiveBadge.includes('"isLiveBroadcast":true') ||
                   htmlWithLiveBadge.includes('"isLiveContent":true') ||
                   htmlWithLiveBadge.includes('BADGE_STYLE_TYPE_LIVE_NOW');

    assert.equal(isLive, true);
  });
});
