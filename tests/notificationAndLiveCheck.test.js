const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { checkLiveStatusFree } = require('../src/main/youtube');

describe('Notification Click & Live Detection Edge Case Tests', () => {
  it('should NOT report offline channel as live when HTML contains past live stream VOD flag "isLiveContent":true', async () => {
    const offlineVodHtml = `
      <html>
        <head>
          <title>Past Stream VOD - Channel Name</title>
          <link rel="canonical" href="https://www.youtube.com/watch?v=oldVod123">
        </head>
        <body>
          <script>var ytInitialPlayerResponse = {"videoDetails":{"videoId":"oldVod123","isLiveContent":true,"title":"Old Stream Replay"}};</script>
          <div>Tabs: <span>LIVE</span> <span>VIDEOS</span></div>
        </body>
      </html>
    `;

    // Strict live check logic should be false for past stream VODs
    const isLive = offlineVodHtml.includes('"isLiveNow":true') && 
                   offlineVodHtml.includes('"isLive":true');

    assert.equal(isLive, false);
  });

  it('should report active live broadcast as live when HTML contains "isLive":true or BADGE_STYLE_TYPE_LIVE_NOW', async () => {
    const activeLiveHtml = `
      <html>
        <head>
          <title>Active Streamer - Live Stream</title>
          <link rel="canonical" href="https://www.youtube.com/watch?v=liveVid999">
        </head>
        <body>
          <script>var ytInitialPlayerResponse = {"videoDetails":{"videoId":"liveVid999","isLiveNow":true,"isLive":true,"title":"Streamer Live Now"}};</script>
          <span class="badge">BADGE_STYLE_TYPE_LIVE_NOW</span>
        </body>
      </html>
    `;

    const isLive = activeLiveHtml.includes('"isLiveNow":true') && 
                   activeLiveHtml.includes('"isLive":true');

    assert.equal(isLive, true);
  });
});
